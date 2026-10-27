import { fork } from 'node:child_process'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

async function boot(root: string, source: string, environment: NodeJS.ProcessEnv = {}) {
  const entry = join(root, 'fixture.mjs')
  await writeFile(entry, `${source}\nprocess.send({ value }); process.on('message', () => setTimeout(() => { process.send({ responsive: true }); process.disconnect(); }, 100));`)
  const child = fork(entry, [], {
    execArgv: ['--import', pathToFileURL(resolve('build/runtime-esm-register.mjs')).href],
    env: { ...process.env, NODE_COMPILE_CACHE: '', ZEROWALL_USER_DATA_DIR: root, ...environment },
    silent: true,
  })
  let value: unknown
  let timeout: ReturnType<typeof setTimeout> | undefined
  const exited = new Promise(accept => child.once('exit', accept))
  try {
    await new Promise<void>((accept, reject) => {
      timeout = setTimeout(() => reject(new Error('Host readiness fixture timed out')), 8000)
      child.once('error', reject)
      child.once('exit', code => reject(new Error(`Fixture exited early: ${code}`)))
      child.on('message', message => {
        const row = message as { value?: unknown; responsive?: boolean }
        if ('value' in row) { value = row.value; child.send({ type: 'zerowall:desktop:workbench-ready' }) }
        if (row.responsive) accept()
      })
    })
    await exited
  } finally {
    clearTimeout(timeout)
    if (child.exitCode === null) child.kill('SIGKILL')
    await exited
  }
  return value
}

it('persists Host compilation during normal shutdown and invalidates changed source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-compile-'))
  try {
    expect(await boot(root, 'const value = 17;')).toBe(17)
    expect((await readdir(join(root, 'cache/host-compile'), { recursive: true })).length).toBeGreaterThan(1)
    expect(await boot(root, 'const value = 29;')).toBe(29)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 15_000)

it('keeps workbench-ready IPC responsive without synchronously flushing the compile cache', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-compile-'))
  try {
    // A foreground flush must fail this test even when the cache is small.
    expect(await boot(root, `import Module from 'node:module'; Module.flushCompileCache = () => { throw new Error('foreground cache flush'); }; const value = 37;`)).toBe(37)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 15_000)

it('starts normally when the compile cache directory is unavailable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-compile-'))
  try {
    await writeFile(join(root, 'cache'), 'a file prevents cache creation')
    expect(await boot(root, 'const value = 31;')).toBe(31)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 15_000)
