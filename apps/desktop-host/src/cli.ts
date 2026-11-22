/** Public dsh commands using the immutable runtime carried by the Desktop installation. */

import { basename, delimiter, dirname, join, resolve } from 'node:path'
import { runCli } from '@deepseek-ai/dsh/lib/bin.js'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { configurePythonRuntime } from './python.ts'
import { configureDesktopRuntime } from './runtime-environment.ts'

/**
 * Locate the archive containing a packaged runtime.
 * @param runtimeDir - Prepared or ASAR-contained runtime directory.
 * @returns Parent archive path, or undefined for a prepared directory.
 */
export function runtimeArchivePath(runtimeDir: string): string | undefined {
  const parent = dirname(runtimeDir)
  return basename(parent) === 'app.asar' ? parent : undefined
}

/**
 * Prepare Desktop's Python runtime and run the CLI with its bundled package manager and profile access.
 * @param supportDir - Physical Desktop runtime directory containing the primary-runtime payload and Node launchers.
 * @returns Completion of the selected CLI command; profile plugins own their process lifetime.
 * @throws If the bundled Python payload cannot be prepared; the CLI command has not started.
 */
export async function runDesktopCli(supportDir: string): Promise<void> {
  process.env.DSH_PRIMARY_RUNTIME = await configurePythonRuntime(join(supportDir, 'primary-runtime'), resolveDshHome())
  configureDesktopRuntime(supportDir, join(supportDir, 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs'))
  await runCli({
    manageDesktopProfile: true,
    packageManager: {
      command: process.execPath,
      args: ['--expose-internals', join(supportDir, 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs')],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        DSH_DESKTOP_NODE_EXECUTABLE: process.execPath,
        PATH: `${join(supportDir, 'bin')}${delimiter}${process.env.PATH ?? ''}`,
      },
    },
  })
}

if (import.meta.main) {
  if (process.platform === 'win32') {
    if (!process.env.DSH_HOME?.trim() && process.env.APPDATA) {
      process.env.DSH_HOME = join(process.env.APPDATA, 'zerowall-science', 'harness')
    }
    const { installWindowsCliSignals } = await import('./windows-cli-signals.ts')
    await installWindowsCliSignals()
  }
  const runtimeDir = resolve(import.meta.dirname, '../../../..')
  await runDesktopCli(join(dirname(runtimeArchivePath(runtimeDir) ?? runtimeDir), 'runtime'))
}
