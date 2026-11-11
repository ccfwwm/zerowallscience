/**
 * Shared no-shell `execFile` runner for host-native OS integrations.
 * @module @deepseek-ai/dsh-native-command/runner
 */

import { execFile } from 'node:child_process'
import { win32 } from 'node:path'

/** Resolve the Windows desktop launcher independently of tool-managed PATH entries. */
function nativeExecutable(command: string): string {
  if (process.platform !== 'win32' || command.toLowerCase() !== 'explorer.exe') return command
  const root = process.env.SystemRoot ?? process.env.windir
  if (root === undefined || !win32.isAbsolute(root)) {
    throw new Error('Windows SystemRoot is unavailable. Restore the Windows environment before opening files.')
  }
  return win32.join(root, 'explorer.exe')
}

/** Testable command boundary; native implementations never invoke a shell. */
export type NativeCommandRunner = (
  command: string,
  args: readonly string[],
  signal: AbortSignal,
  window: 'hidden' | 'visible',
) => Promise<{ stdout: string; stderr: string }>

/**
 * Run a host command with utf8 stdio, abort propagation, and explicit GUI visibility.
 * @param command - executable path or PATH name; Windows Explorer resolves from SystemRoot or windir.
 * @param args - argv (never a shell string).
 * @param signal - caller/connection lifetime; abort terminates the child.
 * @param window - Windows startup visibility: `hidden` for background commands,
 * `visible` for GUI launchers. Ignored on other platforms.
 * @returns captured stdout/stderr on exit 0.
 */
export const runNativeCommand: NativeCommandRunner = (command, args, signal, window) =>
  new Promise((resolve, reject) => {
    execFile(
      nativeExecutable(command),
      [...args],
      { encoding: 'utf8', signal, windowsHide: window === 'hidden' },
      (error, stdout, stderr) => {
        if (error !== null) {
          const failure = Object.assign(new Error(error.message, { cause: error }), {
            code: error.code,
            stdout,
            stderr,
          })
          reject(failure)
          return
        }
        resolve({ stdout, stderr })
      },
    )
  })
