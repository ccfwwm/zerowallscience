/** Verify the complete formal ZeroWall package closure without touching the registry. */
import { access, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = new URL('../..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, match => match.slice(1))
const pluginRoot = join(root, 'distribution', 'plugins')
const formalVersions = new Map([['@zerowall/dsh-plugin-skills', '0.1.1'], ['@zerowall/dsh-bundle-science', '0.1.1']])
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
  if (source.version !== (formalVersions.get(source.name) ?? '0.1.0') || source.publishConfig?.tag !== 'latest') {
    throw new Error(`${source.name} must be @0.1.0 on latest`)
  }
  if (source.zerowall?.profiles?.includes('preview')) {
    throw new Error(`${source.name} must not declare preview as a release profile`)
  }
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, version] of Object.entries(source[section] ?? {})) {
      if (name.startsWith('@zerowall/') && version !== (formalVersions.get(name) ?? '0.1.0')) throw new Error(`${source.name} has ${name}@${version}`)
    }
  }
  const manifestPath = join(path, '..', 'zerowall.plugin.json')
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    if (manifest.version !== (formalVersions.get(source.name) ?? '0.1.0')) throw new Error(`${source.name} plugin manifest has an unexpected formal version`)
    if (manifest.profiles?.includes('preview')) throw new Error(`${source.name} plugin metadata declares a preview release profile`)
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error && error.code === 'ENOENT')) throw error
  }
  packages.push(source.name)
}
if (packages.length !== 15) throw new Error(`Expected 15 ZeroWall packages, found ${packages.length}`)

for (const path of [join(root, 'apps', 'desktop', 'package.json'), join(root, 'apps', 'desktop-host', 'package.json')]) {
  const source = JSON.parse(await readFile(path, 'utf8'))
  for (const section of ['dependencies', 'optionalDependencies', 'devDependencies']) {
    for (const [name, version] of Object.entries(source[section] ?? {})) {
      if (name.startsWith('@zerowall/') && version !== (formalVersions.get(name) ?? '0.1.0')) throw new Error(`${path} has ${name}@${version}`)
    }
  }
}

const market = JSON.parse(await readFile(join(root, 'market', 'index.json'), 'utf8'))
for (const plugin of market.plugins ?? []) {
  if (!plugin.name?.startsWith('@zerowall/')) continue
  if (!Array.isArray(plugin.versions) || plugin.versions.length !== 1 || plugin.versions[0]?.version !== (formalVersions.get(plugin.name) ?? '0.1.0')) {
    throw new Error(`${plugin.name} market metadata must expose only @0.1.0`)
  }
}
await access(join(root, 'market', 'index.json'))
console.log(`Verified ${packages.length} formal ZeroWall packages at formal release versions`)
