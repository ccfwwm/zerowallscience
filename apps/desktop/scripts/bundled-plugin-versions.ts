/** Fail packaging when selected plugins differ from the actual materialized dependency closure. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { valid } from 'semver'
import { evaluatePluginCompatibility } from '@deepseek-ai/dsh-app-boot'

/**
 * Verify every externally bundled dependency, including the Science bundle's transitive selections.
 * @param modules - Materialized runtime node_modules, after platform filtering.
 * @param hostManifest - Desktop Host package manifest from the source checkout.
 * @param output - Manifest stored inside the runtime and exported beside the installer.
 * @returns Exact plugin versions resolvable by the packaged Host and allowed by its compatibility checks.
 */
export function verifyBundledPluginVersions(modules: string, hostManifest: string, output: string): Record<string, string> {
  const host = JSON.parse(readFileSync(hostManifest, 'utf8')) as { dependencies: Record<string, string> }
  const science = JSON.parse(readFileSync(join(modules, '@zerowall/dsh-bundle-science/package.json'), 'utf8')) as {
    dependencies: Record<string, string>
    zerowall: { defaultBundles: string[] }
  }
  const bundles = new Set([...science.zerowall.defaultBundles, '@zerowall/dsh-bundle-science'])
  const required = { ...science.dependencies, ...host.dependencies }
  for (const [name, version] of Object.entries(science.dependencies)) {
    if (name.startsWith('@deepseek-ai/') || name === 'react' || name === 'react-dom') continue
    const selected = host.dependencies[name]
    if (selected !== undefined && selected !== version) throw new Error(`Bundled dependency pins differ: ${name}@${version} / ${selected}`)
  }
  const versions: Record<string, string> = {}
  const dsh = JSON.parse(readFileSync(join(modules, '@deepseek-ai/dsh/package.json'), 'utf8')) as { version: string }
  for (const [name, expected] of Object.entries(required).sort(([a], [b]) => a.localeCompare(b))) {
    if (name.startsWith('@deepseek-ai/') || name === 'koffi' || name === 'react' || name === 'react-dom') continue
    if (valid(expected) === null) throw new Error(`Bundled plugin must have an exact version: ${name}@${expected}`)
    for (const parent of ['@deepseek-ai/dsh-desktop-host', '@zerowall/dsh-bundle-science']) {
      const require = createRequire(join(modules, parent, 'package.json'))
      let path: string
      try { path = require.resolve(`${name}/package.json`) }
      catch (_error) {
        let directory = dirname(require.resolve(name))
        while (true) {
          const candidate = join(directory, 'package.json')
          if (existsSync(candidate) && (JSON.parse(readFileSync(candidate, 'utf8')) as { name?: string }).name === name) { path = candidate; break }
          const parent = dirname(directory)
          if (parent === directory) throw new Error(`Cannot locate bundled plugin manifest: ${name}`)
          directory = parent
        }
      }
      const actual = JSON.parse(readFileSync(path, 'utf8')) as { version: string }
      if (actual.version !== expected) throw new Error(`Bundled plugin mismatch: ${parent} loads ${name}@${actual.version}, expected ${expected}`)
      if (bundles.has(name) && evaluatePluginCompatibility(actual, {}, dsh.version) !== undefined) {
        throw new Error(`Bundled plugin ${name}@${actual.version} does not support DSH ${dsh.version}`)
      }
      versions[name] = actual.version
    }
  }
  writeFileSync(output, JSON.stringify({ schema: 1, dsh: dsh.version, plugins: versions }, null, 2) + '\n')
  return versions
}
