import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Publish a persistent Windows file-drop list, readable by Explorer and chat apps. */
export async function copyWindowsFile(path: string): Promise<boolean> {
  if (process.platform !== 'win32') return false
  // Base64 is data inside a fixed script; file names never become PowerShell code.
  const encodedPath = Buffer.from(path, 'utf8').toString('base64')
  const script = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$filePath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPath}'))
$files = New-Object System.Collections.Specialized.StringCollection
[void]$files.Add($filePath)
[Windows.Forms.Clipboard]::SetFileDropList($files)
if (-not [Windows.Forms.Clipboard]::ContainsFileDropList()) { throw 'File clipboard write failed' }
if ([Windows.Forms.Clipboard]::GetFileDropList()[0] -ne $filePath) { throw 'File clipboard verification failed' }`
  try {
    await run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      windowsHide: true, timeout: 15_000, maxBuffer: 64 * 1024,
    })
    return true
  } catch {
    return false
  }
}
