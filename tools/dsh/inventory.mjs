import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const dshRoot = resolve(root, 'deepseek-harness')
const output = resolve(root, 'config/deepseek-harness/plugin-inventory.json')
const upstream = await json('config/deepseek-harness/upstream.json')
const desktop = await json('desktop/package.json')

const thirdPartyOrder = [
  'dsh-ssh-ops',
  'dsh-progressive-tools',
  '@dingyi222666/dsh-session-notification',
  'dsh-dream-skin',
  'dsh-better-sidebar',
  'dsh-file-review',
  'dsh-univer-office',
  'dsh-zotero',
  '@dsh-external/zotero-harvest',
  'dsh-wechat',
  '@changfenhuang/dsh-genui',
]
const zeroWallOrder = [
  'base', 'secrets', 'environment', 'desktop-compat', 'projects', 'mcp',
  'account', 'ai-cloud',
  'files', 'images',
  'research', 'pubmed', 'mineru', 'singlecell', 'execution', 'python', 'runs',
  'publications', 'skills', 'reviewer', 'extension-center',
]
const expectedOrder = [
  ...thirdPartyOrder,
  ...zeroWallOrder.slice(0, 8).map(id => `@zerowallscience/plugin-${id}`),
  'dsh-free-search',
  ...zeroWallOrder.slice(8).map(id => `@zerowallscience/plugin-${id}`),
]
const thirdPartyPackages = [...thirdPartyOrder, 'dsh-free-search']
// The customized Host persists these bundles into the editable web profile.
// Duplicating their rows in the desktop overlay would register them twice.
const profileBundles = new Set(['dsh-free-search', 'dsh-file-review'])
const hostProfileSource = await readFile(resolve(dshRoot, 'packages/boot/app-boot/src/profile.ts'), 'utf8')
for (const name of profileBundles) {
  assert(hostProfileSource.includes(`if (!nextBundles.includes('${name}')) nextBundles.push('${name}')`)
    || (name === 'dsh-file-review' && hostProfileSource.includes("if (process.env.ZEROWALL_USER_DATA_DIR && !nextBundles.includes('dsh-file-review'))")),
  `${name} must be included by the customized Host web profile`)
  const manifest = JSON.parse(await readFile(resolve(root, 'desktop/node_modules', name, 'package.json'), 'utf8'))
  assert(typeof manifest.dsh?.bundle?.patch === 'string', `${name} must declare its bundle patch`)
  await readFile(resolve(root, 'desktop/node_modules', name, manifest.dsh.bundle.patch), 'utf8')
}

const zeroWallPlugins = []
for (const id of zeroWallOrder) {
  const manifestPath = `plugins/${id}/zerowall.plugin.json`
  const manifest = await json(manifestPath)
  const packageManifest = await json(`plugins/${id}/package.json`)
  const expectedName = `@zerowallscience/plugin-${id}`
  assert(manifest.name === expectedName, `${manifestPath} must declare ${expectedName}`)
  assert(packageManifest.name === expectedName, `plugins/${id}/package.json must declare ${expectedName}`)
  assert(manifest.dsh?.min === upstream.version && manifest.dsh?.max === upstream.version, `${expectedName} must target DSH ${upstream.version}`)
  zeroWallPlugins.push({
    id,
    package: expectedName,
    version: packageManifest.version,
    source: `plugins/${id}`,
    manifest: manifestPath,
    client: typeof manifest.client === 'string',
    remote: packageManifest.exports?.['./remote'] !== undefined,
    loadOrder: expectedOrder.indexOf(expectedName) + 1,
    capabilities: manifest.capabilities ?? [],
    permissions: manifest.permissions ?? [],
    requiredServices: manifest.requiredServices ?? [],
    optionalServices: manifest.optionalServices ?? [],
    productionPath: `resources/app.asar/node_modules/${expectedName}`,
  })
}

const profileInventory = {}
for (const profile of ['development', 'preview', 'stable']) {
  const path = `profiles/generated/${profile}.yml`
  const document = await readFile(resolve(root, path), 'utf8')
  const version = document.match(/^dsh:\s*([^\s]+)\s*$/mu)?.[1]
  const plugins = [...document.matchAll(/^\s+-\s+['"]([^'"]+)['"]\s*$/gmu)].map(match => match[1])
  assert(version === upstream.version, `${path} must target DSH ${upstream.version}`)
  assertEqualList(plugins, expectedOrder, `${path} plugin order`)
  profileInventory[profile] = { path, dsh: version, plugins }
}

