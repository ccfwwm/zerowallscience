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
import { dirname, join } from 'node:path'
import { isMap, isSeq, parseDocument } from 'yaml'
import { writeFileAtomicSync } from '@deepseek-ai/dsh-atomic-write'
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
import {
  LEGACY_WINDOWS_COMPUTER_USE,
  WINDOWS_COMPUTER_USE,
  ZEROWALL_DEFAULT_BUNDLES,
  ZEROWALL_PACKAGE_RENAMES,
} from './default-plugins.ts'
import { PLUGIN_BUILD_DENIALS, ensurePluginBuildDefaults } from '@deepseek-ai/dsh-plugin-manager/operations'

const PROJECT_NAME = '@deepseek-ai/dsh-desktop-runtime'
const DSH_PACKAGE = '@deepseek-ai/dsh'
const CORE_BUILD_PACKAGE = '@deepseek-ai/dsh-subprocess-local'
const WEB_PROFILE = PROFILE_TEMPLATES.web as ProfileTemplate
const ZEROWALL_BUNDLES = [...WEB_PROFILE.bundles, ...ZEROWALL_DEFAULT_BUNDLES]
const WORKSPACE_SETTINGS = 'nodeLinker: hoisted\nautoInstallPeers: false\n'
const RETIRED_NOTIFICATION = '@dingyi222666/dsh-session-notification'
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
      if (existsSync(join(this.paths.profile, 'package.json'))) {
        reconcileDefaultPlugins(this.paths.profile, false, this.hasBundledWindowsComputerUse())
      }
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
      removeRetiredNotification(this.paths.profile)
      const windowsComputerUse = this.hasBundledWindowsComputerUse()
      if (windowsComputerUse) migrateWindowsComputerUse(this.paths.profile)
      createPluginProfile(this.paths.profile, windowsComputerUse)
      removeLinkProjections(this.paths.profile)
    })
  }

  private hasBundledWindowsComputerUse(): boolean {
    return process.platform === 'win32'
      && existsSync(join(this.runtime.dsh, 'node_modules', WINDOWS_COMPUTER_USE, 'package.json'))
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

function writeMigration(path: string, before: string, after: string): void {
  if (after === before) return
  const backup = path + '.before-windows-computer-use-migration'
  if (!existsSync(backup)) writeFileSync(backup, before, { flag: 'wx', mode: 0o600 })
  writeFileAtomicSync(path, after, { mode: 0o600 })
}

/** Replace the retired bundle even if it was explicitly installed in the profile. */
function migrateWindowsComputerUse(projectDir: string): void {
  const path = join(projectDir, 'package.json')
  const before = existsSync(path) ? readFileSync(path, 'utf8') : undefined
  const manifest = before === undefined ? undefined : JSON.parse(before) as {
    dependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    dsh?: { profile?: { bundles?: string[] } }
    zerowall?: { defaultBundles?: string[] }
  }
  const rename = (names: string[]): string[] => [...new Set(names.map(name =>
    name === LEGACY_WINDOWS_COMPUTER_USE ? WINDOWS_COMPUTER_USE : name))]
  const profile = manifest?.dsh?.profile
  const preferences = manifest?.zerowall
  let changed = false
  if (profile?.bundles?.includes(LEGACY_WINDOWS_COMPUTER_USE)) {
    profile.bundles = rename(profile.bundles)
    changed = true
  }
  if (preferences?.defaultBundles?.includes(LEGACY_WINDOWS_COMPUTER_USE)) {
    preferences.defaultBundles = preferences.defaultBundles.filter(name => name !== LEGACY_WINDOWS_COMPUTER_USE)
    changed = true
  }
  for (const dependencies of [manifest?.dependencies, manifest?.optionalDependencies]) {
    if (dependencies && Object.hasOwn(dependencies, LEGACY_WINDOWS_COMPUTER_USE)) {
      delete dependencies['dsh-computer-use-win']
      changed = true
    }
  }
  for (const directory of [projectDir, dirname(dirname(projectDir))]) {
    const patch = join(directory, 'cordis.patch.yml')
    if (!existsSync(patch)) continue
    const original = readFileSync(patch, 'utf8')
    if (!original.includes(LEGACY_WINDOWS_COMPUTER_USE)) continue
    const document = parseDocument(original, {
      customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value: string) => value }],
    })
    if (document.errors[0]) throw document.errors[0]
    if (!isSeq(document.contents)) continue
    let replaced = false
    for (const row of document.contents.items) {
      const entries: unknown = isMap(row) ? row.get('insert', true) : undefined
      for (const entry of isSeq(entries) ? entries.items : [row]) {
        if (isMap(entry) && entry.get('name') === LEGACY_WINDOWS_COMPUTER_USE) {
          entry.set('name', WINDOWS_COMPUTER_USE)
          replaced = true
        }
      }
    }
    if (replaced) writeMigration(patch, original, String(document))
  }
  if (before !== undefined && changed) writeMigration(path, before, JSON.stringify(manifest, undefined, 2) + '\n')
}

