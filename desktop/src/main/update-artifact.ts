import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { execFile } from 'node:child_process'
import { basename, isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'

export interface DownloadedArtifact {
  version?: unknown
  downloadedFile?: unknown
  files?: unknown
}

export async function windowsFileVersion(path: string): Promise<string> {
  const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
  const { stdout } = await promisify(execFile)(powershell, ['-NoProfile', '-NonInteractive', '-Command',
    '(Get-Item -LiteralPath $env:ZEROWALL_VERIFY_INSTALLER).VersionInfo.ProductVersion'], {
    windowsHide: true, timeout: 15_000, env: { ...process.env, ZEROWALL_VERIFY_INSTALLER: path },
  })
  return stdout.trim()
}

export async function verifyDownloadedArtifact(info: DownloadedArtifact, currentVersion: string,
  readVersion: (path: string) => Promise<string> = windowsFileVersion): Promise<void> {
  const version = info.version
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid update version')
  if (!/^\d+\.\d+\.\d+$/.test(currentVersion)) throw new Error('Invalid current version')
  const next = version.split('.').map(Number), current = currentVersion.split('.').map(Number)
  const difference = next.map((value, i) => value - current[i]!).find(value => value !== 0) ?? 0
  if (!(difference > 0)) throw new Error('Update must be newer than the running application')
  const path = info.downloadedFile
  const expectedName = `zerowall-science-${version}-win-${process.arch}.exe`
  if (typeof path !== 'string' || !isAbsolute(path) || basename(path) !== expectedName) throw new Error('Installer filename does not match update version')
  const file = Array.isArray(info.files) ? info.files.find(item => {
    if (typeof item?.url !== 'string') return false
    try { return decodeURIComponent(new URL(item.url, 'https://update.invalid/').pathname.split('/').pop() ?? '') === expectedName } catch { return false }
  }) : undefined
  if (typeof file?.sha512 !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512)) throw new Error('Missing installer checksum')
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  if (hash.digest('base64') !== file.sha512) throw new Error('Installer checksum mismatch')
  const actual = await readVersion(path)
  if (actual !== version && actual !== `${version}.0`) throw new Error('Installer binary version mismatch')
}