const patchDocument = await readFile(resolve(root, 'desktop/build/zerowall.patch.yml'), 'utf8')
const patchNames = [...patchDocument.matchAll(/^\s+name:\s+['"]([^'"]+)['"]\s*$/gmu)].map(match => match[1])
const orderedPatchNames = patchNames.filter(name => expectedOrder.includes(name))
const expectedPatchOrder = expectedOrder.filter(name => !profileBundles.has(name))
assertEqualList(orderedPatchNames, expectedPatchOrder, 'desktop/build/zerowall.patch.yml plugin order')
for (const name of expectedPatchOrder) {
  assert(patchNames.filter(candidate => candidate === name).length === 1, `${name} must appear exactly once in the Desktop patch`)
}
for (const name of profileBundles) assert(!patchNames.includes(name), `${name} must not be duplicated in the Desktop patch`)

const dshPackages = []
for (const path of await manifests(dshRoot)) {
  const manifest = JSON.parse(await readFile(path, 'utf8'))
  if (typeof manifest.name !== 'string') continue
  dshPackages.push({
    package: manifest.name,
    version: manifest.version ?? null,
    source: relative(dshRoot, path).replaceAll('\\', '/').replace(/\/package\.json$/u, ''),
  })
}
dshPackages.sort((left, right) => left.package.localeCompare(right.package))

const kernelPackages = [
  '@deepseek-ai/dsh-api-gateway',
  '@deepseek-ai/dsh-api-session-controller',
  '@deepseek-ai/dsh-api-settings-controller',
  '@deepseek-ai/dsh-api-workspace-controller',
  '@deepseek-ai/dsh-attachment',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-chat',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-ui-session',
  '@deepseek-ai/dsh-credentials',
  '@deepseek-ai/dsh-host-webserver',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-sandbox',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-skill',
  '@deepseek-ai/dsh-subprocess',
  '@deepseek-ai/dsh-workspace',
]
const packageNames = new Set(dshPackages.map(item => item.package))
for (const name of kernelPackages) assert(packageNames.has(name), `required DSH kernel package is missing: ${name}`)

const thirdPartyPlugins = thirdPartyPackages.map(name => ({
  package: name,
  version: desktop.dependencies?.[name] ?? null,
  owner: 'third-party',
  registrationSource: profileBundles.has(name) ? 'host-web-profile-bundle' : 'desktop-patch',
  source: 'desktop/package.json',
  loadOrder: expectedOrder.indexOf(name) + 1,
  productionPath: `resources/app.asar/node_modules/${name}`,
}))
for (const plugin of thirdPartyPlugins) assert(plugin.version !== null, `desktop/package.json must pin ${plugin.package}`)

const inventory = {
  schemaVersion: 1,
  harness: {
    repository: upstream.repository,
    branch: upstream.branch,
    commit: upstream.commit,
    upstreamRepository: upstream.upstreamRepository,
    upstreamCommit: upstream.upstreamCommit,
    tag: upstream.tag,
    version: upstream.version,
    source: 'deepseek-harness',
    packagedCli: 'resources/app.asar/node_modules/@deepseek-ai/dsh/lib/bin.js',
    kernelPackages,
    packageCount: dshPackages.length,
  },
  profiles: profileInventory,
  thirdPartyPlugins,
  zeroWallPlugins,
  sharedPackages: [{ package: '@zerowallscience/integrity-runtime', source: 'packages/integrity-runtime', plugin: false, productionPath: 'resources/app.asar/node_modules/@zerowallscience/integrity-runtime' }],
}

await writeFile(output, `${JSON.stringify(inventory, null, 2)}\n`)
console.log(`Recorded DSH ${upstream.version}, ${dshPackages.length} Harness packages, ${thirdPartyPlugins.length} third-party plugins, and ${zeroWallPlugins.length} ZeroWall plugins.`)

async function json(path) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'))
}

async function manifests(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'lib', 'dist'].includes(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await manifests(path))
    else if (entry.name === 'package.json') result.push(path)
  }
  return result
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertEqualList(actual, expected, label) {
  assert(actual.length === expected.length && actual.every((value, index) => value === expected[index]), `${label} differs from the required load order`)
}
