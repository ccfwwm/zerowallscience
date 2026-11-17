import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createRuntimeResolution } from '@deepseek-ai/dsh-app-boot'
import { desktopMarketDefaults, loadDesktopProfile } from '../src/profile.ts'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

it('resolves built-in plugins declared by Desktop Host and preserves the existing profile', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zerowall-desktop-profile-'))
  directories.push(root)
  const write = (path: string, value: object | string) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
  }
  write(join(root, 'node_modules/@deepseek-ai/dsh-desktop-host/package.json'), { name: '@deepseek-ai/dsh-desktop-host', version: '0.2.2-alpha.2', dependencies: { '@zerowall/test-plugin': '1.0.0' } })
  write(join(root, 'node_modules/@zerowall/test-plugin/package.json'), { name: '@zerowall/test-plugin', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } })
  write(join(root, 'node_modules/@zerowall/test-plugin/cordis.patch.yml'), '- insert:\n    - id: test\n      name: "@zerowall/test-plugin"\n')
  const profileDir = join(root, 'home/profiles/desktop')
  write(join(profileDir, 'package.json'), { name: 'desktop', private: true, dsh: { profile: { bundles: ['@zerowall/test-plugin'] } } })
  const patchPath = join(profileDir, 'cordis.patch.yml')
  const original = '- id: existing\n  config: { value: retained }\n'
  write(patchPath, original)
  const { profile, installAnchor } = loadDesktopProfile(root, profileDir)
  const resolution = await createRuntimeResolution({ installAnchor, profile, home: join(root, 'home') })
  expect(resolution.entries).toContainEqual(expect.objectContaining({ name: '@zerowall/test-plugin', scope: 'installation' }))
  expect(profile.patches).not.toContainEqual({ id: 'ui-settings-account', disabled: true })
  expect(readFileSync(patchPath, 'utf8')).toBe(original)
})

it('uses the desktop client packages rather than published peers of bundled plugins', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zerowall-desktop-peers-'))
  directories.push(root)
  const write = (path: string, value: object) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(value))
  }
  const client = '@deepseek-ai/dsh-client-ui-layout'
  const plugin = '@zerowall/test-plugin'
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { dependencies: Record<string, string> }
  expect(manifest.dependencies[client]).toBe('workspace:*')
  write(join(root, 'node_modules/@deepseek-ai/dsh-desktop-host/package.json'), {
    name: '@deepseek-ai/dsh-desktop-host', version: '0.2.2-alpha.2',
    dependencies: { [plugin]: '1.0.0', [client]: '0.2.2-alpha.2' },
  })
  const desktopClient = join(root, 'node_modules', client)
  write(join(desktopClient, 'package.json'), { name: client, version: '0.2.2-alpha.2' })
  write(join(root, 'node_modules', plugin, 'package.json'), { name: plugin, version: '1.0.0', peerDependencies: { [client]: '0.2.2-alpha.2' } })
  write(join(root, 'node_modules', plugin, 'node_modules', client, 'package.json'), { name: client, version: '0.2.2-alpha.2' })
  const profileDir = join(root, 'home/profiles/desktop')
  write(join(profileDir, 'package.json'), { name: 'desktop', private: true, dsh: { profile: { bundles: [] } } })
  const { profile, installAnchor } = loadDesktopProfile(root, profileDir)
  const resolution = await createRuntimeResolution({ installAnchor, profile, home: join(root, 'home') })
  expect(resolution.entries.find(entry => entry.name === client)?.packageDir).toBe(desktopClient)
})

it('retires the duplicate catalog page while retaining its package and skill receipts', () => {
  const root = mkdtempSync(join(tmpdir(), 'zerowall-retired-catalog-'))
  directories.push(root)
  const write = (path: string, value: object | string) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
  }
  const oldCatalog = '@zerowall/dsh-plugin-online-catalog'
  write(join(root, 'node_modules/@deepseek-ai/dsh-desktop-host/package.json'), { name: '@deepseek-ai/dsh-desktop-host', version: '0.2.2-alpha.2', dependencies: {} })
  const profileDir = join(root, 'home/profiles/desktop')
  write(join(profileDir, 'package.json'), { name: 'desktop', private: true, dependencies: { [oldCatalog]: '0.1.1' }, dsh: { profile: { bundles: [oldCatalog] } } })
  const patchPath = join(profileDir, 'cordis.patch.yml')
  write(patchPath, '- id: retained\n  config: { value: true }\n')
  const receipts = join(root, 'home/zerowall-online-catalog/skills.json')
  write(receipts, { 'literature-review': '0.5.7' })

  loadDesktopProfile(root, profileDir)

  const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>
    dsh: { profile: { bundles: string[] } }
  }
  expect(manifest.dsh.profile.bundles).toEqual([])
  expect(manifest.dependencies[oldCatalog]).toBe('0.1.1')
  expect(readFileSync(patchPath, 'utf8')).toContain('retained')
  expect(readFileSync(receipts, 'utf8')).toContain('literature-review')
})


it('ships one market using live catalogs and reuses existing skill receipts', () => {
  expect(desktopMarketDefaults('C:/isolated-home')).toEqual([{ id: 'plugin-market', config: {
    indexes: ['https://zerowall.chengxunkeji.cn/stable/catalog/plugins.json'],
    skillIndexUrl: 'https://zerowall.chengxunkeji.cn/stable/catalog/skills.json',
    skillReceiptDir: join('C:/isolated-home', 'zerowall-online-catalog'),
  } }])
})
