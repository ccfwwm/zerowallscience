import { readdir, readFile, rm, stat, lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/** Keep the active snapshot, rollback snapshot, live leases and a 24-hour grace period. */
export async function collectSnapshots(root: string, now = Date.now()): Promise<void> {
  const protectedRoots = new Set<string>()
  for (const file of ['current.json', 'rollback.json']) {
    const record = await readFile(join(root, file), 'utf8').then(JSON.parse, () => undefined)
    if (record?.root) protectedRoots.add(resolve(record.root).toLowerCase())
  }
  const leaseDirectory = join(root, 'leases')
  for (const name of await readdir(leaseDirectory).catch(() => [])) {
    const path = join(leaseDirectory, name)
    const lease = await readFile(path, 'utf8').then(JSON.parse, () => undefined)
    if (!lease?.snapshot || !Number.isInteger(lease.pid)) continue
    let alive = true
    try { process.kill(lease.pid, 0) } catch (error) { alive = (error as NodeJS.ErrnoException).code !== 'ESRCH' }
    if (alive) protectedRoots.add(resolve(lease.snapshot).toLowerCase())
    else await rm(path, { force: true }).catch(() => undefined)
  }
  const slots = join(root, 'slots')
  for (const entry of await readdir(slots, { withFileTypes: true }).catch(() => [])) {
    // Never remove legacy/external installations or follow a junction.
    if (!entry.isDirectory() || !/^(?:a|b|local|shared)-[a-f0-9-]{36}$/u.test(entry.name)) continue
    const path = join(slots, entry.name)
    if (protectedRoots.has(resolve(path).toLowerCase())) continue
    const info = await lstat(path)
    if (info.isSymbolicLink() || now - info.mtimeMs < 24 * 60 * 60_000) continue
    await rm(path, { recursive: true, force: true, maxRetries: 2, retryDelay: 250 }).catch(() => undefined)
  }
}
