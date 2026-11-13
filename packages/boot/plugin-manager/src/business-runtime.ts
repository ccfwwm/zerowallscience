/** Keep candidate packages on the installation's shared Host, Client and Worker runtime. */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import semver from 'semver'
import type { RuntimeResolutionEntry } from '@deepseek-ai/dsh-app-boot'
import { PLUGIN_BUILD_DENIALS } from './plugin-build-policy.ts'

function protectedPackage(name: string): boolean {
  return name.startsWith('@deepseek-ai/') || name.startsWith('@cordisjs/')
    || ['cordis', 'react', 'react-dom', 'scheduler', 'electron'].includes(name)
}

/**
 * Remove installation-owned dependencies from pnpm's candidate graph; missing peers use runtime resolution.
 * @param directory - Isolated candidate directory, never the active profile.
 * @param runtime - Installation-only package resolution.
 */
export function configureBusinessRuntime(directory: string, runtime: readonly RuntimeResolutionEntry[]): void {
  const overrides = Object.fromEntries(runtime.filter(entry => protectedPackage(entry.name)).map(entry => [entry.name, '-']))
  writeFileSync(join(directory,
    'pnpm-workspace.yaml'),
  'packages:\n  - .\nnodeLinker: hoisted\nautoInstallPeers: false\noverrides: ' + JSON.stringify(overrides) + '\n' + PLUGIN_BUILD_DENIALS)
}

/**
 * Reject duplicate runtimes at every nesting level and verify original dependency requirements.
 * @param directory - Completed isolated candidate directory.
 * @param runtime - Installation-only package resolution used by every process.
 */
export function validateBusinessRuntime(directory: string, runtime: readonly RuntimeResolutionEntry[]): void {
  const versions = new Map(runtime.map(entry => [entry.name, entry.version]))
  const inspect = (modules: string): void => {
    if (!existsSync(modules)) return
    const packages = readdirSync(modules).filter(name => !name.startsWith('.')).flatMap(name => name.startsWith('@')
      ? readdirSync(join(modules, name)).map(child => name + '/' + child) : [name])
    for (const name of packages) {
      if (protectedPackage(name)) throw new Error('Business update installed a protected runtime dependency: ' + name)
      const path = join(modules, name)
      const manifest = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>
        peerDependencies?: Record<string, string>
        optionalDependencies?: Record<string, string>
        peerDependenciesMeta?: Record<string, { optional?: boolean }>
      }
      for (const [dependency, range] of Object.entries({ ...manifest.dependencies, ...manifest.peerDependencies })) {
        if (!protectedPackage(dependency)) continue
        const installed = versions.get(dependency)
        const optional = manifest.peerDependenciesMeta?.[dependency]?.optional === true
          || Object.hasOwn(manifest.optionalDependencies ?? {}, dependency)
        if (installed === undefined && optional) continue
        if (installed === undefined || semver.validRange(range) === null || !semver.satisfies(installed,
          range,
          { includePrerelease: true })) {
          throw new Error(`Upgrade the desktop application first: ${name} requires ${dependency}@${range}`)
        }
      }
      inspect(join(path, 'node_modules'))
    }
  }
  inspect(join(directory, 'node_modules'))
}