function removeRetiredNotification(projectDir: string): void {
  const update = (path: string, transform: (body: string) => string): void => {
    if (!existsSync(path)) return
    const before = readFileSync(path, 'utf8')
    const after = transform(before)
    if (after === before) return
    const backup = path + '.before-notification-removal'
    if (!existsSync(backup)) writeFileSync(backup, before, { flag: 'wx', mode: 0o600 })
    writeFileAtomicSync(path, after, { mode: 0o600 })
  }
  update(join(projectDir, 'package.json'), (before) => {
    const manifest = JSON.parse(before) as {
      dependencies?: Record<string, string>
      dsh?: { profile?: { bundles?: string[] } }
      zerowall?: { defaultBundles?: string[] }
    }
    const profile = manifest.dsh?.profile
    const preferences = manifest.zerowall
    const bundles = profile?.bundles
    const defaults = preferences?.defaultBundles
    if (!bundles?.includes(RETIRED_NOTIFICATION) && !defaults?.includes(RETIRED_NOTIFICATION)
      && !Object.hasOwn(manifest.dependencies ?? {}, RETIRED_NOTIFICATION)) return before
    if (manifest.dependencies) {
      manifest.dependencies = Object.fromEntries(Object.entries(manifest.dependencies).filter(([name]) => name !== RETIRED_NOTIFICATION))
    }
    if (profile && bundles) profile.bundles = bundles.filter(name => name !== RETIRED_NOTIFICATION)
    if (preferences && defaults) preferences.defaultBundles = defaults.filter(name => name !== RETIRED_NOTIFICATION)
    return JSON.stringify(manifest, undefined, 2) + '\n'
  })
  for (const directory of [projectDir, dirname(dirname(projectDir))]) {
    update(join(directory, 'cordis.patch.yml'), (before) => {
      const document = parseDocument(before, {
        customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value: string) => value }],
      })
      if (document.errors[0]) throw document.errors[0]
      if (!isSeq(document.contents)) return before
      const rows = document.contents.items
      const kept = rows.filter((row) => {
        if (!isMap(row)) return true
        const name: unknown = row.get('name')
        const id: unknown = row.get('id')
        return name !== RETIRED_NOTIFICATION && !(id === 'dsh-session-notification' && !row.has('name'))
      })
      if (kept.length === rows.length) return before
      document.contents.items = kept
      return String(document)
    })
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

/**
 * Create the first external plugin profile without running a package manager.
 * @param projectDir - Desktop profile directory.
 * @param windowsComputerUse - Whether the current Windows installation includes the computer-use bundle.
 */
export function createPluginProfile(projectDir: string, windowsComputerUse = false): void {
  const fresh = !existsSync(join(projectDir, 'package.json'))
  if (!fresh) migrateZeroWallBundleNames(projectDir)
  const hasPatch = existsSync(join(projectDir, 'cordis.patch.yml'))
  const hasWorkspace = existsSync(join(projectDir, 'pnpm-workspace.yaml'))
  initProfile(projectDir, ZEROWALL_BUNDLES)
  reconcileDefaultPlugins(projectDir, true, windowsComputerUse)
  if (!hasWorkspace) writeFileSync(join(projectDir, 'pnpm-workspace.yaml'), workspaceFile(), { mode: 0o600 })
  ensurePluginBuildDefaults(projectDir)
  if (fresh && !hasPatch) writeFileSync(join(projectDir, 'cordis.patch.yml'), '[]\n', { mode: 0o600 })
}

/** Record offered defaults once so later starts preserve plugin switches and recovery choices. */
function reconcileDefaultPlugins(projectDir: string, enable: boolean, windowsComputerUse: boolean): void {
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
  const defaults = windowsComputerUse ? [...ZEROWALL_DEFAULT_BUNDLES, WINDOWS_COMPUTER_USE] : ZEROWALL_DEFAULT_BUNDLES
  const added = defaults.filter(name => !previous.includes(name))
  if (added.length === 0) return
  const explicit = new Set(Object.keys(manifest.dependencies ?? {}).map(name => ZEROWALL_PACKAGE_RENAMES[name] ?? name))
  if (enable) bundles.push(...added.filter(name => !bundles.includes(name) && (name === WINDOWS_COMPUTER_USE || !explicit.has(name))))
  manifest.zerowall = { ...manifest.zerowall, defaultBundles: [...previous, ...added] }
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
