import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { parseCredentialKey } from '@deepseek-ai/dsh-credentials'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const moduleUrl = file => process.env.ZEROWALL_HARVEST_MODULE_ROOT
  ? pathToFileURL(join(process.env.ZEROWALL_HARVEST_MODULE_ROOT, 'lib', file)).href
  : new URL('../lib/' + file, import.meta.url).href
const { LocalZoteroWriter } = await import(moduleUrl('save/local-api.js'))
const { savePapers } = await import(moduleUrl('save/index.js'))
const { resolveConfig } = await import(moduleUrl('config.js'))
const { dedupeHits } = await import(moduleUrl('fetch/index.js'))
import { zoteroDispatch } from '../../../tools/packaging/zotero-dispatch.mjs'

const paper = { source: 'crossref', id: '1', title: '中文文献甲', authors: ['王小明'], doi: '10.1234/example', year: 2026 }
async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'harvest-test-'))
  const rows = []; const collections = []; const writes = []; let auth = 0; let uploads = 0
  let serverId = ''
  const records = new Map()
  const credentials = {
    readRecord: async key => { parseCredentialKey(key); return records.get(key) },
    modifyRecord: async (key, mutate) => { parseCredentialKey(key); const next = await mutate(records.get(key)); records.set(key, next); return next },
    deleteRecord: async key => { parseCredentialKey(key); return records.delete(key) },
  }
  const server = createServer(async (req, res) => {
    try {
      res.setHeader('Zotero-Server-ID', serverId)
      res.setHeader('Content-Type', 'application/json')
      const url = new URL(req.url, base)
      const reply = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)) }
      if (url.pathname === '/pdf') { res.end('%PDF-1.7\nfixture'); return }
      if (url.pathname === '/api/') return reply(200, {})
      let body = ''; for await (const chunk of req) body += chunk
      if (url.pathname === '/api/local/authorize') {
        assert.equal(JSON.parse(body).appName, 'ZeroWall Science — Zotero Harvest')
        auth++; return reply(options.deny ? 403 : 200, { key: 'secret-' + auth, remember: !!options.remember })
      }
      if (req.method === 'GET') {
        if (url.pathname.endsWith('/collections')) return reply(200, collections)
        const query = url.searchParams.get('q')?.toLowerCase()
        return reply(200, rows.filter(row => !row.data.parentItem && (!query || row.data.title?.toLowerCase().includes(query) || row.data.DOI === query)))
      }
      if (url.pathname === '/api/local/uploads/abc123') { uploads++; assert.match(body, /^%PDF-/); return reply(200, {}) }
      assert.equal(req.headers['zotero-server-id'], serverId)
      assert.equal(req.headers['zotero-api-key'], 'secret-' + auth)
      writes.push(url.pathname)
      if (options.failWrite) return reply(500, { error: 'failed' })
      if (options.rejected && writes.length === 1) return reply(401, {})
      if (url.pathname.endsWith('/file')) {
        assert.equal(req.headers['if-none-match'], '*')
        const form = new URLSearchParams(body)
        if (form.has('upload')) { assert.equal(form.get('upload'), 'abc123'); res.statusCode = 204; res.end(); return }
        assert.match(form.get('md5'), /^[a-f0-9]{32}$/)
        return reply(200, { url: base + '/api/local/uploads/abc123', uploadKey: 'abc123' })
      }
      const batch = JSON.parse(body); assert.ok(Array.isArray(batch)); assert.equal(batch.length, 1)
      const data = batch[0]; assert.match(data.key, /^[A-Z2-9]{8}$/)
      if (options.batchFailure) return reply(200, { successful: {}, failed: { 0: { message: 'invalid field' } } })
      const row = { key: data.key, data }; (url.pathname.endsWith('/collections') ? collections : rows).push(row)
      return reply(200, { successful: { 0: row }, unchanged: {}, failed: {} })
    } catch (error) { res.statusCode = 500; res.end(String(error)); }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:' + server.address().port
  serverId = 'test-' + server.address().port
  while (!/^[0-9]/.test(createHash('sha256').update(base + '|' + serverId).digest('hex'))) serverId += 'x'
  const cfg = { ...resolveConfig(), credentials, zoteroApiBase: base, inboxDir: root, httpTimeoutMs: 2000 }
  return { cfg, rows, writes, base, root, records, serverId, auth: () => auth, uploads: () => uploads, close: async () => { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }) } }
}
test('authenticated save, collection, native PDF upload, duplicate and UI mapping', async () => {
  const f = await fixture()
  try {
    const result = await savePapers({ cfg: f.cfg, papers: [{ ...paper, pdfUrl: f.base + '/pdf' }], collection: '研究' })
    assert.equal(result.saved, 1); assert.equal(result.requiresImport, false); assert.equal(f.uploads(), 1)
    assert.equal(f.auth(), 5, 'single-use authorization must renew for every write')
    assert.equal(f.rows[0].data.creators[0].name, '王小明'); assert.equal(f.rows[1].data.parentItem, f.rows[0].key)
    const dup = await savePapers({ cfg: f.cfg, papers: [paper] })
    assert.equal(dup.saved, 0); assert.equal(dup.zoteroItems[0].duplicate, true)
    for (const name of ['lit_save', 'tool_dispatch']) {
      const block = { kind: 'tool_result', call: { name, argsRaw: JSON.stringify({ name: 'lit_save', arguments: {} }) }, content: [{ type: 'text', text: JSON.stringify(result) }] }
      assert.equal(zoteroDispatch(block).meta.items[0].ref, result.zoteroItems[0].ref)
    }
  } finally { await f.close() }
})
test('concurrent saves serialize dedup; persistent grant reused', async () => {
  const f = await fixture({ remember: true })
  try {
    const results = await Promise.all([1,2].map(() => savePapers({ cfg: f.cfg, papers: [paper] })))
    assert.equal(results.reduce((n,r) => n+r.saved,0),1); assert.equal(f.rows.length,1); assert.equal(f.auth(),1)
  } finally { await f.close() }
})
for (const [name, options, writes] of [['denial', { deny: true }, 0], ['ambiguous server error', { failWrite: true }, 1], ['batch failure', { batchFailure: true }, 1]]) {
  test(name + ' is not replayed or reported as saved', async () => {
    const f = await fixture(options)
    try { await assert.rejects(savePapers({ cfg: f.cfg, papers: [paper] })); assert.equal(f.writes.length,writes) }
    finally { await f.close() }
  })
}
test('401 expires grant and reauthorizes exactly once', async () => {
  const f = await fixture({ rejected: true, remember: true })
  try { assert.equal((await savePapers({cfg:f.cfg,papers:[paper]})).saved,1); assert.equal(f.auth(),2) }
  finally { await f.close() }
})
test('inbox has no false imported count and distinct Chinese filenames', async () => {
  const f = await fixture()
  try {
    const result = await savePapers({cfg:f.cfg,mode:'inbox',papers:[paper,{...paper,doi:undefined,title:'中文文献乙'}]})
    assert.equal(result.saved,0); assert.equal(result.requiresImport,true); assert.equal(result.zoteroItems.length,0)
    assert.notEqual(result.pending[0], result.pending[1]); assert.match(await readFile(join(result.pending[0],'citation.ris'),'utf8'),/中文文献甲/)
    assert.equal(zoteroDispatch({kind:'tool_result',call:{name:'lit_save',argsRaw:'{}'},content:[{type:'text',text:JSON.stringify(result)}]}),null)
  } finally { await f.close() }
})
test('non-Latin titles remain distinct during fetch deduplication', () => {
  assert.equal(dedupeHits([paper,{...paper,id:'2',doi:undefined,title:'中文文献乙'}]).papers.length,2)
})

test('numeric-leading instance hash reaches native authorization and persists a valid prefixed key', async () => {
 const f = await fixture({remember:true})
 try {
  const writer = new LocalZoteroWriter(f.cfg); await writer.connect()
  assert.deepEqual(await writer.authorizationStatus(),{authorized:false,remember:false})
  const grants=await Promise.all([writer.requestAuthorization(),writer.requestAuthorization()])
  assert.deepEqual(grants[0],{authorized:true,remember:true}); assert.equal(f.auth(),1)
  assert.equal(f.records.size,1)
  const key=[...f.records.keys()][0];assert.match(key,/^zotero-harvest\/zotero-api-[0-9][a-f0-9]{63}$/)
  assert.equal((await savePapers({cfg:f.cfg,papers:[paper]})).saved,1)
  assert.equal(f.auth(),1,'lit_save must reuse authorization from settings')
  await writer.requestAuthorization(true);assert.equal(f.auth(),2)
  assert.equal(JSON.stringify(await writer.authorizationStatus()).includes('secret-'),false)
 } finally { await f.close() }
})
