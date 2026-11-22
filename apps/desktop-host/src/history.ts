/** Prepare a single-encoding Desktop history without changing imported Session generations. */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { constants, zstdCompress } from 'node:zlib'
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import { Context } from '@deepseek-ai/cordis'
import {
  decompressZstdFrame, generationLogPath, JsonlSessionPersistence, parseGenerationLogFilename, scanZstdFrames,
} from '@deepseek-ai/dsh-session-persistence-jsonl'
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

async function usableRoot(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
  await directory(path)
  const probe = join(path, '.write-' + randomUUID())
  await writeFile(probe, '', { flag: 'wx', mode: 0o600 })
  await rm(probe)
}

async function compatibleRoot(root: string): Promise<void> {
  const ids = new Set<string>()
  for (const project of await readdir(root, { withFileTypes: true })) {
    if (!project.isDirectory() || project.isSymbolicLink()) continue
    for (const session of await readdir(join(root, project.name), { withFileTypes: true })) {
      if (!session.isDirectory() || session.isSymbolicLink()) continue
      if (ids.has(session.name)) throw new Error('History has duplicate Session directories')
      ids.add(session.name)
      const files = await generations(join(root, project.name, session.name))
      if (files.some(file => !file.name.endsWith('.zstd'))) throw new Error('Active history contains mixed encodings')
    }
  }
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
  if (path.endsWith('.zstd')) return input
  const first = await compress(text.subarray(0, newline + 1), checksum)
  return text.length === newline + 1 ? first : Buffer.concat([first, await compress(text.subarray(newline + 1), checksum)])
}

/**
 * Import retained Desktop histories with checksummed copies and per-source checkpoints.
 * @param home - Desktop Harness home, prepared before the Host launches.
 * @returns active root and safe failure ids; unreadable items are skipped and retried on a later launch.
 * An unusable active directory selects the stable recovery directory; retained data is never removed.
 * @throws when neither persistent storage directory can be used.
 */
