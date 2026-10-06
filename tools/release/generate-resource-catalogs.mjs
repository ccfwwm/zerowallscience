import { generateKeyPairSync } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { contract, root, releaseRoot, stageRoot } from '../build/paths.mjs'
import { fileDigest, signCatalog, verifyCatalog } from './resource-catalog.mjs'
import { deterministicArchive } from './deterministic-archive.mjs'
import { historicalResources, preserveImmutableResource } from './immutable-resource.mjs'

const destination = join(releaseRoot, 'catalogs')
const catalogGeneration = `${contract.buildId}-${Date.now()}`
await mkdir(destination, { recursive: true })
const configured = process.env.ZEROWALL_RESOURCE_PRIVATE_KEY_FILE
let privateKey, keys, keyId
if (configured) {
  privateKey = await readFile(configured, 'utf8')
  keyId = process.env.ZEROWALL_RESOURCE_KEY_ID ?? 'stable-3'
  keys = JSON.parse(await readFile(join(root, 'config/catalogs/trusted-keys.json'), 'utf8'))
} else {
  // A local validation key is never shipped as a release trust root.
  const directory = join(contract.cache, 'catalogs')
  await mkdir(directory, { recursive: true })
  const keyFile = join(directory, 'development-private.pem')
  const publicFile = join(directory, 'development-keys.json')
  try { privateKey = await readFile(keyFile, 'utf8'); keys = JSON.parse(await readFile(publicFile, 'utf8')) } catch {
    const generated = generateKeyPairSync('ed25519')
    privateKey = generated.privateKey.export({ type: 'pkcs8', format: 'pem' })
    keys = { 'local-development': generated.publicKey.export({ type: 'spki', format: 'pem' }) }
    await writeFile(keyFile, privateKey, { mode: 0o600 })
    await writeFile(publicFile, JSON.stringify(keys))
  }
  keyId = 'local-development'
}
const baseUrl = process.env.ZEROWALL_RESOURCE_BASE_URL?.replace(/\/$/, '')
const localOnly = !baseUrl
const records = JSON.parse(await readFile(join(releaseRoot, 'plugin-packages.json'), 'utf8'))
const resourceVersions = JSON.parse(await readFile(join(root, 'config/catalogs/resource-versions.json'), 'utf8'))
async function entry({ id, version, path, kind, key, metadata = {} }) {
  const size = (await stat(path)).size
  return signCatalog({ id, version, kind, applicationVersion: contract.version,
    dshRange: metadata.dsh ?? { min: '0.2.0-rc.2', max: '0.2.0-rc.2' }, desktopRange: metadata.desktop ?? { min: '8.0.0' },
    platform: ['win32'], architecture: ['x64'], downloadUrl: baseUrl ? `${baseUrl}/${key}` : pathToFileURL(path).href,
    sha256: await fileDigest(path), size, restartRequired: kind === 'plugin', rollbackSupported: kind !== 'mcp', ...metadata }, privateKey, keyId)
}
const plugins = await Promise.all(records.map(record => entry({ ...record, kind: record.kind ?? 'plugin', key: `plugins/${record.id.split('/').at(-1)}/${record.version}/${record.path.split(/[\\/]/).at(-1)}`, metadata: { ...record.manifest, dependencies: record.dependencies } })))
const skills = []
const mcpServers = []
const immutableResources = []
const histories = new Map(await Promise.all(['skill', 'mcp'].map(async kind => [kind, await historicalResources(releaseRoot, kind)])))
async function archiveResource(kind, id, version, source, path) {
  await deterministicArchive(source, path)
  const previous = histories.get(kind).get(id + '@' + version)
  if (previous) immutableResources.push({ kind, id, version, ...await preserveImmutableResource(path, previous.path, previous.sha256) })
}
const sciDirectory = join(stageRoot, 'resources/sci')
if (await stat(join(sciDirectory, 'dist/mcp.cjs')).catch(() => undefined)) {
  const version = '0.3.15-zws.2'
  const directory = join(releaseRoot, 'mcp', 'scimaster', version)
  await mkdir(directory, { recursive: true })
  const path = join(directory, 'scimaster.tgz')
  await archiveResource('mcp', 'scimaster', version, sciDirectory, path)
  mcpServers.push(await entry({ id: 'scimaster', version, path, kind: 'mcp', key: `mcp/scimaster/${version}/scimaster.tgz`, metadata: {
    role: 'server-bundle', runtime: 'node', entrypoint: 'zerowall-mcp-launcher.cjs', rollbackSupported: true,
    server: { name: 'SciMaster 独立服务', serverName: 'scimaster-independent', enabled: false, envRefs: { ZEROWALL_SCIMASTER_API_KEY: 'zerowall.environment.var.scimaster_api_key' } },
  } }))
}
const skillsRoot = join(stageRoot, 'resources/skills')
for (const name of await readdir(skillsRoot)) {
  const source = join(skillsRoot, name)
  if (!(await stat(source)).isDirectory() || !await stat(join(source, 'SKILL.md')).catch(() => undefined)) continue
  const version = resourceVersions.skill[name] ?? '0.1.0'
  const directory = join(releaseRoot, 'skills', name, version)
  await mkdir(directory, { recursive: true })
  const path = join(directory, name + '.tgz')
  await archiveResource('skill', name, version, source, path)
  skills.push(await entry({ id: name, version, path, kind: 'skill', key: `skills/${name}/${version}/${name}.tgz` }))
}
for (const [kind, resources] of [['plugin', plugins], ['skill', skills], ['mcp', mcpServers], ['python', []]]) {
  // MCP templates and Python archives are supplied explicitly. Empty feeds
  // advertise no update; they never invent a downloadable or compatible pack.
  const source = JSON.parse(await readFile(join(root, `config/catalogs/${kind}-catalog.json`), 'utf8'))
  for (const resource of source.resources ?? []) if (resource.path) resources.push(await entry({ ...resource, path: resolve(root, resource.path), kind }))
  if (kind === 'python') resources.push(await entry({ id: 'science-dependencies', version: contract.version, path: join(root, 'resources/python/dependency-manifest.json'), kind, key: `python/layers/science/${contract.version}/dependency-manifest.json`, metadata: { role: 'dependency-manifest', restartRequired: false } }))
  const document = signCatalog({ schema: 1, kind, applicationVersion: contract.version, localOnly,
    generatedAt: new Date().toISOString(), resources }, privateKey, keyId)
  verifyCatalog(document, keys, { local: localOnly })
  const bytes = Buffer.from(JSON.stringify(document, null, 2))
  const catalogPath = join(destination, `${kind}-catalog.json`)
  await writeFile(catalogPath, bytes)
  const versioned = join(destination, kind, contract.version, catalogGeneration)
  await mkdir(versioned, { recursive: true })
  const immutablePath = join(versioned, 'catalog.json')
  await writeFile(immutablePath, bytes, { flag: 'wx' })
  const pointer = signCatalog({ schema: 1, kind: 'pointer', resourceKind: kind, localOnly,
    catalog: { downloadUrl: baseUrl ? `${baseUrl}/catalogs/${kind}/${contract.version}/${catalogGeneration}/catalog.json` : pathToFileURL(immutablePath).href, sha256: await fileDigest(immutablePath), size: bytes.length } }, privateKey, keyId)
  await writeFile(join(destination, `${kind}-latest.json`), JSON.stringify(pointer, null, 2))
}
await writeFile(join(destination, 'verification-keys.json'), JSON.stringify(keys, null, 2))
await writeFile(join(releaseRoot, 'immutable-resource-receipt.json'), JSON.stringify(immutableResources, null, 2))
console.log(`Verified catalogs: ${plugins.length} packages, ${skills.length} Skills; localOnly=${localOnly}`)
