/** Desktop profile composition anchored in the package that carries desktop plugins. */
import { join } from 'node:path'
import { loadProfileDirectory } from '@deepseek-ai/dsh-app-boot'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'

/**
 * Load built-in plugins from Desktop Host without rewriting user settings.
 * @param runtimeDir - Runtime project containing Desktop Host and its dependencies.
 * @param profileDir - User-owned desktop profile directory.
 * @returns Profile and installation anchor consumed by the normal DSH launcher.
 */
export function loadDesktopProfile(runtimeDir: string, profileDir: string) {
  const installAnchor = join(runtimeDir, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'package.json')
  const loaded = loadProfileDirectory('dsh', profileDir, installAnchor)
  return { profile: loaded, installAnchor }
}

/**
 * Configure Desktop's existing Discover market with independently published catalogs.
 * @param home - Selected Harness home containing previous online skill receipts.
 * @returns Launcher defaults below explicit user configuration.
 */
export function desktopMarketDefaults(home: string): PatchOptions[] {
  return [
    ...['creation-recommendations', 'client-ui-creation-recommendations', 'plugin-recommendations',
      'client-ui-plugin-recommendations', 'remote-connection'].map(id => ({ id, disabled: true })),
    { id: 'plugin-market', config: {
      indexes: ['https://zerowall.chengxunkeji.cn/stable/catalog/plugins.json'],
      skillIndexUrl: 'https://zerowall.chengxunkeji.cn/stable/catalog/skills.json',
      skillReceiptDir: join(home, 'zerowall-online-catalog'),
    } }]
}
