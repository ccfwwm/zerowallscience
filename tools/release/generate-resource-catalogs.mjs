import { createHash, generateKeyPairSync } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { contract, root, releaseRoot, stageRoot } from '../build/paths.mjs'
import { fileDigest, signCatalog, verifyCatalog, verifySignedDocument } from './resource-catalog.mjs'
import { deterministicArchive } from './deterministic-archive.mjs'
import { historicalResources, preserveImmutableResource } from './immutable-resource.mjs'
import { resourceSource, packageSource } from '../build/layout.mjs'
import { resourcePublicationScope } from './resource-publication-scope.mjs'
import { pluginDependencyContract } from './plugin-dependency-contract.mjs'
import { satisfiesPackageRange } from '../commands/package-range.mjs'
import { mergePublishedPlugin } from './targeted-plugin-catalog.mjs'

const publicationArgs = process.argv.slice(2)
const pluginArgument = publicationArgs.indexOf('--plugin')
const { kinds } = resourcePublicationScope(pluginArgument < 0 ? publicationArgs : publicationArgs.filter((_, index) => index !== pluginArgument && index !== pluginArgument + 1))
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
const selectedPlugin = process.argv.includes('--plugin') ? process.argv[process.argv.indexOf('--plugin') + 1] : undefined
if (process.argv.includes('--plugin') && (!selectedPlugin || selectedPlugin.startsWith('--') || kinds.length !== 1 || kinds[0] !== 'plugin' || localOnly || !configured)) throw new Error('Targeted plugin catalogs require --kind plugin --plugin <package-name>, a public base URL and a release signing key')
const records = kinds.includes('plugin') ? JSON.parse(await readFile(join(releaseRoot, 'plugin-packages.json'), 'utf8')).filter(record => !selectedPlugin || record.id === selectedPlugin) : []
if (selectedPlugin && records.length !== 1) throw new Error('Targeted plugin has no unique packed artifact: ' + selectedPlugin)
const resourceVersions = JSON.parse(await readFile(join(root, 'config/catalogs/resource-versions.json'), 'utf8'))
async function entry({ id, version, path, kind, key, metadata = {} }) {
  const size = (await stat(path)).size
  return signCatalog({ id, version, kind, applicationVersion: contract.version,
    dshRange: metadata.dsh ?? { min: '0.2.0-rc.2', max: '0.2.0-rc.2' }, desktopRange: metadata.desktop ?? { min: '8.0.0' },
    platform: ['win32'], architecture: ['x64'], downloadUrl: baseUrl ? `${baseUrl}/${key}` : pathToFileURL(path).href,
    sha256: await fileDigest(path), size, restartRequired: kind === 'plugin', rollbackSupported: kind !== 'mcp', ...metadata }, privateKey, keyId)
}
const integrations = JSON.parse(await readFile(join(root, 'config/integrations/upstream-sources.json'), 'utf8'))
const plugins = await Promise.all(records.map(async record => {
  const sourcePath = record.id.startsWith('@zerowallscience/plugin-') ? join(root, 'plugins', record.id.slice('@zerowallscience/plugin-'.length), 'package.json')
    : record.id === '@zerowallscience/dsh-bundle-science' ? join(await packageSource('dsh-bundle-science'), 'package.json') : undefined
  const source = sourcePath ? await readFile(sourcePath, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return undefined; throw error }) : undefined
  return entry({ ...record, kind: record.kind ?? 'plugin', key: `plugins/${record.id.split('/').at(-1)}/${record.version}/${record.path.split(/[\\/]/).at(-1)}`, metadata: { ...record.manifest, ...pluginDependencyContract(record, source, integrations) } })
}))
if (selectedPlugin) {
  // Preserve the exact signed public entries, including versions older than
  // other pending local builds. Installing one optional plugin must not
  // publish unrelated work or remove catalog resources.
  const response = await fetch(`${baseUrl}/catalogs/plugin-latest.json`, { signal: AbortSignal.timeout(15000), cache: 'no-store' })
  if (!response.ok) throw new Error('Cannot read the published plugin pointer: ' + response.status)
  const pointer = verifySignedDocument(await response.json(), keys)
  if (pointer.resourceKind !== 'plugin' || pointer.localOnly || !pointer.catalog.downloadUrl.startsWith(`${baseUrl}/catalogs/plugin/`)) throw new Error('Published plugin pointer is outside the release store')
  const catalogResponse = await fetch(pointer.catalog.downloadUrl, { signal: AbortSignal.timeout(15000) })
  if (!catalogResponse.ok) throw new Error('Cannot read the published plugin catalog: ' + catalogResponse.status)
  const bytes = Buffer.from(await catalogResponse.arrayBuffer())
  if (bytes.length !== pointer.catalog.size || createHash('sha256').update(bytes).digest('hex') !== pointer.catalog.sha256) throw new Error('Published plugin catalog integrity mismatch')
  const previous = verifyCatalog(JSON.parse(bytes), keys)
  if (previous.kind !== 'plugin' || previous.localOnly) throw new Error('Invalid published plugin catalog')
  const merged = mergePublishedPlugin(previous.resources, plugins[0], keys)
  plugins.splice(0, plugins.length, ...merged)
  await writeFile(join(destination, 'plugin-targeted-baseline.json'), JSON.stringify({ selectedPlugin, pointer, previousCatalog: previous }, null, 2) + '\n')
}
for (const parent of plugins) for (const [id, range] of Object.entries(parent.dependencies ?? {})) {
  const child = plugins.find(resource => resource.id === id)
  if (child && !satisfiesPackageRange(child.version, range)) throw new Error(`Plugin catalog dependency closure is incompatible: ${parent.id} -> ${id}@${range}, selected ${child.version}`)
}
const skills = []
const mcpServers = []
const immutableResources = []
const histories = new Map(await Promise.all(kinds.filter(kind => ['skill', 'mcp'].includes(kind)).map(async kind => [kind, await historicalResources(releaseRoot, kind)])))
async function archiveResource(kind, id, version, source, path) {
  await deterministicArchive(source, path)
  const previous = histories.get(kind).get(id + '@' + version)
  if (previous) immutableResources.push({ kind, id, version, ...await preserveImmutableResource(path, previous.path, previous.sha256) })
}
const sciDirectory = join(stageRoot, 'resources/sci')
if (kinds.includes('mcp') && await stat(join(sciDirectory, 'dist/mcp.cjs')).catch(() => undefined)) {
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
const skillsRoot = join(stageRoot, 'resources/extensions/skills')
for (const name of kinds.includes('skill') ? await readdir(skillsRoot) : []) {
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
  if (!kinds.includes(kind)) continue
  // MCP templates and Python archives are supplied explicitly. Empty feeds
  // advertise no update; they never invent a downloadable or compatible pack.
  const source = JSON.parse(await readFile(join(root, `config/catalogs/${kind}-catalog.json`), 'utf8'))
  for (const resource of source.resources ?? []) if (resource.path) resources.push(await entry({ ...resource, path: resolve(root, resource.path), kind }))
  if (kind === 'python') {
    const version = resourceVersions.python?.['science-dependencies']
    if (!version) throw new Error('Python resource version must be pinned independently from Desktop')
    resources.push(await entry({ id: 'science-dependencies', version, path: await resourceSource('python', 'dependency-manifest.json'), kind, key: `python/layers/science/${version}/dependency-manifest.json`, metadata: { role: 'dependency-manifest', restartRequired: false } }))
    const wheels = JSON.parse(await readFile(await resourceSource('python', 'fallback-wheels.json'), 'utf8'))
    for (const wheel of wheels) resources.push(await entry({ id: `fallback-wheel-${wheel.name}`, version: wheel.version, path: join(releaseRoot, 'python-wheels', wheel.filename), kind, key: `python/wheels/3.12.10-r18/${wheel.filename}`, metadata: { role: 'fallback-wheel', restartRequired: false, rollbackSupported: false, desktop: { min: '8.1.3' } } }))
  }
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
if (kinds.some(kind => ['skill', 'mcp'].includes(kind))) await writeFile(join(releaseRoot, 'immutable-resource-receipt.json'), JSON.stringify(immutableResources, null, 2))
console.log(`Verified catalogs (${kinds.join(', ')}): ${plugins.length} packages, ${skills.length} Skills; localOnly=${localOnly}`)
