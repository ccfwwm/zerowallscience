import { access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const MAX_OUTPUT_BYTES = 32 * 1024 * 1024
const MAX_RUNTIME_MS = 5 * 60 * 1000

async function workerPath(): Promise<string> {
  const candidates = [
    fileURLToPath(new URL('../runtime/hash-worker.mjs', import.meta.url)),
    fileURLToPath(new URL('../../runtime/hash-worker.mjs', import.meta.url)),
  ]
  for (const candidate of candidates) {
    try { await access(candidate); return candidate } catch { /* try source-tree layout */ }
  }
  throw new Error('Packaged image duplicate worker is unavailable.')
}

export async function runImageDupWorker(config: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  if (signal?.aborted) throw signal.reason ?? new Error('Image duplicate scan was cancelled.')
  const executable = process.execPath
  const script = await workerPath()
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, [script, '--stdin'], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let bytes = 0
    let settled = false
    const finish = (error?: Error, value?: Record<string, unknown>): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
      if (error !== undefined) reject(error)
      else resolve(value ?? {})
    }
    const terminate = (): void => { if (!child.killed) child.kill('SIGTERM') }
    const abort = (): void => { terminate(); finish(signal?.reason instanceof Error ? signal.reason : new Error('Image duplicate scan was cancelled.')) }
    const timeout = setTimeout(() => { terminate(); finish(new Error('Image duplicate scan exceeded the five minute runtime limit.')) }, MAX_RUNTIME_MS)
    timeout.unref()
    signal?.addEventListener('abort', abort, { once: true })
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > MAX_OUTPUT_BYTES) { terminate(); finish(new Error('Image duplicate worker output exceeded 32 MiB.')); return }
      stdout.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.reduce((total, value) => total + value.length, 0) < 64 * 1024) stderr.push(chunk)
    })
    child.once('error', error => finish(error))
    child.once('close', code => {
      if (settled) return
      if (code !== 0) { finish(new Error(`Image duplicate worker failed (${code ?? 'signal'}): ${Buffer.concat(stderr).toString('utf8').slice(-4000)}`)); return }
      try {
        const value = JSON.parse(Buffer.concat(stdout).toString('utf8')) as unknown
        if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Worker returned a non-object result.')
        finish(undefined, value as Record<string, unknown>)
      } catch (error) { finish(error instanceof Error ? error : new Error(String(error))) }
    })
    child.stdin.end(JSON.stringify(config))
  })
}
