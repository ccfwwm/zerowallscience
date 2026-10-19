import { mkdir, readFile, writeFile, unlink, realpath } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'

// Windows releases this exclusive pipe on process death. Holding it while
// inspecting/replacing the receipt prevents two stale-owner reclaimers from
// unlinking the successor's live lock. It carries no commands or user data.
async function acquireWindowsGuard(directory) {
  if (process.platform !== 'win32') return async () => {}
  const canonical = (await realpath(directory)).toLowerCase()
  const id = createHash('sha256').update(canonical).digest('hex')
  const server = createServer(socket => socket.destroy())
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen('\\\\.\\pipe\\zerowall-plugin-mutation-' + id, resolve)
    })
  } catch (error) {
    if (['EADDRINUSE', 'EACCES'].includes(error.code)) throw new Error('PLUGIN_TRANSACTION_BUSY: another plugin operation is running')
    throw error
  }
  server.unref()
  return () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}

/** A stable lock outside the replaceable profile, shared by CLI and desktop. */
export async function acquireProfileMutation(profile) {
  const path = join(dirname(profile), '.zerowall-plugin-mutation.lock')
  await mkdir(dirname(path), { recursive: true })
  const releaseGuard = await acquireWindowsGuard(dirname(path))
  const owner = { pid: process.pid, token: randomUUID() }
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await writeFile(path, JSON.stringify(owner), { flag: 'wx', mode: 0o600 })
        return async () => {
          try {
            const current = JSON.parse(await readFile(path, 'utf8'))
            if (current.token !== owner.token) throw new Error('Profile mutation lock ownership changed')
            await unlink(path)
          } finally { await releaseGuard() }
        }
      } catch (error) {
        if (!['EEXIST', 'EPERM'].includes(error.code)) throw error
        const current = await readFile(path, 'utf8').then(JSON.parse)
        try { process.kill(current.pid, 0) }
        catch (probe) { if (probe.code !== 'ESRCH') throw probe; await unlink(path); continue }
        throw new Error('PLUGIN_TRANSACTION_BUSY: another plugin operation is running')
      }
    }
    throw new Error('PLUGIN_TRANSACTION_BUSY: retry plugin operation')
  } catch (error) { await releaseGuard(); throw error }
}
