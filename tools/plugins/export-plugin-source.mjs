import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, cp, lstat, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { parse } from 'yaml'
import { isExportableSource, sourceFiles } from './source-files.mjs'

const tooling = [
  'tools/plugins/export-source-repository.mjs',
  'tools/plugins/export-plugin-source.mjs',
  'tools/plugins/export-plugin-source.test.mjs',
]
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()

/** Change exactly one importer while retaining every other lockfile byte. New
 * registry resolutions must already exist in the destination snapshot. */
export function mergePluginImporter(destination, source, importer) {
  const before = parse(destination)
  const current = parse(source)
  const selected = current.importers?.[importer]
  if (!selected) throw new Error('Missing selected plugin lockfile importer: ' + importer)
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, record] of Object.entries(selected[field] ?? {})) {
      if (record.version?.startsWith('link:')) continue
      const key = name + '@' + record.version
      if (!(key in (before.snapshots ?? {}))) throw new Error('Selected plugin needs a separately reviewed lockfile resolution: ' + key)
    }
  }
  const escaped = importer.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const pattern = new RegExp(`^  ${escaped}:\\r?\\n[\\s\\S]*?(?=^  \\S|^\\S|(?![\\s\\S]))`, 'mu')
  const block = source.match(pattern)?.[0]
  if (!block) throw new Error('Selected plugin importer is not an ordinary workspace key')
  const newline = destination.includes('\r\n') ? '\r\n' : '\n'
  const normalized = block.replace(/\r?\n/gu, newline)
  if (pattern.test(destination)) return destination.replace(pattern, () => normalized)
  const importerSection = /^importers:\r?\n([\s\S]*?)(?=^\S|(?![\s\S]))/mu.exec(destination)
  if (!importerSection) throw new Error('Destination lockfile has no importers section')
  const start = importerSection.index + importerSection[0].length
  return destination.slice(0, start) + normalized + destination.slice(start)
}

function safeSourcePath(path) {
  return typeof path === 'string' && !isAbsolute(path) && !path.includes('\\')
    && !path.split('/').some(part => part === '..' || part === '' || part === '.')
    && isExportableSource(path)
}

async function assertOrdinaryAncestors(root, path) {
  const parts = relative(root, path).split(/[\\/]/u)
  if (parts.includes('..') || isAbsolute(relative(root, path))) throw new Error('Export path escaped the source repository')
  for (let count = 1; count <= parts.length; count++) {
    const item = join(root, ...parts.slice(0, count))
    const info = await lstat(item).catch(error => { if (error.code === 'ENOENT') return undefined; throw error })
    if (info?.isSymbolicLink()) throw new Error('Refusing to export through a symbolic link: ' + item)
    if (info && count < parts.length && !info.isDirectory()) throw new Error('Export ancestor is not a directory: ' + item)
  }
}

/** A narrow update for independently published plugins. The caller opts into
 * each shared tooling file; other plugins, Skills, catalogs and desktop state
 * retain their exact destination bytes. No commit or push is performed. */
