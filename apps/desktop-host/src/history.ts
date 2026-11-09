/** Prepare a single-encoding Desktop history without changing imported Session generations. */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { constants, zstdCompress } from 'node:zlib'
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import { decompressZstdFrame, generationLogPath, parseGenerationLogFilename, scanZstdFrames } from '@deepseek-ai/dsh-session-persistence-jsonl'
import type { SessionId } from '@deepseek-ai/dsh-session'

const compress = promisify(zstdCompress)
const checksum = { params: { [constants.ZSTD_c_checksumFlag]: 1 } }

/** Safe startup facts; failed source directories remain intact for another attempt. */
export interface DesktopHistoryPreparation {
  readonly root: string
  readonly imported: number
  readonly failures: readonly string[]
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
}

async function directory(path: string): Promise<void> {
  const entry = await lstat(path)
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('History directory requires a local directory')
}

async function generations(path: string): Promise<{ name: string; version: number }[]> {
  await directory(path)
  const result: { name: string; version: number }[] = []
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const version = parseGenerationLogFilename(entry.name, entry.name.endsWith('.zstd') ? 'zstd' : 'none')
    if (version === undefined) continue
    result.push({ name: entry.name, version })
  }
  return result.sort((left, right) => right.version - left.version)
}

async function encodedGeneration(source: string, path: string, version: number): Promise<Buffer> {
  const entry = await lstat(path)
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('History generation requires a regular file')
  const input = await readFile(path)
  let text = input
  if (path.endsWith('.zstd')) {
    const { frames, tornStart } = scanZstdFrames(input)
    if (tornStart !== undefined) throw new Error('History has an incomplete compressed frame')
    const decoded: Buffer[] = []
    for (const frame of frames) decoded.push(await decompressZstdFrame(input.subarray(frame.start, frame.end)))
    text = Buffer.concat(decoded)
  }
  const newline = text.indexOf(10)
  if (newline < 0) throw new Error('History header is incomplete')
  const header: unknown = JSON.parse(text.subarray(0, newline).toString('utf8'))
  const result = sessionFormatCatalog.readHeader(header)
  if (result.status !== 'current' && result.status !== 'migration-required') throw new Error('History header is unsupported')
  if (result.storedVersion !== version) throw new Error('History filename and header versions differ')
  const expected = generationLogPath(source, result.header.cwd, result.header.id as SessionId, version,
    path.endsWith('.zstd') ? 'zstd' : 'none')
  if (await realpath(expected) !== await realpath(path)) throw new Error('History header and directory identities differ')
  const first = await compress(text.subarray(0, newline + 1), checksum)
  return text.length === newline + 1 ? first : Buffer.concat([first, await compress(text.subarray(newline + 1), checksum)])
}

/**
 * Publish checksummed copies of each highest generation under `sessions-desktop`, retaining `sessions`.
 * A checkpoint prevents reimport after edits or deletion; failures affect only their source Session.
 * @param home - Desktop Harness home, prepared before the Host launches.
 * @returns active root and safe failure ids; unreadable items are skipped and retried on a later launch.
 * @throws when the active storage directory itself cannot be created or used.
 */
export async function prepareDesktopHistory(home: string): Promise<DesktopHistoryPreparation> {
  const root = join(home, 'sessions-desktop')
  const receipts = join(home, '.migration', 'zerowall-v9', 'history-v1')
  const failures: string[] = []
  let imported = 0
  await mkdir(root, { recursive: true })
  await directory(root)
  try {
    await mkdir(receipts, { recursive: true })
    await directory(receipts)
    const source = join(home, 'sessions')
    if (await exists(source)) {
      await directory(source)
      const active = new Map<string, string>()
      for (const project of await readdir(root, { withFileTypes: true })) {
        if (!project.isDirectory() || project.isSymbolicLink()) continue
        for (const session of await readdir(join(root, project.name), { withFileTypes: true })) {
          if (session.isDirectory()) active.set(session.name, join(root, project.name, session.name))
        }
      }
      for (const project of await readdir(source, { withFileTypes: true })) {
        const projectId = createHash('sha256').update(project.name).digest('hex')
        if (!project.isDirectory() || project.isSymbolicLink()) { failures.push(projectId); continue }
        let sessions
        try { sessions = await readdir(join(source, project.name), { withFileTypes: true }) }
        catch (_error) { failures.push(projectId); continue }
        for (const session of sessions) {
          const id = createHash('sha256').update(project.name + '/' + session.name).digest('hex')
          const receipt = join(receipts, id + '.json')
          let staging: string | undefined
          try {
            if (await exists(receipt)) {
              const saved: unknown = JSON.parse(await readFile(receipt, 'utf8'))
              if (typeof saved !== 'object' || saved === null || !('schema' in saved) || saved.schema !== 1) {
                throw new Error('History checkpoint requires repair')
              }
              continue
            }
            if (!session.isDirectory() || session.isSymbolicLink()) throw new Error('History Session requires a directory')
            const path = join(source, project.name, session.name)
            const files = await generations(path)
            const file = files[0]
            if (file === undefined) continue
            if (files[1]?.version === file.version) throw new Error('History has ambiguous encodings for its highest generation')
            const target = join(root, project.name, session.name)
            const duplicate = active.get(session.name)
            if (duplicate !== undefined && duplicate !== target) throw new Error('History has a duplicate Session identity')
            const content = await encodedGeneration(source, join(path, file.name), file.version)
            await mkdir(join(root, project.name), { recursive: true })
            await directory(join(root, project.name))
            staging = join(receipts, '.import-' + randomUUID())
            await mkdir(staging)
            const name = file.name.endsWith('.zstd') ? file.name : file.name + '.zstd'
            await writeFile(join(staging, name), content, { flag: 'wx', mode: 0o600, flush: true })
            if (await exists(target)) {
              // An interrupted publication can leave the directory before its checkpoint.
              await directory(target)
              for (const name of await readdir(staging)) {
                if (!(await readFile(join(staging, name))).equals(await readFile(join(target, name)))) {
                  throw new Error('Published history differs; active data was retained')
                }
              }
            } else await rename(staging, target)
            active.set(session.name, target)
            const temporary = receipt + '.' + randomUUID() + '.tmp'
            await writeFile(temporary, '{"schema":1}\n', { flag: 'wx', mode: 0o600, flush: true })
            await rename(temporary, receipt)
            imported++
          } catch (_error) { failures.push(id) }
          finally {
            if (staging !== undefined) {
              try { await rm(staging, { recursive: true, force: true }) }
              catch (_error) { failures.push(id) }
            }
          }
        }
      }
    }
  } catch (_error) { failures.push('preparation') }
  const result = { root, imported, failures }
  try { await writeFile(join(receipts, 'result.json'), JSON.stringify({ schema: 1, imported, failures }) + '\n', { mode: 0o600 }) }
  catch (_error) { failures.push('report') }
  if (failures.length > 0) console.warn(`Desktop history: ${failures.length} items unavailable; available history remains active. Retained sources will retry on next launch.`)
  return result
}
