/** Bounded installer processes whose cancellation owns the whole child tree. */
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { ProcessRunner } from './runtime.js'

/** Run a managed installer or version probe, discarding all installer output. */
export const runInstaller: ProcessRunner = (command, args, options) => new Promise((resolve, reject) => {
  const { timeoutMs = 300_000, signal, ...spawnOptions } = options
  if (signal?.aborted) { reject(new Error('Claude Code preparation was canceled.')); return }
  const versionProbe = args.at(-1) === '--version'
  let stdout = ''
  let failure: Error | undefined
  let stopping: Promise<void> | undefined
  let closed = false
  const child = spawn(command, args, { ...spawnOptions, detached: process.platform !== 'win32', env: { ...options.env,
    ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
  }, stdio: ['ignore', 'pipe', 'pipe'] })
  const stop = (message: string) => {
    if (closed || stopping) return
    failure = new Error(message)
    stopping = new Promise<void>(done => {
      if (!child.pid) { done(); return }
      if (process.platform === 'win32') {
        const killer = spawn(join(process.env.SystemRoot ?? process.env.WINDIR ?? '', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        killer.once('error', () => { child.kill(); done() })
        killer.once('close', code => { if (code !== 0) child.kill(); done() })
      } else {
        try { process.kill(-child.pid, 'SIGKILL') }
        catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) failure = new Error('Claude Code process cleanup failed.') }
        done()
      }
    })
  }
  const abort = () => stop('Claude Code preparation was canceled.')
  const deadline = setTimeout(() => stop('Claude Code preparation timed out. Check the network and retry.'), timeoutMs)
  deadline.unref()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (data: string) => { if (versionProbe) stdout = (stdout + data).slice(0, 4096) })
  child.stderr?.resume()
  child.once('error', () => { failure ??= new Error('Claude Code process could not start. Repair the application installation.') })
  child.once('close', () => { closed = true; clearTimeout(deadline); signal?.removeEventListener('abort', abort) })
  child.once('close', async code => {
    await stopping
    if (failure) reject(failure)
    else resolve({ code: code ?? -1, ...(versionProbe ? { stdout } : {}) })
  })
})
