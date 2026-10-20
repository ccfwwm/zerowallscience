import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const identity = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u
const folder = home => join(home, 'resources/plugins/pending')
export const targetLocked = error => error?.code === 'PLUGIN_TARGET_LOCKED' || /PLUGIN_TARGET_LOCKED/u.test(error?.message ?? '')
export async function writePendingPlugin(home, record) {
  if (!identity.test(record.id)) throw new Error('Invalid pending plugin operation')
  await mkdir(folder(home), { recursive: true })
  const path = join(folder(home), record.id + '.json'), temporary = path + '.' + randomUUID() + '.tmp'
  await writeFile(temporary, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 })
  await rename(temporary, path)
}
export async function readPendingPlugin(home, id) {
  if (!identity.test(id)) throw new Error('Invalid pending plugin operation')
  const record = JSON.parse(await readFile(join(folder(home), id + '.json'), 'utf8'))
  if (record.id !== id || record.schema !== 1) throw new Error('Invalid pending plugin receipt')
  return record
}
export async function enqueuePendingPlugin(home, intent) {
  // Persist intent only. A retry always builds against the latest active
  // manifest; a stale candidate must never remove newer installations.
  const record = { schema: 1, id: randomUUID(), state: 'pending-restart', intent, createdAt: new Date().toISOString() }
  await writePendingPlugin(home, record)
  return { pendingRestart: true, pendingId: record.id, reason: '目标插件文件仍被占用，操作尚未完成。可稍后重启 Host 并继续。' }
}
export async function listPendingPlugins(home) {
  const files = await readdir(folder(home)).catch(error => { if (error.code !== 'ENOENT') throw error; return [] })
  const records = []
  for (const file of files) if (file.endsWith('.json') && identity.test(file.slice(0, -5))) {
    const record = await readPendingPlugin(home, file.slice(0, -5))
    if (record.state === 'pending-restart') records.push(record)
  }
  return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}
