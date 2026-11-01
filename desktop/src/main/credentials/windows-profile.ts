import { spawn } from 'node:child_process'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CredentialEncryption } from './vault.js'

/** Chromium's synchronous Windows v10 format. Keys never leave this process
 * except through the private stdin/stdout pipe to Windows' CurrentUser DPAPI. */
export function chromiumProfileEncryption(key: Buffer): CredentialEncryption & { dispose(): void } {
  if (key.length !== 32) throw new Error('Unsupported Windows profile key.')
  return {
    encrypt(value) {
      const nonce = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, nonce)
      return Buffer.concat([Buffer.from('v10'), nonce, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()])
    },
    decrypt(value) {
      if (value.length < 31 || value.subarray(0, 3).toString() !== 'v10') throw new Error('Unsupported Windows credential format.')
      const cipher = createDecipheriv('aes-256-gcm', key, value.subarray(3, 15))
      cipher.setAuthTag(value.subarray(-16))
      return Buffer.concat([cipher.update(value.subarray(15, -16)), cipher.final()]).toString('utf8')
    },
    dispose() { key.fill(0) },
  }
}

export async function openWindowsProfileEncryption(root: string): Promise<ReturnType<typeof chromiumProfileEncryption>> {
  const state = JSON.parse(await readFile(join(root, 'Local State'), 'utf8')) as { os_crypt?: { encrypted_key?: string } }
  const encoded = state.os_crypt?.encrypted_key
  if (!encoded) throw new Error('Windows profile encryption metadata is unavailable.')
  const protectedKey = Buffer.from(encoded, 'base64')
  if (protectedKey.subarray(0, 5).toString() !== 'DPAPI') throw new Error('Unsupported Windows profile encryption metadata.')
  const script = '$ErrorActionPreference="Stop"; try { Add-Type -AssemblyName System.Security; $v=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $k=[Security.Cryptography.ProtectedData]::Unprotect($v,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($k)); [Array]::Clear($k,0,$k.Length) } catch { exit 1 }'
  const key = await new Promise<Buffer>((accept, reject) => {
    const child = spawn(join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('Windows credential recovery timed out.')) }, 10_000)
    child.stdout.on('data', chunk => { output += String(chunk); if (output.length > 256) child.kill() })
    // Do not forward PowerShell diagnostics, key material or credential values.
    child.stderr.resume()
    child.on('error', () => { clearTimeout(timer); reject(new Error('Windows credential recovery is unavailable.')) })
    child.on('close', code => {
      clearTimeout(timer)
      if (code !== 0 || output.length > 256) reject(new Error('Windows could not unlock the previous profile for this user.'))
      else accept(Buffer.from(output.trim(), 'base64'))
      output = ''
    })
    child.stdin.on('error', () => undefined)
    child.stdin.end(protectedKey.subarray(5).toString('base64'))
  })
  return chromiumProfileEncryption(key)
}
