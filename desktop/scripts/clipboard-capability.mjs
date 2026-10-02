import { spawnSync } from 'node:child_process'

/** Read-only OS permission probe; never clears or reads clipboard contents. */
export function clipboardCapability() {
  if (process.platform !== 'win32') return { available: true, platform: process.platform }
  const script = `$definition = @'
using System;
using System.Runtime.InteropServices;
public class ZwsClipboardCapability {
  [DllImport("user32.dll", SetLastError=true)] public static extern bool OpenClipboard(IntPtr window);
  [DllImport("user32.dll")] public static extern bool CloseClipboard();
}
'@
Add-Type -TypeDefinition $definition
$opened = [ZwsClipboardCapability]::OpenClipboard([IntPtr]::Zero)
$code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
if ($opened) { [void][ZwsClipboardCapability]::CloseClipboard(); $code = 0 }
@{ available = $opened; win32Error = $code } | ConvertTo-Json -Compress`
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8', timeout: 30_000 })
  if (result.status !== 0) return { available: false, probeFailed: true }
  try { return JSON.parse(result.stdout.trim()) } catch { return { available: false, probeFailed: true } }
}