export async function prepareDesktopHistory(home: string): Promise<DesktopHistoryPreparation> {
  const primaryRoot = join(home, 'sessions-desktop')
  const recoveryRoot = join(home, 'sessions-desktop-recovery')
  const receipts = join(home, '.migration', 'zerowall-v9', 'history-v1')
  const failures: string[] = []
  const conflicts: string[] = []
  let imported = 0
  await mkdir(home, { recursive: true })
  const fixed = await exists(join(home, '.migration', 'desktop-home.json'))
  const recoveryNames = (await readdir(home)).filter(name => /^sessions-desktop-recovery(?:-[2-9]\d*|-1\d+)?$/u.test(name))
    .sort((left, right) => Number(right.split('recovery-')[1] ?? 1) - Number(left.split('recovery-')[1] ?? 1))
  let root: string | undefined
  for (const candidate of fixed ? [primaryRoot] : [...recoveryNames.map(name => join(home, name)), primaryRoot]) {
    try {
      await usableRoot(candidate)
      await compatibleRoot(candidate)
      root = candidate
      break
    } catch (error) {
      if (fixed) throw new Error('Desktop history directory is unavailable. Restore access and retry startup.', { cause: error })
      failures.push(candidate === primaryRoot ? 'active-root' : 'recovery-root-unavailable')
    }
  }
  if (root === undefined) {
    const sequence = Number(recoveryNames[0]?.split('recovery-')[1] ?? (recoveryNames.length === 0 ? 0 : 1)) + 1
    root = sequence === 1 ? recoveryRoot : `${recoveryRoot}-${sequence}`
    await usableRoot(root)
    await compatibleRoot(root)
  }
  if (root !== primaryRoot) failures.push('recovery-root')
  const checkpoints = root === primaryRoot ? receipts : join(receipts, basename(root))
  const complete = join(checkpoints, 'fixed-home-completed.json')
  const importing = fixed && !await exists(complete)
  try {
    await mkdir(checkpoints, { recursive: true })
    await directory(checkpoints)
    const sources = [...recoveryNames, 'sessions-desktop', 'sessions'].map(tree => join(home, tree)).filter(source => source !== root)
    const importedHomes = fixed ? [join(dirname(home), 'harness-v9'), home + '.before-fixed-home'] : []
    if (importing) {
      for (const prior of importedHomes) {
        if (!await exists(prior)) continue
        await directory(prior)
        const trees = (await readdir(prior)).filter(name => /^sessions(?:-desktop(?:-recovery(?:-\d+)?)?)?$/u.test(name))
        trees.sort((a, b) => Number(b === 'sessions-desktop') - Number(a === 'sessions-desktop'))
        sources.push(...trees.map(tree => join(prior, tree)))
      }
    }
    for (const source of sources) {
      const readers = new Map<'zstd' | 'none', JsonlSessionPersistence>()
      const tree = basename(source)
      try {
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
              const sourceKey = dirname(source) === home ? (tree === 'sessions' ? '' : tree + '/') : source + '/'
              const id = createHash('sha256').update(sourceKey + project.name + '/' + session.name).digest('hex')
              const receipt = join(checkpoints, id + '.json')
              let staging: string | undefined
              let publishing = false
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
                if (new Set(files.map(item => item.version)).size !== files.length) throw new Error('History has ambiguous encodings')
                const target = join(root, project.name, session.name)
                const existing = active.get(session.name)
                if (fixed && file.version === sessionFormatCatalog.currentVersion) {
                  const compression = file.name.endsWith('.zstd') ? 'zstd' : 'none'
                  const reader = readers.get(compression) ?? new JsonlSessionPersistence(new Context(), { root: source, compression })
                  readers.set(compression, reader)
                  await reader.readStoredLog(join(path, file.name), session.name as SessionId)
                }
                if (existing !== undefined && existing !== target) {
                  if (!fixed) throw new Error('History has a duplicate Session identity')
                  conflicts.push(id)
                } else {
                  publishing = true
                  await mkdir(join(root, project.name), { recursive: true })
                  await directory(join(root, project.name))
                  staging = join(checkpoints, '.import-' + randomUUID())
                  await mkdir(staging)
                  for (const generation of fixed ? files : [file]) {
                    publishing = false
                    const content = await encodedGeneration(source, join(path, generation.name), generation.version)
                    const name = generation.name.endsWith('.zstd') ? generation.name : generation.name + '.zstd'
                    publishing = true
                    await writeFile(join(staging, name), content, { flag: 'wx', mode: 0o600, flush: true })
                  }
                  if (await exists(target)) {
                    // An interrupted publication can leave the directory before its checkpoint.
                    await directory(target)
                    const highest = (await generations(target))[0]?.version ?? file.version
                    for (const generation of fixed ? files : [file]) {
                      const name = generation.name.endsWith('.zstd') ? generation.name : generation.name + '.zstd'
                      const output = join(target, name)
                      if (fixed && generation.version <= highest && !await exists(output)) {
                        await rename(join(staging, name), output)
                      } else if (generation.version > highest || !(await readFile(join(staging, name))).equals(await readFile(output))) {
                        if (!fixed) throw new Error('Published history differs; active data was retained')
                        if (!conflicts.includes(id)) conflicts.push(id)
                      }
                    }
                  } else await rename(staging, target)
                  active.set(session.name, target)
                  imported++
                }
                publishing = true
                const temporary = receipt + '.' + randomUUID() + '.tmp'
                await writeFile(temporary, '{"schema":1}\n', { flag: 'wx', mode: 0o600, flush: true })
                await rename(temporary, receipt)
              } catch (error) {
                if (fixed && publishing) throw new HistoryPublicationError('Could not write Desktop history. Restore access and retry startup.', { cause: error })
                failures.push(id)
              }
              finally {
                if (staging !== undefined) {
                  try { await rm(staging, { recursive: true, force: true }) }
                  catch (_error) { failures.push(id) }
                }
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof HistoryPublicationError) throw error
        failures.push(tree === 'sessions' ? 'preparation' : 'active-source')
      }
    }
    if (importing) {
      await writeFile(join(receipts, 'fixed-home-result.json'), JSON.stringify({ schema: 1, imported, failures, conflicts }) + '\n', { mode: 0o600 })
      if (failures.length === 0) await writeFile(complete, '{"schema":1}\n', { flag: 'wx', mode: 0o600, flush: true })
    }
  } catch (error) {
    if (fixed) throw error
    failures.push('preparation')
  }
  const result = { root, imported, failures }
  try { await writeFile(join(receipts, 'result.json'), JSON.stringify({ schema: 1, imported, failures }) + '\n', { mode: 0o600 }) }
  catch (_error) { failures.push('report') }
  if (failures.length > 0) console.warn(`Desktop history: ${failures.length} items unavailable; available history remains active. Retained sources will retry on next launch.`)
  return result
}

class HistoryPublicationError extends Error {}
