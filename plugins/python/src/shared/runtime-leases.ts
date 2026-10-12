import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'
import { resolve } from 'node:path'
import { runtimeWriterActive } from './runtime-lock.js'

const writerContext = new AsyncLocalStorage<string>()
export const withRuntimeWriterContext = <T>(root: string, run: () => T): T => writerContext.run(resolve(root), run)
export const ownsRuntimeWriter = (root: string): boolean => writerContext.getStore() === resolve(root)

function alive(pid: unknown): boolean {
  if (!Number.isInteger(pid) || Number(pid) <= 0) return false
  try { process.kill(Number(pid), 0); return true } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM' }
}
export async function acquireRuntimeLease(root: string): Promise<() => Promise<void>> {
  const manager = join(root, '.zerowall')
  const blocked = () => runtimeWriterActive(root)
  if (await blocked()) throw new Error('PYTHON_RUNTIME_UPDATING: Python 正在更新或等待恢复，请稍后重试。')
  await mkdir(join(manager, 'leases'), { recursive: true })
  const lease = join(manager, 'leases', `${process.pid}-${randomUUID()}.json`)
  await writeFile(lease, JSON.stringify({ pid: process.pid, snapshot: root, kind: 'python', createdAt: new Date().toISOString() }), { flag: 'wx' })
  const release = async () => { await rm(lease, { force: true }) }
  if (await blocked()) { await release(); throw new Error('PYTHON_RUNTIME_UPDATING: Python 正在更新，请稍后重试。') }
  return release
}

/** Only the owning worker writes. A dead writer can be recovered by an
 * explicit install/repair; old slot journals are never inspected here. */
export async function acquireRuntimeWriter(root: string, waiting?: (count: number) => void, signal?: AbortSignal): Promise<() => Promise<void>> {
  const manager = join(root, '.zerowall'); const lock = join(manager, 'write-lock.json'); const token = randomUUID()
  await mkdir(manager, { recursive: true })
  for (;;) {
    signal?.throwIfAborted()
    try {
      const file = await open(lock, 'wx')
      try { await file.writeFile(JSON.stringify({ pid: process.pid, token, root, createdAt: new Date().toISOString() })) } finally { await file.close() }
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (runtimeWriterActive(root)) throw new Error('PYTHON_RUNTIME_BUSY: 另一个 Python 更新正在运行。')
      await rm(lock, { force: true })
    }
  }
  const release = async () => { const owner = await readFile(lock, 'utf8').then(JSON.parse, () => undefined); if (owner?.token === token) await rm(lock, { force: true }) }
  try {
    for (;;) {
      signal?.throwIfAborted()
      let count = 0
      for (const name of await readdir(join(manager, 'leases')).catch(() => [])) {
        if (!name.endsWith('.json')) continue
        const file = join(manager, 'leases', name)
        const lease = await readFile(file, 'utf8').then(JSON.parse, () => undefined)
        if (lease && alive(lease.pid)) count++
        else if (lease) await rm(file, { force: true })
      }
      if (!count) return release
      waiting?.(count)
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  } catch (error) { await release(); throw error }
}
