import { createHash, generateKeyPairSync } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { contract, root, releaseRoot, stageRoot } from '../build/paths.mjs'
import { downloadResource, fileDigest, signCatalog, verifyCatalog, verifySignedDocument } from './resource-catalog.mjs'
import { historicalResources, publishedResources } from './immutable-resource.mjs'
import { resourceSource, packageSource } from '../build/layout.mjs'
import { resourcePublicationScope } from './resource-publication-scope.mjs'
import { pluginDependencyContract } from './plugin-dependency-contract.mjs'
import { satisfiesPackageRange } from '../commands/package-range.mjs'
import { mergePublishedPlugins, mergePublishedSkills, selectedPluginArguments, selectedSkillArguments } from './targeted-plugin-catalog.mjs'
import { applyAuditedPluginCompatibility } from './plugin-compatibility.mjs'
import { prepareFallbackWheel } from './python-wheel-artifacts.mjs'
import { RETIRED_PLUGIN_IDS } from '../commands/retired-plugins.mjs'
import { readRetiredPluginIds, readRetiredResourceIds, readVerifiedPluginFeed } from '../plugins/snapshot.mjs'
import { reuseResourceArchive } from './resource-archive-cache.mjs'
import { readStableConfig, stableEnvironment, verifyStableSigner } from '../build/stable-config.mjs'
import { writeStableResourceLock } from '../build/stable-resource-lock.mjs'

