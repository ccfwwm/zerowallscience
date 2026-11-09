/** Public dsh commands using the immutable runtime carried by the Desktop installation. */

import { delimiter, dirname, join, resolve } from 'node:path'
import { runCli } from '@deepseek-ai/dsh/lib/bin.js'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { installOfficeEngineResolution, runtimeArchivePath } from './office-engine.ts'
import { configurePythonRuntime } from './python.ts'
import { configureDesktopRuntime } from './runtime-environment.ts'

/**
 * Prepare Desktop's Python runtime and run the CLI with its bundled package manager and profile access.
 * @param runtimeDir - Prepared or ASAR-contained production DSH package tree.
 * @param supportDir - Physical Desktop runtime directory containing the primary-runtime payload and Node launchers.
 * @returns Completion of the selected CLI command; profile plugins own their process lifetime.
 * @throws If the bundled Python payload cannot be prepared; the CLI command has not started.
 */
export async function runDesktopCli(runtimeDir: string, supportDir: string): Promise<void> {
  configureDesktopRuntime(supportDir, join(supportDir, 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs'))
  await configurePythonRuntime(join(supportDir, 'primary-runtime'), resolveDshHome())
  installOfficeEngineResolution(runtimeDir)
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
    const { installWindowsCliSignals } = await import('./windows-cli-signals.ts')
    await installWindowsCliSignals()
  }
  const runtimeDir = resolve(import.meta.dirname, '../../../..')
  await runDesktopCli(runtimeDir, join(dirname(runtimeArchivePath(runtimeDir) ?? runtimeDir), 'runtime'))
}
