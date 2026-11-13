import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDesktopPaths } from '../src/paths.ts'
import { DesktopProjectManager } from '../src/project-manager.ts'
import { readProfilePlugins } from '@deepseek-ai/dsh-app-boot'
import { runtimeFixture } from './runtime-fixture.ts'
import { ZEROWALL_DEFAULT_BUNDLES } from '../src/default-plugins.ts'

const roots: string[] = []
function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-test-'))
  roots.push(root)
  return root
}
function seedPlugin(manager: DesktopProjectManager): void {
  const path = join(manager.paths.profile, 'package.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
    dependencies: Record<string, string>
    dsh: { profile: { bundles: string[] } }
  }
  manifest.dependencies.plugin = '1.0.0'
  manifest.dsh.profile.bundles.push('plugin')
  writeFileSync(path, JSON.stringify(manifest))
  const directory = join(manager.paths.profile, 'node_modules/plugin')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'plugin', version: '1.0.0', dsh: { bundle: { patch: 'bundle.yml' } } }))
  writeFileSync(join(directory, 'bundle.yml'), '[]\n')
}
function plugins(manager: DesktopProjectManager) {
  return readProfilePlugins({ binName: 'dsh', profileDir: manager.paths.profile,
    installAnchor: join(manager.runtime.dsh, 'node_modules/@deepseek-ai/dsh/package.json') }).dependencies
    .map(({ name, version, enabled }) => ({ name, version, enabled }))
}
function setup(): { root: string; manager: DesktopProjectManager } {
  const root = temporaryRoot()
  const dsh = join(root, 'resources', 'dsh')
  runtimeFixture(dsh)
  return { root, manager: new DesktopProjectManager(resolveDesktopPaths(join(root, '.dsh')), { dsh }) }
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('desktop external plugin profile', () => {
  it('seeds the ZeroWall bundle once, retaining later user choices', async () => {
    const { manager } = setup()
    await manager.applyRelease()
    const path = join(manager.paths.profile, 'package.json')
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as { dsh: { profile: { bundles: string[] } } }
    expect(manifest.dsh.profile.bundles).toContain('@zerowall/dsh-bundle-science')
    const patch = join(manager.paths.profile, 'cordis.patch.yml')
    expect(readFileSync(patch, 'utf8')).toBe('[]\n')
    manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(name => name !== '@zerowall/dsh-bundle-science')
    writeFileSync(path, JSON.stringify(manifest))
    writeFileSync(patch, '[]\n')
    await manager.applyRelease()
    expect(readFileSync(path, 'utf8')).toBe(JSON.stringify(manifest))
    expect(readFileSync(patch, 'utf8')).toBe('[]\n')
  })
  it('preserves installed packages, profile state, and the lockfile when preparing a launch', async () => {
    const { manager } = setup()
    await manager.applyRelease()
    seedPlugin(manager)
    const profile = manager.paths.profile
    const name = '@deepseek-ai/dsh-web-app'
    const path = join(profile, 'node_modules', name)
    mkdirSync(path, { recursive: true })
    writeFileSync(join(path, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
    const manifestPath = join(profile, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { dependencies: Record<string, string> }
    manifest.dependencies[name] = '1.0.0'
    writeFileSync(manifestPath, JSON.stringify(manifest))
    writeFileSync(join(profile, 'desktop-runtime-state.json'), JSON.stringify({ links: [] }))
    writeFileSync(join(profile, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
    const files = [
      'package.json',
      'pnpm-workspace.yaml',
      'desktop-runtime-state.json',
      'pnpm-lock.yaml',
      `node_modules/${name}/package.json`,
      'node_modules/plugin/package.json',
      'node_modules/plugin/bundle.yml',
    ]
    const before = files.map(file => readFileSync(join(profile, file), 'utf8'))

    await expect(manager.applyRelease()).resolves.toBeUndefined()

    expect(files.map(file => readFileSync(join(profile, file), 'utf8'))).toEqual(before)
    expect(lstatSync(path).isDirectory()).toBe(true)
    expect(lstatSync(join(profile, 'node_modules/plugin')).isDirectory()).toBe(true)
  })

  it('adds default plugins to a legacy profile once and keeps its patches and dependencies', async () => {
    const { manager } = setup()
    await manager.applyRelease()
    const path = join(manager.paths.profile, 'package.json')
    const manifest = {
      private: true,
      dependencies: { unrelated: '1.0.0' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@ccfwwm/dsh-plugin-ai-cloud', 'unrelated'] } },
    }
    const original = JSON.stringify(manifest)
    writeFileSync(path, original)
    const patch = join(manager.paths.profile, 'cordis.patch.yml')
    writeFileSync(patch, '- id: user-choice\n  disabled: true\n')
    await manager.applyRelease()
    const migrated = JSON.parse(readFileSync(path, 'utf8')) as typeof manifest
    expect(migrated.dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-base', '@zerowall/dsh-plugin-ai-cloud', 'unrelated',
      ...ZEROWALL_DEFAULT_BUNDLES.filter(name => name !== '@zerowall/dsh-plugin-ai-cloud')])
    expect(migrated.dependencies).toEqual(manifest.dependencies)
    expect(readFileSync(patch, 'utf8')).toBe('- id: user-choice\n  disabled: true\n')
    const backup = join(manager.paths.profile, 'package.before-zerowall-scope.json')
    expect(readFileSync(backup, 'utf8')).toBe(original)
    await manager.applyRelease()
    expect(readFileSync(backup, 'utf8')).toBe(original)
  })

  it('retains a recorded disabled default while adding newly offered plugins', async () => {
    const { manager } = setup()
    await manager.applyRelease()
    const path = join(manager.paths.profile, 'package.json')
    writeFileSync(path, JSON.stringify({
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
      zerowall: { defaultBundles: ['@zerowall/dsh-zotero'] },
    }))
    await manager.applyRelease()
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as { dsh: { profile: { bundles: string[] } } }
    expect(manifest.dsh.profile.bundles).not.toContain('@zerowall/dsh-zotero')
    expect(manifest.dsh.profile.bundles).toContain('@zerowall/dsh-plugin-environment')
    expect(manifest.dsh.profile.bundles).toContain('dsh-free-search')
    const once = readFileSync(path, 'utf8')
    await manager.applyRelease()
    expect(readFileSync(path, 'utf8')).toBe(once)
  })

  it('keeps legacy recovery selections disabled on the next launch', async () => {
    const { manager } = setup()
    await manager.applyRelease()
    const path = join(manager.paths.profile, 'package.json')
    writeFileSync(path, JSON.stringify({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@ccfwwm/dsh-plugin-ai-cloud'] } } }))
    await manager.disableAllPlugins()
    await manager.applyRelease()
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as { dsh: { profile: { bundles: string[] } } }
    expect(manifest.dsh.profile.bundles).not.toContain('@zerowall/dsh-plugin-environment')
    expect(manifest.dsh.profile.bundles).not.toContain('@zerowall/dsh-plugin-ai-cloud')
  })

  it('retains explicitly installed versions and deduplicates unpinned renamed bundles', async () => {
    const { manager } = setup()
    await manager.applyRelease()
    const path = join(manager.paths.profile, 'package.json')
    const manifest = {
      private: true,
      dependencies: { '@ccfwwm/dsh-plugin-ai-cloud': '0.1.0-preview.4' },
      dsh: { profile: { bundles: ['@ccfwwm/dsh-plugin-ai-cloud', 'dsh-zotero', '@zerowall/dsh-zotero'] } },
    }
    writeFileSync(path, JSON.stringify(manifest))
    await manager.applyRelease()
    const migrated = JSON.parse(readFileSync(path, 'utf8')) as typeof manifest
    expect(migrated.dependencies).toEqual(manifest.dependencies)
    expect(migrated.dsh.profile.bundles).toEqual(['@ccfwwm/dsh-plugin-ai-cloud', '@zerowall/dsh-zotero',
      ...ZEROWALL_DEFAULT_BUNDLES.filter(name => !['@zerowall/dsh-plugin-ai-cloud', '@zerowall/dsh-zotero'].includes(name))])
    const once = readFileSync(path, 'utf8')
    await manager.applyRelease()
    expect(readFileSync(path, 'utf8')).toBe(once)
  })

  it('rejects invalid bundle lists before replacing profile files', async () => {
    const { manager } = setup()
    await manager.applyRelease()
    const path = join(manager.paths.profile, 'package.json')
    const original = JSON.stringify({ dsh: { profile: { bundles: 'invalid' } } })
    writeFileSync(path, original)
    await expect(manager.applyRelease()).rejects.toThrow('dsh.profile.bundles must be an array')
    expect(readFileSync(path, 'utf8')).toBe(original)
    expect(existsSync(join(manager.paths.profile, 'package.before-zerowall-scope.json'))).toBe(false)
  })
  it('reuses plugin files without scanning manifests and can disable them', async () => {
    const { manager } = setup()
    await manager.applyRelease()
    seedPlugin(manager)
    const manifest = join(manager.paths.profile, 'node_modules/plugin/package.json')
    writeFileSync(manifest, '{broken')
    await expect(manager.applyRelease()).resolves.toBeUndefined()
    await manager.disableAllPlugins()
    await expect(manager.applyRelease()).resolves.toBeUndefined()
    expect(readFileSync(manifest, 'utf8')).toBe('{broken')
  })

  it('disables every third-party bundle without reading a broken plugin patch declaration', async () => {
    const { manager } = setup()
    await manager.applyRelease()
    seedPlugin(manager)
    const patch = join(manager.paths.profile, 'node_modules/plugin/bundle.yml')
    unlinkSync(patch)
    await manager.disableAllPlugins()
    expect((JSON.parse(readFileSync(join(manager.paths.profile, 'package.json'), 'utf8')) as {
      dsh: { profile: { bundles: string[] } }
    }).dsh.profile.bundles).not.toContain('plugin')
    expect(existsSync(join(manager.paths.profile, 'node_modules/plugin/package.json'))).toBe(true)
    await expect(manager.applyRelease()).resolves.toBeUndefined()
  })

  it('disables plugins before runtime initialization and backs up the patch while preserving package files', async () => {
    const { manager } = setup()
    await manager.applyRelease()
    seedPlugin(manager)
    const patch = join(manager.paths.profile, 'cordis.patch.yml')
    writeFileSync(patch, ': broken')
    const uninitialized = new DesktopProjectManager(manager.paths, { ...manager.runtime, dsh: 'missing-runtime' })
    const backupPath = await uninitialized.disableAllPlugins()
    expect(existsSync(patch)).toBe(false)
    const backups = readdirSync(manager.paths.profile).filter(name => name.startsWith('cordis.patch.yml.bak-'))
    expect(backups).toHaveLength(1)
    expect(backupPath).toBe(join(manager.paths.profile, backups[0]!))
    expect(readFileSync(join(manager.paths.profile, backups[0]!), 'utf8')).toBe(': broken')
    expect(existsSync(join(manager.paths.profile, 'node_modules/plugin/package.json'))).toBe(true)
    const manifest = JSON.parse(readFileSync(join(manager.paths.profile, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      dsh: { profile: { bundles: string[] } }
    }
    expect(manifest.dependencies.plugin).toBe('1.0.0')
    expect(manifest.dsh.profile.bundles).not.toContain('plugin')
    expect(manifest.dsh.profile.bundles).toContain('@deepseek-ai/dsh-web-app')
    await manager.applyRelease()
    expect(readFileSync(patch, 'utf8')).toContain('[]')
  })

  it('needs no runtime or package manifest when no plugins have been installed', async () => {
    const { manager } = setup()
    await expect(manager.disableAllPlugins()).resolves.toBeUndefined()
    expect(existsSync(join(manager.paths.profile, 'package.json'))).toBe(false)
    expect(existsSync(manager.paths.lock)).toBe(false)
  })

  it('reports invalid profile JSON without replacing it', async () => {
    const { manager } = setup()
    await manager.applyRelease()
    const path = join(manager.paths.profile, 'package.json')
    writeFileSync(path, '{broken')
    await expect(manager.disableAllPlugins()).rejects.toThrow()
    expect(readFileSync(path, 'utf8')).toBe('{broken')
    expect(existsSync(manager.paths.lock)).toBe(false)
  })

  it('denies unused provider dependency scripts in a new external profile', async () => {
    const { manager } = setup()
    await manager.applyRelease()
    expect(readFileSync(join(manager.paths.profile, 'pnpm-workspace.yaml'), 'utf8'))
      .toBe("packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\nallowBuilds:\n  '@google/genai': false\n  protobufjs: false\n  cpu-features: false\n  ssh2: false\n")
  })

  it('opens a linked profile and migrates only the generated pnpm defaults', async () => {
    const { root, manager } = setup()
    const target = join(root, 'linked-profile')
    mkdirSync(target)
    mkdirSync(join(manager.paths.profile, '..'), { recursive: true })
    symlinkSync(target, manager.paths.profile, process.platform === 'win32' ? 'junction' : 'dir')
    await manager.applyRelease()
    const path = join(target, 'pnpm-workspace.yaml')
    const defaults = readFileSync(path, 'utf8')
    const upstreamDefaults = 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n'
    writeFileSync(path, `${upstreamDefaults}strictDepBuilds: true\nallowBuilds:\n  node-pty: true\n  koffi: true\n  fs-ext: true\n  "@deepseek-ai/dsh-subprocess-local": true\n  '@google/genai': false\n  protobufjs: false\n  node-addon-require-builtin: false\n`)
    await manager.applyRelease()
    expect(readFileSync(path, 'utf8')).toBe(defaults)
    const custom = `${upstreamDefaults}allowBuilds:\n  my-plugin: true\n`
    writeFileSync(path, custom)
    await manager.applyRelease()
    const migrated = readFileSync(path, 'utf8')
    expect(migrated).toContain('my-plugin: true')
    expect(migrated).toContain('ssh2: false')
    await manager.applyRelease()
    expect(readFileSync(path, 'utf8')).toBe(migrated)
  })

  it('reports damaged application metadata as a reinstall failure', async () => {
    const { manager } = setup()
    writeFileSync(join(manager.runtime.dsh, 'desktop-runtime.json'), '{broken')
    await expect(manager.applyRelease()).rejects.toThrow()
  })

  it('preserves unknown files when initializing a profile', async () => {
    const { manager } = setup()
    mkdirSync(manager.paths.profile, { recursive: true })
    writeFileSync(join(manager.paths.profile, '.DS_Store'), 'metadata')
    writeFileSync(join(manager.paths.profile, 'user-file'), 'retain')
    await expect(manager.applyRelease()).resolves.toBeUndefined()
    expect(readFileSync(join(manager.paths.profile, '.DS_Store'), 'utf8')).toBe('metadata')
    expect(readFileSync(join(manager.paths.profile, 'user-file'), 'utf8')).toBe('retain')
    expect(readFileSync(join(manager.paths.profile, 'cordis.patch.yml'), 'utf8')).toBe('[]\n')
    expect(existsSync(join(manager.paths.profile, 'desktop-runtime-state.json'))).toBe(false)
  })

  it('initializes and restarts offline without executing pnpm', async () => {
    const { manager } = setup()
    await expect(manager.applyRelease()).resolves.toBeUndefined()
    await expect(manager.applyRelease()).resolves.toBeUndefined()
    expect(plugins(manager)).toEqual([])
    expect(JSON.parse(readFileSync(join(manager.paths.profile, 'package.json'), 'utf8'))).toMatchObject({ dependencies: {} })
  })

  it.skipIf(process.platform !== 'win32')('reuses the profile when the launch path changes only Windows letter casing', async () => {
    const { manager } = setup()
    await manager.applyRelease()
    const relaunched = new DesktopProjectManager(manager.paths, { ...manager.runtime, dsh: manager.runtime.dsh.toUpperCase() })
    await expect(relaunched.applyRelease()).resolves.toBeUndefined()
  })

  it.each(['changed', 'same-size', 'extra', 'missing'])('starts and reuses a profile without checking %s runtime bytes', async (operation) => {
    const { manager } = setup()
    if (operation === 'changed') writeFileSync(join(manager.runtime.dsh, 'package.json'), '{}')
    if (operation === 'same-size') writeFileSync(join(manager.runtime.dsh, 'package.json'), '{"type":"Module"}\n')
    if (operation === 'extra') writeFileSync(join(manager.runtime.dsh, 'extra'), '')
    if (operation === 'missing') unlinkSync(join(manager.runtime.dsh, 'package.json'))
    await expect(manager.applyRelease()).resolves.toBeUndefined()
    const relaunched = new DesktopProjectManager(manager.paths, manager.runtime)
    await expect(relaunched.applyRelease()).resolves.toBeUndefined()
    expect(existsSync(manager.paths.profile)).toBe(true)
  })

  it('keeps plugin files and patches through a compatible release and application relocation', async () => {
    const { root, manager } = setup()
    await manager.applyRelease()
    seedPlugin(manager)
    writeFileSync(join(manager.paths.profile, 'cordis.patch.yml'), '[]\n')
    const nextRoot = join(root, 'relocated', 'dsh')
    runtimeFixture(nextRoot, '1.1.0')
    const next = new DesktopProjectManager(manager.paths, { ...manager.runtime, dsh: nextRoot })
    await expect(next.applyRelease()).resolves.toBeUndefined()
    expect(plugins(next)).toEqual(plugins(manager))
    expect(readFileSync(join(manager.paths.profile, 'cordis.patch.yml'), 'utf8')).toBe('[]\n')
    expect(readFileSync(join(manager.paths.profile, 'node_modules/plugin/bundle.yml'), 'utf8')).toBe('[]\n')
  })

  it('preserves plugin files without running pnpm when bundled Node changes', async () => {
    const { root, manager } = setup()
    await manager.applyRelease()
    seedPlugin(manager)
    const dsh = join(root, 'new-node')
    runtimeFixture(dsh, '1.1.0', '24.18.0')
    const next = new DesktopProjectManager(manager.paths, { ...manager.runtime, dsh })
    await next.applyRelease()
    expect(plugins(next)).toEqual([{ name: 'plugin', version: '1.0.0', enabled: true }])
  })

  it('allows peer version mismatches to reach Host startup and remain available for recovery', async () => {
    const { root, manager } = setup()
    await manager.applyRelease()
    seedPlugin(manager)
    const dsh = join(root, 'next-major')
    runtimeFixture(dsh, '2.0.0')
    const next = new DesktopProjectManager(manager.paths, { ...manager.runtime, dsh })
    await expect(next.applyRelease()).resolves.toBeUndefined()
    await next.disableAllPlugins()
    expect(plugins(next)).toEqual([{ name: 'plugin', version: '1.0.0', enabled: false }])
  })
})

describe.each(['applyRelease', 'disableAllPlugins'] as const)('desktop profile lock during %s', (operation) => {
  it('preserves a live owner lock and leaves the profile untouched', async () => {
    const { manager } = setup()
    mkdirSync(manager.paths.profile, { recursive: true })
    const owner = `${String(process.pid)}\n`
    writeFileSync(manager.paths.lock, owner)
    await expect(manager[operation]()).rejects.toThrow('another profile operation is active')
    expect(readFileSync(manager.paths.lock, 'utf8')).toBe(owner)
    expect(readdirSync(manager.paths.profile)).toEqual(['lock'])
  })

  it('reclaims a stale owner lock and releases it after the operation', async () => {
    const { manager } = setup()
    mkdirSync(manager.paths.profile, { recursive: true })
    writeFileSync(manager.paths.lock, `${String(process.pid)}\n`)
    const probe = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('process absent'), { code: 'ESRCH' })
    })
    try {
      await expect(manager[operation]()).resolves.toBeUndefined()
      expect(probe).toHaveBeenCalledExactlyOnceWith(process.pid, 0)
      expect(existsSync(manager.paths.lock)).toBe(false)
    } finally {
      probe.mockRestore()
    }
  })

  it.each(['invalid', '0', '-1', '9007199254740992'])('preserves a lock with invalid owner %s', async (owner) => {
    const { manager } = setup()
    mkdirSync(manager.paths.profile, { recursive: true })
    writeFileSync(manager.paths.lock, owner)
    await expect(manager[operation]()).rejects.toThrow('another profile operation is active')
    expect(readFileSync(manager.paths.lock, 'utf8')).toBe(owner)
  })

  it('rejects a directory at the lock path', async () => {
    const { manager } = setup()
    mkdirSync(manager.paths.lock, { recursive: true })
    await expect(manager[operation]()).rejects.toThrow('profile lock is not a regular file')
    expect(lstatSync(manager.paths.lock).isDirectory()).toBe(true)
  })

  it('rejects a linked lock without touching its target', async () => {
    const { root, manager } = setup()
    mkdirSync(manager.paths.profile, { recursive: true })
    const target = join(root, 'lock-target')
    mkdirSync(target)
    writeFileSync(join(target, 'sentinel'), 'retain')
    symlinkSync(target, manager.paths.lock, process.platform === 'win32' ? 'junction' : 'dir')
    try {
      await expect(manager[operation]()).rejects.toThrow('profile lock is not a regular file')
      expect(lstatSync(manager.paths.lock).isSymbolicLink()).toBe(true)
      expect(readFileSync(join(target, 'sentinel'), 'utf8')).toBe('retain')
    } finally {
      unlinkSync(manager.paths.lock)
    }
  })
})

describe('desktop link-backend projections', () => {
  it('removes .dsh-module-fallback projections when preparing a launch', async () => {
    const { manager } = setup()
    await manager.applyRelease()
    const profile = manager.paths.profile
    const target = join(profile, 'node_modules', 'my-bundle', 'node_modules', 'bridge')
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'bridge', version: '1.0.0' }))
    const owned = join(profile, '.dsh-module-fallback', 'node_modules', 'bridge')
    mkdirSync(dirname(owned), { recursive: true })
    symlinkSync(target, owned, process.platform === 'win32' ? 'junction' : 'dir')
    symlinkSync(owned, join(profile, 'node_modules', 'bridge'), process.platform === 'win32' ? 'junction' : 'dir')

    await manager.applyRelease()

    expect(existsSync(join(profile, '.dsh-module-fallback'))).toBe(false)
    expect(lstatSync(join(profile, 'node_modules', 'bridge'), { throwIfNoEntry: false })).toBeUndefined()
    expect(existsSync(join(target, 'package.json'))).toBe(true)
  })
})
