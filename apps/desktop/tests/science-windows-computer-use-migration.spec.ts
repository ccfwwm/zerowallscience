/** Tests one-time enablement and compatible upgrades of the Windows plugin profile. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import type { BundleInfo, ChangeResult, PluginInstallRequestId } from '@deepseek-ai/dsh-plugin-manager/types'
import { migrateWindowsComputerUse } from '../../../distribution/science/windows-computer-use-migration.mjs'

const previous = 'dsh-computer-use-win'
const next = '@zerowall/dsh-computer-use-win'
const targetVersion = '0.6.6'

it.each([
  { state: 'legacy enabled', enabled: true, selected: true },
  { state: 'legacy disabled', enabled: false, selected: false },
  { state: 'migrated and enabled on old client', enabled: true, selected: true },
  { state: 'migrated and disabled on old client', enabled: false, selected: false },
  { state: 'migrated and manually disabled on current client', enabled: false, selected: false },
] as const)('updates the Windows package for a profile that is $state', async ({ state, enabled, selected }) => {
  const dir = await mkdtemp(join(tmpdir(), 'science-computer-use-migration-'))
  try {
    const manifestPath = join(dir, 'package.json')
    const patchPath = join(dir, 'cordis.patch.yml')
    const installAnchor = join(dir, 'installation', 'package.json')
    await mkdir(join(dir, 'installation'))
    await writeFile(installAnchor, '{}')
    let installedVersion = state.startsWith('legacy') ? undefined : state.endsWith('current client') ? targetVersion : '0.6.5'
    const initiallyMigrated = installedVersion !== undefined
    const needsUpgrade = initiallyMigrated && installedVersion !== targetVersion
    let bundleEnabled = enabled
    const initial = {
      dependencies: initiallyMigrated ? { [next]: installedVersion } : { [previous]: '0.6.3' },
      dsh: { profile: { bundles: selected ? [initiallyMigrated ? next : previous] : [] } },
      ...(initiallyMigrated ? { zerowall: { defaultBundles: [next] } } : {}),
    }
    const oldPatch = '- id: mcp-dsh-computer-use-win\n  name: dsh-computer-use-win\n  config:\n    mode: lazy\n'
    const currentPatch = `- id: mcp-dsh-computer-use-win\n  name: "${next}"\n  config:\n    mode: lazy\n`
    await writeFile(manifestPath, JSON.stringify(initial))
    await writeFile(patchPath, initiallyMigrated ? currentPatch : oldPatch)
    const installBundle = vi.fn(async (): Promise<{ application: ChangeResult['application']; error?: { diagnostic: string } }> => {
      installedVersion = targetVersion
      await writeFile(manifestPath, JSON.stringify({ ...initial, dependencies: { [next]: targetVersion } }))
      return { application: 'restart-required' }
    })
    const updateBundle = vi.fn(async (): Promise<{ result: ChangeResult }> => {
      installedVersion = targetVersion
      return { result: { changed: true, application: 'restart-required', stage: 'install', target: next } }
    })
    const ctx = {
      profileContext: { dir, home: dir, patchPath, installAnchor },
      pluginManager: {
        listBundles: async (): Promise<Pick<BundleInfo, 'name' | 'enabled' | 'installed' | 'availability' | 'version'>[]> => [
          ...installedVersion === undefined ? [{ name: previous, enabled, availability: 'installation' as const, installed: false }] : [],
          ...installedVersion === undefined ? [] : [{ name: next, enabled: bundleEnabled, availability: 'profile' as const, installed: true, version: installedVersion }],
        ],
        installBundle,
        updateBundle,
      },
    }
    const migrate = () => migrateWindowsComputerUse(ctx, 'fixture' as PluginInstallRequestId, new AbortController().signal)

    await expect(migrate()).resolves.toBe(!initiallyMigrated || needsUpgrade)
    if (initiallyMigrated) {
      expect(installBundle).not.toHaveBeenCalled()
      expect(updateBundle).toHaveBeenCalledTimes(needsUpgrade ? 1 : 0)
      if (needsUpgrade) {
        expect(updateBundle).toHaveBeenCalledExactlyOnceWith(next, targetVersion, { requestId: 'fixture' })
        expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toEqual(initial)
      }
      expect(await readFile(patchPath, 'utf8')).toBe(currentPatch)
    } else {
      expect(updateBundle).not.toHaveBeenCalled()
      expect(installBundle).toHaveBeenCalledExactlyOnceWith(next + '@' + targetVersion,
        { enabled: false, saveExact: true, requestId: 'fixture' })
      const migrated = JSON.parse(await readFile(manifestPath, 'utf8')) as {
        dependencies: Record<string, string>
        dsh: { profile: { bundles: string[] } }
        zerowall: { defaultBundles: string[] }
      }
      expect(migrated.dsh.profile.bundles).toEqual([next])
      expect(migrated.dependencies).toEqual({ [next]: targetVersion })
      expect(migrated.zerowall.defaultBundles).toEqual([next])
      expect(await readFile(patchPath, 'utf8')).toBe(currentPatch)
      expect(await readFile(manifestPath + '.before-windows-computer-use-migration', 'utf8')).toBe(JSON.stringify({
        ...initial,
        dependencies: { [next]: targetVersion },
      }))
      expect(await readFile(patchPath + '.before-windows-computer-use-migration', 'utf8')).toBe(oldPatch)
    }

    installedVersion = targetVersion
    bundleEnabled = selected
    const afterUpdate = await readFile(manifestPath, 'utf8')
    await expect(migrate()).resolves.toBe(false)
    expect(await readFile(manifestPath, 'utf8')).toBe(afterUpdate)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

it.each(['install', 'update'] as const)('does not edit profile files when plugin %s fails', async (operation) => {
  const dir = await mkdtemp(join(tmpdir(), 'science-computer-use-migration-failure-'))
  try {
    const manifestPath = join(dir, 'package.json')
    const patchPath = join(dir, 'cordis.patch.yml')
    const installAnchor = join(dir, 'installation', 'package.json')
    await mkdir(join(dir, 'installation'))
    await writeFile(installAnchor, '{}')
    const initial = operation === 'install'
      ? { dependencies: { [previous]: '0.6.3' }, dsh: { profile: { bundles: [] } } }
      : { dependencies: { [next]: '0.6.5' }, dsh: { profile: { bundles: [next] } }, zerowall: { defaultBundles: [next] } }
    const patch = operation === 'install'
      ? '- id: mcp-dsh-computer-use-win\n  name: dsh-computer-use-win\n  config:\n    mode: lazy\n'
      : `- id: mcp-dsh-computer-use-win\n  name: "${next}"\n  config:\n    mode: lazy\n`
    await writeFile(manifestPath, JSON.stringify(initial))
    await writeFile(patchPath, patch)
    const expectedBundles = operation === 'install'
      ? [{ name: previous, enabled: false, installed: false, availability: 'installation' as const }]
      : [{ name: next, enabled: true, installed: true, availability: 'profile' as const, version: '0.6.5' }]
    const ctx = {
      profileContext: { dir, home: dir, patchPath, installAnchor },
      pluginManager: {
        listBundles: async () => expectedBundles,
        installBundle: vi.fn(async () => ({
          application: 'failed' as const,
          error: { diagnostic: 'installation failed' },
        })),
        updateBundle: vi.fn(async () => ({
          result: {
            changed: false,
            application: 'failed' as const,
            stage: 'install' as const,
            target: next,
            error: { code: 'operation-error' as const, diagnostic: 'update failed' },
          },
        })),
      },
    }

    await expect(migrateWindowsComputerUse(ctx, 'fixture' as PluginInstallRequestId, new AbortController().signal))
      .rejects.toThrow(operation === 'install' ? 'installation failed' : 'update failed')
    expect(await readFile(manifestPath, 'utf8')).toBe(JSON.stringify(initial))
    expect(await readFile(patchPath, 'utf8')).toBe(patch)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
