import { fork } from 'node:child_process'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

async function boot(root: string, source: string, environment: NodeJS.ProcessEnv = {}) {
  const entry = join(root, 'fixture.mjs')
  await writeFile(entry, `${source}\nprocess.send({ value }); process.on('message', () => setTimeout(() => process.send({ flushed: true }), 100));`)
  const child = fork(entry, [], {
    execArgv: ['--import', pathToFileURL(resolve('build/runtime-esm-register.mjs')).href],
    env: { ...process.env, NODE_COMPILE_CACHE: '', ZEROWALL_USER_DATA_DIR: root, ...environment },
    silent: true,
  })
  let value: unknown
  try {
    await new Promise<void>((accept, reject) => {
      child.once('error', reject)
      child.once('exit', code => reject(new Error(`Fixture exited early: ${code}`)))
      child.on('message', message => {
        const row = message as { value?: unknown; flushed?: boolean }
        if ('value' in row) { value = row.value; child.send({ type: 'zerowall:desktop:workbench-ready' }) }
        if (row.flushed) accept()
      })
    })
  } finally {
    const exited = new Promise(accept => child.once('exit', accept))
    child.kill('SIGKILL')
    await exited
  }
  return value
}

it('persists Host compilation before forced shutdown and invalidates changed source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-compile-'))
  try {
    expect(await boot(root, 'const value = 17;')).toBe(17)
    expect((await readdir(join(root, 'cache/host-compile'), { recursive: true })).length).toBeGreaterThan(1)
    expect(await boot(root, 'const value = 29;')).toBe(29)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 15_000)

it('starts normally when the compile cache directory is unavailable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-compile-'))
  try {
    await writeFile(join(root, 'cache'), 'a file prevents cache creation')
    expect(await boot(root, 'const value = 31;')).toBe(31)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 15_000)
