/** Visible Windows installation handoff; failure to create the child leaves the application running. */
import { spawn } from 'node:child_process'

/**
 * Start a verified per-user NSIS installer and wait for OS process creation before returning.
 * The caller owns signature/hash checks, task shutdown and quitting the application after success.
 * @param installer - Absolute path of the verified downloaded installer.
 * @param directory - Existing application installation directory.
 * @returns Resolves after process creation, or rejects before quit on a launch failure.
 */
export async function launchWindowsInstaller(installer: string, directory: string): Promise<void> {
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  delete environment.NODE_OPTIONS
  delete environment.NODE_PATH
  await new Promise<void>((accept, reject) => {
    const child = spawn(installer, ['--updated', '--force-run', `/D=${directory}`], {
      detached: true, stdio: 'ignore', windowsHide: false, env: environment,
    })
    child.once('error', reject)
    child.once('spawn', () => { child.unref(); accept() })
  })
}
