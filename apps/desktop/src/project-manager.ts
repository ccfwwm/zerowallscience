/** Desktop profile initialization and native recovery. */

import {
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  closeSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { join } from 'node:path'
import {
  DESKTOP_HOST_PACKAGE,
  desktopCorePackageOverrides,
  verifyDesktopCorePackageSet,
} from './core-package-set.ts'
import type { DesktopPaths } from './paths.ts'
import type { DesktopRelease } from './release.ts'
import { readDesktopRuntime } from './runtime-tree.ts'
import { initProfile, removeLinkProjections, sanitizeProfile, resetBusinessUpdate } from '@deepseek-ai/dsh-app-boot'
import { PROFILE_TEMPLATES, type ProfileTemplate } from '@deepseek-ai/dsh-official-bundles'
import { ZEROWALL_DEFAULT_BUNDLES, ZEROWALL_PACKAGE_RENAMES } from './default-plugins.ts'
import { PLUGIN_BUILD_DENIALS, ensurePluginBuildDefaults } from '@deepseek-ai/dsh-plugin-manager/operations'

const PROJECT_NAME = '@deepseek-ai/dsh-desktop-runtime'
const DSH_PACKAGE = '@deepseek-ai/dsh'
const CORE_BUILD_PACKAGE = '@deepseek-ai/dsh-subprocess-local'
const WEB_PROFILE = PROFILE_TEMPLATES.web as ProfileTemplate
const ZEROWALL_BUNDLES = [...WEB_PROFILE.bundles, ...ZEROWALL_DEFAULT_BUNDLES]
const WORKSPACE_SETTINGS = 'nodeLinker: hoisted\nautoInstallPeers: false\n'
function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, undefined, 2)}\n`, { mode: 0o600 })
}

function workspaceFile(overrides: Readonly<Record<string, string>> = {}): string {
  const entries = Object.entries(overrides).sort(([left], [right]) => left.localeCompare(right))
  const overrideSection = entries.length === 0
    ? ''
    : `overrides:\n${entries.map(([name, spec]) => `  ${JSON.stringify(name)}: ${JSON.stringify(spec)}`).join('\n')}\n`
  if (entries.length === 0) return `packages:\n  - .\n\n${WORKSPACE_SETTINGS}${PLUGIN_BUILD_DENIALS}`
  const coreBuildSpec = overrides[CORE_BUILD_PACKAGE]
  const coreBuildKey = coreBuildSpec === undefined
    ? CORE_BUILD_PACKAGE
    : `${CORE_BUILD_PACKAGE}@${coreBuildSpec.replace('file:./', 'file:')}`
  return `packages:\n  - .\n\n${overrideSection}${WORKSPACE_SETTINGS}allowBuilds:\n  node-pty: true\n  koffi: true\n  fs-ext: true\n  ssh2: true\n  cpu-features: false\n  ${JSON.stringify(coreBuildKey)}: true\n  '@google/genai': false\n  protobufjs: false\n  node-addon-require-builtin: false\n`
}

function migrateProfileSettings(projectDir: string): void {
  const path = join(projectDir, 'pnpm-workspace.yaml')
  if (!existsSync(path)) return
  const legacy = `packages:\n  - .\n\n${WORKSPACE_SETTINGS}strictDepBuilds: true\nallowBuilds:\n  node-pty: true\n  koffi: true\n  fs-ext: true\n  "${CORE_BUILD_PACKAGE}": true\n  '@google/genai': false\n  protobufjs: false\n  node-addon-require-builtin: false\n`
  const current = readFileSync(path, 'utf8').replaceAll('\r\n', '\n')
  if (current === legacy || current === `packages:\n  - .\n\n${WORKSPACE_SETTINGS}`) {
    writeFileSync(path, workspaceFile())
  }
}

/** Initializes the Desktop profile and disables third-party bundles during recovery. */
export class DesktopProjectManager {
  /**
   * @param paths - Electron-owned package state and reserved desktop profile paths.
   * @param runtime - location of the bundled application runtime.
   */
  constructor(
    readonly paths: DesktopPaths,
    readonly runtime: { readonly dsh: string },
  ) {}

  /**
   * Back up the profile patch and disable third-party bundles without loading application resources.
   * The caller must stop the Host first.
   * @returns Backup path after the locked profile write, or undefined if the patch was absent.
   */
  async disableAllPlugins(): Promise<string | undefined> {
    return this.withLock(() => {
      if (existsSync(join(this.paths.profile, 'package.json'))) reconcileDefaultPlugins(this.paths.profile, false)
      const backup = sanitizeProfile('dsh', this.paths.profile, WEB_PROFILE.bundles)
      resetBusinessUpdate(this.paths.profile)
      return backup
    })
  }

  /**
   * Load application metadata and prepare the external plugin profile without installing packages.
   */
  async applyRelease(): Promise<void> {
    await this.withLock(() => {
      // Validation only: an unreadable or mismatched runtime descriptor stops preparation before the Host starts.
      readDesktopRuntime(this.runtime.dsh)
      migrateProfileSettings(this.paths.profile)
      createPluginProfile(this.paths.profile)
      removeLinkProjections(this.paths.profile)
    })
  }

  private async withLock<T>(operation: () => T | Promise<T>): Promise<T> {
    mkdirSync(this.paths.profile, { recursive: true, mode: 0o700 })
    const lockPath = join(realpathSync(this.paths.profile), 'lock')
    let descriptor: number
    try {
      descriptor = openSync(lockPath, 'wx', 0o600)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        const lock = lstatSync(lockPath)
        if (lock.isSymbolicLink() || !lock.isFile()) {
          throw new Error('desktop project: profile lock is not a regular file')
        }
        const owner = Number.parseInt(readFileSync(lockPath, 'utf8').trim(), 10)
        let active = !Number.isSafeInteger(owner) || owner <= 0
        if (!active) {
          try {
            process.kill(owner, 0)
            active = true
          } catch (signalError) {
            active = (signalError as NodeJS.ErrnoException).code !== 'ESRCH'
          }
        }
        if (active) throw new Error('desktop project: another profile operation is active')
        unlinkSync(lockPath)
        descriptor = openSync(lockPath, 'wx', 0o600)
      } else {
        throw error
      }
    }
    try {
      writeSync(descriptor, `${String(process.pid)}\n`)
      fsyncSync(descriptor)
      return await operation()
    } finally {
      closeSync(descriptor)
      unlinkSync(lockPath)
    }
  }
}

/** Create build-only project metadata for materializing the signed runtime. */
export function createRuntimeProjectMetadata(projectDir: string, release: DesktopRelease): void {
  mkdirSync(projectDir, { recursive: true, mode: 0o700 })
  const packageSet = verifyDesktopCorePackageSet(projectDir, release.version)
  const manifest = {
    name: PROJECT_NAME,
    private: true,
    version: '0.0.0',
    dependencies: desktopCorePackageOverrides(packageSet),
    dsh: { profile: { bundles: [...WEB_PROFILE.bundles] } },
  }
  writeJson(join(projectDir, 'package.json'), manifest)
  writeFileSync(
    join(projectDir, 'pnpm-workspace.yaml'),
    workspaceFile(desktopCorePackageOverrides(packageSet)),
    { mode: 0o600 },
  )
}

/**
 * Create metadata for the unpackaged development project that links the current workspace.
 * @param projectDir - Disposable development profile directory.
 * @param release - Release identity shared by the linked CLI package and Electron shell.
 */
export function createDevelopmentProjectMetadata(projectDir: string, release: DesktopRelease): void {
  mkdirSync(projectDir, { recursive: true, mode: 0o700 })
  const manifest = {
    name: PROJECT_NAME,
    private: true,
    version: '0.0.0',
    dependencies: {
      [DSH_PACKAGE]: release.version,
      [DESKTOP_HOST_PACKAGE]: release.version,
    },
    dsh: { profile: { bundles: [...WEB_PROFILE.bundles] } },
  }
  writeJson(join(projectDir, 'package.json'), manifest)
  writeFileSync(join(projectDir, 'pnpm-workspace.yaml'), workspaceFile(), { mode: 0o600 })
}

/** Create the first external plugin profile without running a package manager. */
export function createPluginProfile(projectDir: string): void {
  const fresh = !existsSync(join(projectDir, 'package.json'))
  if (!fresh) migrateZeroWallBundleNames(projectDir)
  const hasPatch = existsSync(join(projectDir, 'cordis.patch.yml'))
  const hasWorkspace = existsSync(join(projectDir, 'pnpm-workspace.yaml'))
  initProfile(projectDir, ZEROWALL_BUNDLES)
  reconcileDefaultPlugins(projectDir, true)
  if (!hasWorkspace) writeFileSync(join(projectDir, 'pnpm-workspace.yaml'), workspaceFile(), { mode: 0o600 })
  ensurePluginBuildDefaults(projectDir)
  if (fresh && !hasPatch) writeFileSync(join(projectDir, 'cordis.patch.yml'), '[]\n', { mode: 0o600 })
}

/** Record offered defaults once so later starts preserve plugin switches and recovery choices. */
function reconcileDefaultPlugins(projectDir: string, enable: boolean): void {
  const path = join(projectDir, 'package.json')
  const original = readFileSync(path, 'utf8')
  const manifest = JSON.parse(original) as {
    dependencies?: Record<string, string>
    dsh?: { profile?: { bundles?: string[] } }
    zerowall?: { defaultBundles?: string[] }
  }
  const bundles = manifest.dsh?.profile?.bundles
  if (!Array.isArray(bundles) || !bundles.every(name => typeof name === 'string')) {
    throw new Error('desktop profile: dsh.profile.bundles must be an array of package names')
  }
  const previous = manifest.zerowall?.defaultBundles ?? []
  if (!Array.isArray(previous) || !previous.every(name => typeof name === 'string')) {
    throw new Error('desktop profile: zerowall.defaultBundles must be an array of package names')
  }
  const added = ZEROWALL_DEFAULT_BUNDLES.filter(name => !previous.includes(name))
  if (added.length === 0) return
  const explicit = new Set(Object.keys(manifest.dependencies ?? {}).map(name => ZEROWALL_PACKAGE_RENAMES[name] ?? name))
  if (enable) bundles.push(...added.filter(name => !bundles.includes(name) && !explicit.has(name)))
  manifest.zerowall = { ...manifest.zerowall, defaultBundles: [...new Set([...previous, ...ZEROWALL_DEFAULT_BUNDLES])] }
  const backup = join(projectDir, 'package.before-default-plugins.json')
  if (!existsSync(backup)) writeFileSync(backup, original, { flag: 'wx', mode: 0o600 })
  writeJson(path, manifest)
}

/** Rename built-in plugin bundles while retaining disabled plugins and user overrides. */
function migrateZeroWallBundleNames(projectDir: string): void {
  const path = join(projectDir, 'package.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { dependencies?: Record<string, string>; dsh?: { profile?: { bundles?: string[] } } }
  const bundles = manifest.dsh?.profile?.bundles
  if (bundles === undefined) return
  if (!Array.isArray(bundles) || !bundles.every(name => typeof name === 'string')) {
    throw new Error('desktop profile: dsh.profile.bundles must be an array of package names')
  }
  const renamed = bundles.map(name => manifest.dependencies?.[name] === undefined ? ZEROWALL_PACKAGE_RENAMES[name] ?? name : name)
  if (renamed.every((name, index) => name === bundles[index])) return
  const backup = join(projectDir, 'package.before-zerowall-scope.json')
  if (!existsSync(backup)) writeFileSync(backup, readFileSync(path), { flag: 'wx', mode: 0o600 })
  bundles.splice(0, bundles.length, ...new Set(renamed))
  writeJson(path, manifest)
}
