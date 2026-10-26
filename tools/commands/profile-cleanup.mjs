import { lstat, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const queues = new Map()
const identity = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u
async function physical(path) {
  const info = await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error('Cleanup namespace must be a physical directory')
  return info
}
/** Renaming the obsolete candidate durably enqueues it. The exact owned UUID
 * directory is the receipt; startup can resume without a volatile task list. */
export async function deferCandidateCleanup(home, candidate) {
  home = resolve(home); candidate = resolve(candidate)
  if (candidate !== join(home, 'profiles/zerowall')) throw new Error('Invalid disposable candidate')
  await physical(dirname(candidate))
  if (!await physical(candidate)) return
  const root = join(home, 'resources/cleanup')
  await mkdir(root, { recursive: true }); await physical(root)
  const destination = join(root, randomUUID())
  await rename(candidate, destination)
  resumeCandidateCleanup(home)
}
export function resumeCandidateCleanup(home) {
  home = resolve(home)
  if (queues.has(home)) return queues.get(home)
  const pending = new Promise(resolve => { const timer = setTimeout(resolve, 1000); timer.unref() }).then(async () => {
    const root = join(home, 'resources/cleanup')
    if (!await physical(root)) return
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!identity.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) continue
      const target = join(root, entry.name)
      await physical(target)
      await rm(target, { recursive: true, force: true, maxRetries: 2 })
    }
  }).catch(async error => {
    await writeFile(join(home, 'resources/profile-cleanup.json'), JSON.stringify({ pending: true, error: error.message })).catch(() => {})
  }).finally(() => queues.delete(home))
  queues.set(home, pending)
  return pending
}
