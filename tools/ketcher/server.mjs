import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { createServer } from 'node:http'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const documents = new Map()
const pending = new Map()
const uuid = z.string().uuid()
const formats = z.enum(['ket', 'mol', 'smiles', 'cml', 'rxn', 'svg'])
const payload = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value })
const workspace = extra => {
  const value = extra?._meta?.['zerowall/workspace']
  if (typeof value !== 'string' || !isAbsolute(value)) throw new Error('WORKSPACE_REQUIRED: call through the authenticated ZeroWall Host bridge')
  return resolve(value)
}
const document = (id, extra) => {
  const doc = documents.get(id)
  if (!doc || doc.workspace !== workspace(extra)) throw new Error('ARTIFACT_NOT_FOUND: artifact is not open in this workspace')
  return doc
}
const state = doc => doc.closed ? 'closed' : !doc.ready ? 'awaiting_mount' : Date.now() - doc.lastSeen > 7000 ? 'not_mounted' : 'ready'
const safeFile = async (cwd, file) => {
  const target = resolve(cwd, file); const parent = await realpath(dirname(target)); const relativePath = relative(await realpath(cwd), join(parent, target.slice(dirname(target).length + 1)))
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) throw new Error('File must stay inside the workspace')
  try { const actual = relative(await realpath(cwd), await realpath(target)); if (actual.startsWith('..') || isAbsolute(actual)) throw new Error('File symlink escapes workspace'); if ((await stat(target)).size > 8 * 1024 * 1024) throw new Error('Structure file exceeds 8 MiB') } catch (error) { if (error.code !== 'ENOENT') throw error }
  return target
}
async function command(doc, action, args = {}) {
  if (state(doc) !== 'ready') throw new Error(`EDITOR_${state(doc).toUpperCase()}: open and initialize the editor first`)
  const id = randomUUID()
  return await new Promise((accept, reject) => {
    const timer = setTimeout(() => { pending.delete(id); doc.commands = doc.commands.filter(cmd => cmd.id !== id); reject(new Error('EDITOR_TIMEOUT: no editor acknowledgement')) }, 30_000)
    pending.set(id, { artifact: doc.id, accept, reject, timer })
    doc.commands.push({ id, action, args })
  })
}
const http = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1')
    const base = `http://127.0.0.1:${http.address().port}`
    if (req.headers.host !== `127.0.0.1:${http.address().port}` || (req.headers.origin && req.headers.origin !== base)) { res.writeHead(403); return res.end() }
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer')
    if (url.pathname.startsWith('/api/')) {
      const id = url.pathname.slice(5); const doc = documents.get(id)
      if (!doc || req.headers.authorization !== `Bearer ${doc.token}`) { res.writeHead(403); return res.end() }
      res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store')
      if (req.method === 'GET') { doc.lastSeen = Date.now(); return res.end(JSON.stringify({ seed: doc.seed, commands: doc.commands, closed: doc.closed })) }
      if (req.method !== 'POST') { res.writeHead(405); return res.end() }
      let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 8 * 1024 * 1024) throw new Error('Editor response too large') }
      const data = JSON.parse(raw)
      doc.lastSeen = Date.now()
      if (data.ready === true) { doc.ready = true; doc.closed = false }
      if (data.closed === true) { doc.closed = true; doc.ready = false }
      if (typeof data.ket === 'string') {
        await mkdir(join(doc.workspace, '.zerowall', 'chemistry'), { recursive: true })
        await writeFile(await safeFile(doc.workspace, join('.zerowall', 'chemistry', `${doc.id}.ket`)), data.ket)
      }
      const waiting = pending.get(data.id)
      if (waiting?.artifact === id) { clearTimeout(waiting.timer); pending.delete(data.id); doc.commands = doc.commands.filter(cmd => cmd.id !== data.id); if (data.error) waiting.reject(new Error(String(data.error))); else waiting.accept(data.result) }
      return res.end('{"ok":true}')
    }
    if (req.method !== 'GET') { res.writeHead(405); return res.end() }
    const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1))
    const path = resolve(root, 'widget', file)
    if (relative(join(root, 'widget'), path).startsWith('..') || isAbsolute(relative(join(root, 'widget'), path))) { res.writeHead(403); return res.end() }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
    res.setHeader('content-type', types[extname(path)] ?? 'application/octet-stream')
    res.setHeader('Content-Security-Policy', "default-src 'self' blob: data:; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self' blob:")
    res.end(await readFile(path))
  } catch (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 400); res.end(JSON.stringify({ error: String(error.message) })) }
})
await new Promise(accept => http.listen(0, '127.0.0.1', accept))
const server = new McpServer({ name: 'Ketcher Chemistry', version: '3.18.0' })
const handle = fn => async (args, extra) => { try { return await fn(args, extra) } catch (error) { return { ...payload({ status: 'error', error: String(error.message) }), isError: true } } }
server.tool('open_sketcher', 'Open the bundled offline Ketcher editor in the current workspace. Host waits for actual editor readiness; artifact_id reopens a saved structure.', { artifact_id: uuid.optional(), smiles: z.string().optional(), molfile: z.string().optional(), ket: z.string().optional(), rxn: z.string().optional(), filename: z.string().optional() }, handle(async (args, extra) => {
  const cwd = workspace(extra); const id = args.artifact_id ?? randomUUID()
  let seed = args.ket ?? args.molfile ?? args.rxn ?? args.smiles ?? ''
  if (args.filename) seed = await readFile(await safeFile(cwd, args.filename), 'utf8')
  if (args.artifact_id) seed = await readFile(await safeFile(cwd, join('.zerowall', 'chemistry', `${id}.ket`)), 'utf8')
  const doc = { id, workspace: cwd, token: randomBytes(32).toString('hex'), seed, ready: false, closed: false, lastSeen: 0, commands: [] }
  documents.set(id, doc)
  return { ...payload({ artifact_id: id, status: 'awaiting_mount' }), _meta: { 'zerowall/editor': { artifact_id: id, url: `http://127.0.0.1:${http.address().port}/#${id}:${doc.token}` } } }
}))
server.tool('editor_status', 'Inspect actual editor mount/readiness state.', { artifact_id: uuid }, handle(async (args, extra) => payload({ artifact_id: args.artifact_id, status: state(document(args.artifact_id, extra)) })))
server.tool('set_structure', 'Replace editor structure and await acknowledgement. Preserves stereochemistry through KET/Molfile.', { artifact_id: uuid, structure: z.string().min(1).max(8 * 1024 * 1024) }, handle(async (args, extra) => payload({ artifact_id: args.artifact_id, status: 'ready', result: await command(document(args.artifact_id, extra), 'set', { structure: args.structure }) })))
server.tool('get_structure', 'Read the current editor including manual edits.', { artifact_id: uuid, format: formats.default('ket') }, handle(async (args, extra) => payload({ artifact_id: args.artifact_id, format: args.format, structure: await command(document(args.artifact_id, extra), 'get', { format: args.format }) })))
server.tool('highlight_atoms', 'Highlight zero-based atom IDs in the mounted molecular editor.', { artifact_id: uuid, atoms: z.array(z.number().int().nonnegative()).max(10000), color: z.string().regex(/^#[a-fA-F0-9]{6}$/).default('#ff8800') }, handle(async (args, extra) => payload({ artifact_id: args.artifact_id, result: await command(document(args.artifact_id, extra), 'highlight', { atoms: args.atoms, color: args.color }) })))
server.tool('export_structure', 'Save the current structure inside its bound workspace and return its checksum.', { artifact_id: uuid, format: formats.default('ket'), filename: z.string().min(1) }, handle(async (args, extra) => {
  const doc = document(args.artifact_id, extra); const file = await safeFile(doc.workspace, args.filename)
  const structure = await command(doc, 'get', { format: args.format }); if (typeof structure !== 'string') throw new Error('Invalid editor export')
  await writeFile(file, structure)
  return payload({ artifact_id: doc.id, path: file, bytes: Buffer.byteLength(structure), sha256: createHash('sha256').update(structure).digest('hex') })
}))
server.tool('close_sketcher', 'Close a mounted editor after saving its KET structure.', { artifact_id: uuid }, handle(async (args, extra) => { const doc = document(args.artifact_id, extra); await command(doc, 'close'); doc.closed = true; return payload({ artifact_id: doc.id, status: 'closed' }) }))
server.resource('ketcher-editor', 'ui://ketcher/editor', async uri => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ name: 'Ketcher Chemistry', version: '3.18.0', transport: 'authenticated-local-assets', tool: 'open_sketcher' }) }] }))
const shutdown = () => { http.close(); process.exit(0) }
process.stdin.on('end', shutdown); process.on('SIGTERM', shutdown)
await server.connect(new StdioServerTransport())