const localDevelopment = process.argv.includes('--local-development')
const publicationArgs = process.argv.slice(2).filter(argument => argument !== '--local-development')
const { plugins: selectedPlugins, remaining } = selectedPluginArguments(publicationArgs)
const { skills: selectedSkills, remaining: skillRemaining } = selectedSkillArguments(remaining)
const targeted = selectedPlugins.length > 0 || selectedSkills.length > 0
const { kinds } = resourcePublicationScope(skillRemaining)
const destination = join(releaseRoot, 'catalogs')
const catalogGeneration = `${contract.buildId}-${Date.now()}`
await mkdir(destination, { recursive: true })
const configured = !localDevelopment
let privateKey, keys, keyId
let signingEnv
if (!localDevelopment) {
  const stable = await readStableConfig(root)
  signingEnv = stableEnvironment(root, stable)
  await verifyStableSigner(root, stable)
  privateKey = await readFile(signingEnv.ZEROWALL_RESOURCE_PRIVATE_KEY_FILE, 'utf8')
  keyId = signingEnv.ZEROWALL_RESOURCE_KEY_ID
  keys = JSON.parse(await readFile(join(root, 'config/catalogs/trusted-keys.json'), 'utf8'))
} else {
  if (process.env.ZEROWALL_RESOURCE_BASE_URL) throw new Error('Local-development catalogs must not target a public resource URL.')
  if (resolve(contract.artifacts) === resolve(root, 'artifacts')) throw new Error('Local-development catalogs require an isolated ZEROWALL_ARTIFACT_ROOT.')
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
const baseUrl = localDevelopment ? '' : signingEnv.ZEROWALL_RESOURCE_BASE_URL.replace(/\/$/, '')
const localOnly = localDevelopment
if (targeted && (kinds.length !== 1 || !['plugin', 'skill'].includes(kinds[0]) || localOnly || !configured)) throw new Error('Targeted catalogs require --kind plugin --plugin <package-name> or --kind skill --skill <skill-name>, a public base URL and a release signing key')
const retiredCatalogPluginIds = new Set([...RETIRED_PLUGIN_IDS, ...await readRetiredPluginIds()])
const records = kinds.includes('plugin') ? JSON.parse(await readFile(join(releaseRoot, 'plugin-packages.json'), 'utf8')).filter(record => !retiredCatalogPluginIds.has(record.id) && (!targeted || selectedPlugins.includes(record.id))) : []
for (const id of selectedPlugins) if (records.filter(r => r.id === id).length !== 1) throw new Error('Targeted plugin has no unique packed artifact: ' + id)
const resourceVersions = JSON.parse(await readFile(join(root, 'config/catalogs/resource-versions.json'), 'utf8'))
const dshPin = JSON.parse(await readFile(join(root, 'config/deepseek-harness/upstream.json'), 'utf8'))
async function entry({ id, version, path, kind, key, metadata = {} }) {
  const size = (await stat(path)).size
  return signCatalog({ id, version, kind, applicationVersion: contract.version,
    dshRange: metadata.dsh ?? { min: dshPin.version, max: dshPin.version }, desktopRange: metadata.desktop ?? { min: '8.4.0' },
    platform: ['win32'], architecture: ['x64'], downloadUrl: baseUrl ? `${baseUrl}/${key}` : pathToFileURL(path).href,
    sha256: await fileDigest(path), size, restartRequired: kind === 'plugin', rollbackSupported: kind !== 'mcp', ...metadata }, privateKey, keyId)
}
const integrations = JSON.parse(await readFile(join(root, 'config/integrations/upstream-sources.json'), 'utf8'))
const plugins = await Promise.all(records.map(async record => {
  const sourcePath = record.id.startsWith('@zerowallscience/plugin-') ? join(root, 'plugins', record.id.slice('@zerowallscience/plugin-'.length), 'package.json')
    : record.id === '@zerowallscience/dsh-bundle-science' ? join(await packageSource('dsh-bundle-science'), 'package.json')
    : Object.values(integrations).find(i => i?.packageName === record.id || i?.package === record.id)?.source ? join(root, Object.values(integrations).find(i => i?.packageName === record.id || i?.package === record.id).source, 'package.json') : undefined
  const source = sourcePath ? await readFile(sourcePath, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return undefined; throw error }) : undefined
  return entry({ ...record, kind: record.kind ?? 'plugin', key: `plugins/${record.id.split('/').at(-1)}/${record.version}/${record.path.split(/[\\/]/).at(-1)}`, metadata: { ...record.manifest, ...pluginDependencyContract(record, source, integrations) } })
}))
if (selectedPlugins.length > 0) {
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
  const merged = mergePublishedPlugins(previous.resources, plugins, keys, retiredCatalogPluginIds)
  plugins.splice(0, plugins.length, ...merged)
  await writeFile(join(destination, 'plugin-targeted-baseline.json'), JSON.stringify({ selectedPlugins, pointer, previousCatalog: previous }, null, 2) + '\n')
}
if (kinds.includes('plugin')) {
  const rules = JSON.parse(await readFile(join(root, 'config/integrations/plugin-compatibility.json'), 'utf8')).rules
  const compatible = applyAuditedPluginCompatibility(plugins, rules, targeted ? selectedPlugins : plugins.map(entry => entry.id), entry => signCatalog(entry, privateKey, keyId))
  plugins.splice(0, plugins.length, ...compatible)
}
for (const parent of plugins) for (const [id, range] of Object.entries(parent.dependencies ?? {})) {
  const child = plugins.find(resource => resource.id === id)
  if (child && !satisfiesPackageRange(child.version, range)) throw new Error(`Plugin catalog dependency closure is incompatible: ${parent.id} -> ${id}@${range}, selected ${child.version}`)
}
const skills = []
const mcpServers = []
const immutableResources = []
const histories = new Map(await Promise.all(kinds.filter(kind => ['skill', 'mcp'].includes(kind)).map(async kind => [kind, await historicalResources(releaseRoot, kind)])))
if (baseUrl && configured) for (const [kind, history] of histories) {
  const published = await publishedResources({ baseUrl, kind, keys, cache: join(contract.cache, 'published-resources', kind) })
  for (const [identity, entry] of published) history.set(identity, entry)
}
async function archiveResource(kind, id, version, source, path) {
  const previous = histories.get(kind).get(id + '@' + version)
  const baseline = previous && (previous.entry ? await downloadResource(previous.entry, join(contract.cache, 'published-resources', kind)) : previous.path)
  immutableResources.push(await reuseResourceArchive({ kind, id, version, source, destination: path, artifactRoot: contract.artifacts, baseline, expectedDigest: previous?.sha256 }))
}
const sciDirectory = join(stageRoot, 'resources/sci')
if (kinds.includes('mcp') && await stat(join(sciDirectory, 'dist/mcp.cjs')).catch(() => undefined)) {
  const version = JSON.parse(await readFile(join(root, 'config/catalogs/mcp-server-bundles.json'), 'utf8')).scimaster.version
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
const selectedSkillNames = !kinds.includes('skill') ? [] : selectedSkills.length > 0 ? selectedSkills : await readdir(skillsRoot)
for (const name of kinds.includes('skill') ? selectedSkillNames : []) {
  // Targeted Skill publication must package the current source tree. A cloned
  // desktop stage may intentionally retain the previous bundled Skill set.
  const source = selectedSkills.includes(name) ? await resourceSource('skills', name) : join(skillsRoot, name)
  if (!(await stat(source)).isDirectory() || !await stat(join(source, 'SKILL.md')).catch(() => undefined)) continue
  const version = resourceVersions.skill[name] ?? '0.1.0'
  const directory = join(releaseRoot, 'skills', name, version)
  await mkdir(directory, { recursive: true })
  const path = join(directory, name + '.tgz')
  await archiveResource('skill', name, version, source, path)
  skills.push(await entry({ id: name, version, path, kind: 'skill', key: `skills/${name}/${version}/${name}.tgz` }))
}
if (selectedSkills.length > 0) {
  const response = await fetch(`${baseUrl}/catalogs/skill-latest.json`, { signal: AbortSignal.timeout(15000), cache: 'no-store' })
  if (!response.ok) throw new Error('Cannot read the published skill pointer: ' + response.status)
  const pointer = verifySignedDocument(await response.json(), keys)
  if (pointer.resourceKind !== 'skill' || pointer.localOnly || !pointer.catalog.downloadUrl.startsWith(`${baseUrl}/catalogs/skill/`)) throw new Error('Published skill pointer is outside the release store')
  const catalogResponse = await fetch(pointer.catalog.downloadUrl, { signal: AbortSignal.timeout(15000) })
  if (!catalogResponse.ok) throw new Error('Cannot read the published skill catalog: ' + catalogResponse.status)
  const bytes = Buffer.from(await catalogResponse.arrayBuffer())
  if (bytes.length !== pointer.catalog.size || createHash('sha256').update(bytes).digest('hex') !== pointer.catalog.sha256) throw new Error('Published skill catalog integrity mismatch')
  const previous = verifyCatalog(JSON.parse(bytes), keys)
  if (previous.kind !== 'skill' || previous.localOnly) throw new Error('Invalid published skill catalog')
  skills.splice(0, skills.length, ...mergePublishedSkills(previous.resources, skills, keys, await readRetiredResourceIds('skill')))
  await writeFile(join(destination, 'skill-targeted-baseline.json'), JSON.stringify({ selectedSkills, pointer, previousCatalog: previous }, null, 2) + '\n')
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
    const manifestPath = await resourceSource('python', 'dependency-manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const wheelRevision = process.env.ZEROWALL_PYTHON_DEPENDENCY_REVISION ?? manifest.revision
    if (typeof wheelRevision !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/u.test(wheelRevision)) throw new Error(`Invalid Python dependency revision: ${wheelRevision ?? '(missing)'}`)
    resources.push(await entry({ id: 'science-dependencies', version, path: manifestPath, kind, key: `python/layers/science/${version}/dependency-manifest.json`, metadata: { role: 'dependency-manifest', restartRequired: false, desktop: { min: '0.0.0' }, revision: manifest.revision } }))
    const wheels = JSON.parse(await readFile(await resourceSource('python', 'fallback-wheels.json'), 'utf8'))
    const trustedKeys = JSON.parse(await readFile(join(root, 'config/catalogs/trusted-keys.json'), 'utf8'))
    for (const wheel of wheels) {
      const path = await prepareFallbackWheel(wheel, { manifest, keys: trustedKeys, cache: join(contract.cache, 'python-wheels'), output: join(releaseRoot, 'python-wheels') })
      resources.push(await entry({ id: `fallback-wheel-${wheel.name}`, version: wheel.version, path, kind, key: `python/wheels/${wheelRevision}/${wheel.filename}`, metadata: { downloadUrl: wheel.url, role: 'fallback-wheel', restartRequired: false, rollbackSupported: false, desktop: { min: '8.1.3' }, revision: wheelRevision } }))
    }
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
if (kinds.includes('skill') && !localOnly) {
  const currentPlugins = await readVerifiedPluginFeed(join(contract.artifacts, 'release/plugins'))
  await writeStableResourceLock({ root, records: currentPlugins, section: 'skills', selected: selectedSkills.length ? selectedSkills : undefined,
    skillRecords: skills, artifactsRoot: contract.artifacts })
}
console.log(`Verified catalogs (${kinds.join(', ')}): ${plugins.length} packages, ${skills.length} Skills; localOnly=${localOnly}`)
