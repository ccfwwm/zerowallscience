import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { runInstaller } from '../src/host/installer.js'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

it('returns only version probe output and discards installation diagnostics', async () => {
  const options = { cwd: process.cwd(), env: process.env, windowsHide: true as const }
  expect(await runInstaller(process.execPath, ['-e', 'console.log("private-installer-output")'], options)).toEqual({ code: 0 })
  const version = await runInstaller(process.execPath, ['--version'], options)
  expect(version.code).toBe(0)
  expect(version.stdout?.trim()).toBe(process.version)
})

it.each(['cancel', 'timeout'] as const)('waits for installer descendants to terminate on %s', async mode => {
  const root = await mkdtemp(join(tmpdir(), 'claude installer 中文 ')); roots.push(root)
  const marker = join(root, 'pid')
  const abort = new AbortController()
  const script = 'const {spawn}=require("node:child_process"); const fs=require("node:fs"); const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"inherit"}); fs.writeFileSync(process.argv[1],String(child.pid)); setInterval(()=>{},1000)'
  const task = runInstaller(process.execPath, ['-e', script, marker], { cwd: root, env: process.env, windowsHide: true, signal: abort.signal, timeoutMs: mode === 'timeout' ? 12000 : 18000 })
  const assertion = expect(task).rejects.toThrow(mode === 'cancel' ? 'canceled' : 'timed out')
  let pid = 0
  try {
    await vi.waitFor(async () => { pid = Number(await readFile(marker, 'utf8')); expect(pid).toBeGreaterThan(0) }, { timeout: 10000 })
    if (mode === 'cancel') abort.abort()
    await assertion
    await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow(), { timeout: 2000 })
  } finally { abort.abort(); await task.catch(() => undefined) }
})
