import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Cooperate with the incremental graph's lock protocol and GC owner checks. */
export async function acquireBuildLock(cacheRoot, name) {
  if (!/^[A-Za-z0-9._-]+$/u.test(name)) throw new Error('Invalid build lock name')
  const directory = join(cacheRoot, 'build-graph', 'locks', `${name}.lock`)
  await mkdir(join(cacheRoot, 'build-graph', 'locks'), { recursive: true })
  try { await mkdir(directory) }
  catch (error) {
    if (error.code !== 'EEXIST') throw error
    const owner = await readFile(join(directory, 'owner.json'), 'utf8').then(JSON.parse, () => undefined)
    if (owner?.pid) {
      try { process.kill(owner.pid, 0); throw new Error(`Build lock ${name} is held by process ${owner.pid}; no shared output was changed.`) }
      catch (failure) { if (failure.code !== 'ESRCH') throw failure }
    }
    if (Date.now() - (await stat(directory)).mtimeMs < 60_000) throw new Error(`Build lock ${name} is too recent to recover safely.`)
    await rm(directory, { recursive: true })
    return acquireBuildLock(cacheRoot, name)
  }
  try { await writeFile(join(directory, 'owner.json'), JSON.stringify({ pid: process.pid, task: name, startedAt: new Date().toISOString() }), { flag: 'wx' }) }
  catch (error) { await rm(directory, { recursive: true, force: true }); throw error }
  return async () => rm(directory, { recursive: true, force: true })
}
