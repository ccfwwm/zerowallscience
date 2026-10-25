import { access, readdir, readFile, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import ts from 'typescript'

// Typert rc.2 discovers face ownership through the aggregate references. Keep
// upstream source aliases and registrations together: loading a dependency's
// built .d.ts alongside its source creates an invalid merged resource map.
export async function refreshTypertWorkspace(root) {
  const readConfig = path => {
    const result = ts.readConfigFile(path, ts.sys.readFile)
    if (result.error) throw new Error(ts.flattenDiagnosticMessageText(result.error.messageText, '\n'))
    return result.config
  }
  const dshRoot = resolve(root, 'deepseek-harness')
  const base = readConfig(resolve(dshRoot, 'tsconfig.base.json'))
  const upstream = readConfig(resolve(dshRoot, 'tsconfig.host.json'))
  const file = resolve(root, 'tsconfig.host.json')
  const current = JSON.parse(await readFile(file, 'utf8'))
  const localReferences = current.references.filter(item => item.path.startsWith('./plugins/'))
  const referenced = new Set(localReferences.map(item => item.path))
  // New independently published plugins do not enter the desktop's dependency
  // graph. Discover their declared Host faces here rather than requiring a
  // manual edit to the generated aggregate before their first build.
  const pluginDirectories = await readdir(resolve(root, 'plugins'), { withFileTypes: true })
  for (const entry of pluginDirectories.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue
    const packageRoot = resolve(root, 'plugins', entry.name)
    let manifest
    try { manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8')) }
    catch (error) { if (error.code === 'ENOENT') continue; throw error }
    if (!manifest.name?.startsWith('@zerowallscience/plugin-') || !manifest.exports?.['./typert']) continue
    const path = `./plugins/${entry.name}/tsconfig.host.json`
    if (referenced.has(path)) continue
    await access(resolve(root, path))
    localReferences.push({ path })
    referenced.add(path)
  }
  const localPaths = Object.fromEntries(Object.entries(current.compilerOptions.paths)
    .filter(([name]) => name.startsWith('@zerowallscience/')))
  const paths = Object.fromEntries(Object.entries(base.compilerOptions.paths)
    .map(([name, targets]) => [name, targets.map(target => relative(root, resolve(dshRoot, target)).replaceAll('\\', '/'))]))
  const references = [...upstream.references.filter(item => item.path.startsWith('./packages/'))
    .map(item => ({ path: './' + relative(root, resolve(dshRoot, item.path)).replaceAll('\\', '/') })), ...localReferences]
  const next = JSON.stringify({
    extends: './deepseek-harness/tsconfig.base.json',
    compilerOptions: { baseUrl: '.', paths: { ...paths, ...localPaths } },
    files: [], references,
  }, null, 2) + '\n'
  if (await readFile(file, 'utf8') !== next) await writeFile(file, next)
}
