/** Desktop profile composition anchored in the package that carries desktop plugins. */
import { join } from 'node:path'
import { loadProfileDirectory } from '@deepseek-ai/dsh-app-boot'

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
