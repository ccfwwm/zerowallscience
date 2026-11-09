/** Publish immutable carrier locations before loading Desktop profile plugins. */
import { statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

/**
 * Validate carrier-provided paths and expose them to managed dependency installers.
 * @param root - Absolute directory containing the bundled primary runtime.
 * @param pnpmEntry - Absolute pnpm JavaScript entry inside the primary runtime.
 */
export function configureDesktopRuntime(root: string, pnpmEntry: string): void {
  const nodeExecutable = join(root, 'primary-runtime', 'dependencies', 'node', 'bin', process.platform === 'win32' ? 'node.exe' : 'node')
  for (const path of [root, nodeExecutable, pnpmEntry]) if (!isAbsolute(path)) throw new Error('Desktop runtime locations must be absolute paths.')
  if (!statSync(root).isDirectory() || !statSync(nodeExecutable).isFile() || !statSync(pnpmEntry).isFile()) throw new Error('Desktop runtime files are incomplete. Repair the application installation.')
  process.env.ZEROWALL_DESKTOP_RUNTIME_ROOT = resolve(root)
  process.env.ZEROWALL_DESKTOP_PNPM_ENTRY = resolve(pnpmEntry)
  process.env.DSH_DESKTOP_NODE_EXECUTABLE = resolve(nodeExecutable)
}