export async function exportPluginSource({ root, destination, plugin, include = [], operationalTooling = tooling }) {
  root = resolve(root)
  destination = resolve(destination)
  await access(join(destination, '.git'))
  if (git(destination, ['status', '--porcelain'])) throw new Error('Refusing to update a dirty source repository')
  const integrations = await json(join(root, 'config/integrations/upstream-sources.json'))
  const matching = Object.entries(integrations).filter(([, entry]) => entry?.package === plugin
    || entry?.source === `plugins/${plugin}`)
  if (matching.length !== 1) throw new Error('Expected one plugin source contract: ' + plugin)
  const [integrationKey, integration] = matching[0]
  if (!/^plugins\/[a-z0-9-]+$/u.test(integration.source)) throw new Error('Plugin source must use the canonical flat layout')
  const prefix = integration.source + '/'
  const manifest = await json(join(root, integration.source, 'package.json'))
  if (manifest.name !== integration.package || manifest.version !== integration.resourceVersion) throw new Error('Selected plugin manifest and source contract differ')
  const dshCommit = git(root, ['-C', 'deepseek-harness', 'rev-parse', 'HEAD'])
  const sourcePin = await json(join(root, 'config/deepseek-harness/upstream.json'))
  const destinationPin = await json(join(destination, 'config/deepseek-harness/upstream.json'))
  if (sourcePin.commit !== dshCommit || destinationPin.commit !== dshCommit) throw new Error('Selective plugin export cannot change the DSH pin')
  const selected = [...new Set([
    ...sourceFiles(root).filter(path => path.startsWith(prefix)),
    ...operationalTooling,
    ...include,
  ])].sort()
  for (const path of selected) {
    if (!safeSourcePath(path)) throw new Error('Private/generated/unsafe source path selected: ' + path)
    await assertOrdinaryAncestors(root, join(root, path))
    const info = await lstat(join(root, path))
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Selected source is not a regular file: ' + path)
    await assertOrdinaryAncestors(destination, join(destination, path))
  }
  const upstreamPath = 'config/integrations/upstream-sources.json'
  // Metadata writes must obey the same path boundary as copied sources. A
  // tracked link can be clean in Git while pointing outside this checkout.
  for (const path of [upstreamPath, 'pnpm-lock.yaml', 'source-provenance.json']) {
    await assertOrdinaryAncestors(destination, join(destination, path))
  }
  const previousIntegrations = await json(join(destination, upstreamPath))
  const nextIntegrations = { ...previousIntegrations, [integrationKey]: integration }
  const sourceLock = await readFile(join(root, 'pnpm-lock.yaml'), 'utf8')
  const priorLock = await readFile(join(destination, 'pnpm-lock.yaml'), 'utf8')
  const nextLock = mergePluginImporter(priorLock, sourceLock, integration.source)
  const priorProvenance = await json(join(destination, 'source-provenance.json'))
  const parent = git(destination, ['rev-parse', 'HEAD'])
  const sourceCommit = git(root, ['rev-parse', 'HEAD'])
  const previous = git(destination, ['ls-files', '-z', '--', integration.source]).split('\0').filter(Boolean)
  const selectedSet = new Set(selected)
  const removed = previous.filter(path => !selectedSet.has(path))
  for (const path of removed) {
    if (!path.startsWith(prefix) || !safeSourcePath(path)) throw new Error('Refusing to remove an unrelated tracked source: ' + path)
    await assertOrdinaryAncestors(destination, join(destination, path))
  }
  const retained = []
  const retainedPaths = git(destination, ['ls-files', '-z']).split('\0').filter(path =>
    path && !path.startsWith(prefix) && !selectedSet.has(path)
    && ![upstreamPath, 'pnpm-lock.yaml', 'source-provenance.json'].includes(path))
  // Large source repositories exceed Windows handle limits with Promise.all.
  for (const path of retainedPaths) {
    const info = await lstat(join(destination, path)).catch(error => { if (error.code === 'ENOENT') return undefined; throw error })
    if (info?.isFile()) retained.push([path, sha256(await readFile(join(destination, path)))])
  }
  for (const path of selected) {
    await mkdir(dirname(join(destination, path)), { recursive: true })
    await cp(join(root, path), join(destination, path))
  }
  for (const path of removed) await unlink(join(destination, path)).catch(error => { if (error.code !== 'ENOENT') throw error })
  await writeFile(join(destination, upstreamPath), JSON.stringify(nextIntegrations, null, 2) + '\n')
  await writeFile(join(destination, 'pnpm-lock.yaml'), nextLock)
  const files = []
  for (const path of [...selected, upstreamPath, 'pnpm-lock.yaml'].sort()) {
    const bytes = await readFile(join(destination, path))
    files.push({ path, size: bytes.length, sha256: sha256(bytes) })
  }
  const receipt = {
    id: manifest.name, version: manifest.version, sourceCommit, dshCommit,
    sourceRepositoryParent: parent, retainedOtherSources: true, publicationAsserted: false,
    files, removed, manifestSha256: sha256(JSON.stringify(files)),
  }
  const updates = (priorProvenance.pluginSourceUpdates ?? []).filter(update => update.id !== manifest.name)
  await writeFile(join(destination, 'source-provenance.json'), JSON.stringify({
    ...priorProvenance, pluginSourceUpdates: [...updates, receipt],
  }, null, 2) + '\n')
  for (const record of retained.filter(Boolean)) {
    const [path, expected] = record
    if (sha256(await readFile(join(destination, path))) !== expected) throw new Error('Unrelated source changed during export: ' + path)
  }
  return receipt
}
