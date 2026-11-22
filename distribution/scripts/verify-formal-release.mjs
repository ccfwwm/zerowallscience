/** Verify the complete formal ZeroWall package closure without touching the registry. */
import { access, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { assertMinimumCompatibility } from './plugin-compatibility.mjs'

const root = new URL('../..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, match => match.slice(1))
const pluginRoot = join(root, 'distribution', 'plugins')
const formalVersions = new Map([
  ['@zerowall/dsh-claude-coderun', '0.1.3'], ['@zerowall/dsh-imagecreate', '0.1.1'],
  ['@zerowall/dsh-plugin-ai-cloud', '0.1.3'], ['@zerowall/dsh-plugin-brand-ui', '0.1.0'],
  ['@zerowall/dsh-plugin-environment', '0.1.3'], ['@zerowall/dsh-plugin-mcp', '0.1.4'],
  ['@zerowall/dsh-plugin-mineru', '0.1.2'], ['@zerowall/dsh-plugin-online-catalog', '0.1.1'],
  ['@zerowall/dsh-plugin-python', '0.1.7'], ['@zerowall/dsh-plugin-skills', '0.1.7'],
  ['@zerowall/dsh-pptcreate', '0.1.2'], ['@zerowall/dsh-videocreate', '0.1.1'],
  ['@zerowall/dsh-zotero', '0.1.1'], ['@zerowall/integrity-runtime', '0.1.0'],
  ['@zerowall/research-store', '0.1.1'], ['@zerowall/dsh-bundle-science', '0.1.10'],
])
const directories = await readdir(pluginRoot, { withFileTypes: true })
const packagePaths = []
for (const directory of directories) {
  if (directory.isDirectory()) packagePaths.push(join(pluginRoot, directory.name, 'package.json'))
}
packagePaths.push(join(root, 'distribution', 'science', 'package.json'))

const packages = []
for (const path of packagePaths) {
  let source
  try { source = JSON.parse(await readFile(path, 'utf8')) } catch { continue }
  if (typeof source.name !== 'string' || !source.name.startsWith('@zerowall/')) continue
  assertMinimumCompatibility(source)
  if (source.version !== (formalVersions.get(source.name) ?? '0.1.0') || source.publishConfig?.tag !== 'latest') {
    throw new Error(`${source.name} must use its declared formal release on latest`)
  }
  if (source.zerowall?.profiles?.includes('preview')) {
    throw new Error(`${source.name} must not declare preview as a release profile`)
  }
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, version] of Object.entries(source[section] ?? {})) {
      if (name.startsWith('@zerowall/') && !/^\d+\.\d+\.\d+$/u.test(version.replace(/^>=/u, ''))) throw new Error(`${source.name} has ${name}@${version}`)
    }
  }
  const manifestPath = join(path, '..', 'zerowall.plugin.json')
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    assertMinimumCompatibility(manifest)
    if (manifest.version !== (formalVersions.get(source.name) ?? '0.1.0')) throw new Error(`${source.name} plugin manifest has an unexpected formal version`)
    if (manifest.profiles?.includes('preview')) throw new Error(`${source.name} plugin metadata declares a preview release profile`)
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error && error.code === 'ENOENT')) throw error
  }
  packages.push(source.name)
}
if (packages.length !== 16) throw new Error(`Expected 16 ZeroWall packages, found ${packages.length}`)

for (const path of [join(root, 'apps', 'desktop', 'package.json'), join(root, 'apps', 'desktop-host', 'package.json')]) {
  const source = JSON.parse(await readFile(path, 'utf8'))
  for (const section of ['dependencies', 'optionalDependencies', 'devDependencies']) {
    for (const [name, version] of Object.entries(source[section] ?? {})) {
      if (name.startsWith('@zerowall/') && !['0.1.0', formalVersions.get(name) ?? '0.1.0'].includes(version)) throw new Error(`${path} has ${name}@${version}`)
    }
  }
}

const market = JSON.parse(await readFile(join(root, 'market', 'index.json'), 'utf8'))
// Discover retains the published npm versions until the installer candidates are released.
const marketVersions = new Map(formalVersions)
marketVersions.set('@zerowall/dsh-bundle-science', '0.1.8')
marketVersions.set('@zerowall/dsh-claude-coderun', '0.1.2')
marketVersions.set('@zerowall/dsh-plugin-python', '0.1.5')
for (const plugin of market.plugins ?? []) {
  if (!plugin.name?.startsWith('@zerowall/')) continue
  if (!Array.isArray(plugin.versions) || plugin.versions.length === 0 || plugin.versions[0]?.version !== (marketVersions.get(plugin.name) ?? '0.1.0')) {
    throw new Error(`${plugin.name} market metadata must expose its declared formal release`)
  }
}
await access(join(root, 'market', 'index.json'))
console.log(`Verified ${packages.length} formal ZeroWall packages at formal release versions`)
