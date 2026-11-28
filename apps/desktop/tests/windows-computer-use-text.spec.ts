/** Tests the patched PowerShell write paths with deterministic Win32 responses. */

import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

it.skipIf(process.platform !== 'win32')('stops before a blocked target and after an uncertain write', async () => {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR
  if (systemRoot === undefined) throw new Error('SystemRoot is required for the Windows text input test')
  const require = createRequire(new URL('../../desktop-host/package.json', import.meta.url))
  const pluginRoot = dirname(require.resolve('@zerowall/dsh-computer-use-win/package.json'))
  const { stdout } = await promisify(execFile)(join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
    join(import.meta.dirname, 'fixtures', 'windows-computer-use-text.ps1'),
    '-Backend', join(pluginRoot, 'scripts', 'windows-uia.ps1'),
  ], { timeout: 15_000, windowsHide: true })
  expect(stdout).toContain('WINDOWS_COMPUTER_USE_TEXT_OK')
}, 20_000)
