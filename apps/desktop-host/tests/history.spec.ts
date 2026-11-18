/** Mixed legacy encodings cannot prevent healthy Desktop history from loading. */
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { constants, zstdCompress, zstdDecompress } from 'node:zlib'
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import { SessionId } from '@deepseek-ai/dsh-session'
import { oneTurnLog } from '../../../packages/session/session-persistence/tests/contract.ts'
import { eventLines } from '../../../packages/session/session-persistence-jsonl/src/format.ts'
import { prepareDesktopHistory } from '../src/history.ts'

const compress = promisify(zstdCompress), decompress = promisify(zstdDecompress)
const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'desktop-history-')); roots.push(root)
  const bytes = (id: string) => Buffer.from(JSON.stringify(sessionFormatCatalog.encodeCurrentHeader({
    id, version: sessionFormatCatalog.currentVersion, createdAt: 1, isSeeded: false, delegationDepth: 0,
  }, 0)) + '\n')
  const put = async (id: string, data: Buffer | string, suffix = '.jsonl') => {
    const dir = join(root, 'sessions', '_no-cwd', id); await mkdir(dir, { recursive: true })
    const path = join(dir, `session.v${sessionFormatCatalog.currentVersion}${suffix}`)
    await writeFile(path, data); return path
  }
  return { root, bytes, put }
}

it('normalizes raw and compressed histories, preserving sources and every successful import across restarts', async () => {
  const f = await fixture()
  const raw = f.bytes('raw'), compressed = await compress(f.bytes('compressed'), { params: { [constants.ZSTD_c_checksumFlag]: 1 } })
  const sourceRaw = await f.put('raw', raw), sourceCompressed = await f.put('compressed', compressed, '.jsonl.zstd')
  const first = await prepareDesktopHistory(f.root)
  expect(first).toMatchObject({ imported: 2, failures: [] })
  expect(await readFile(sourceRaw)).toEqual(raw)
  expect(await readFile(sourceCompressed)).toEqual(compressed)
  const target = join(first.root, '_no-cwd', 'raw', `session.v${sessionFormatCatalog.currentVersion}.jsonl.zstd`)
  expect(await decompress(await readFile(target))).toEqual(raw)
  await writeFile(target, await compress(Buffer.concat([raw, Buffer.from('later conversation\n')]), { params: { [constants.ZSTD_c_checksumFlag]: 1 } }))
  const edited = await readFile(target)
  const second = await prepareDesktopHistory(f.root)
  expect(second).toMatchObject({ imported: 0, failures: [] })
  expect(await readFile(target)).toEqual(edited)
  await rm(join(first.root, '_no-cwd', 'compressed'), { recursive: true })
  expect((await prepareDesktopHistory(f.root)).imported).toBe(0)
  expect(await readdir(join(first.root, '_no-cwd'))).toEqual(['raw'])
})

it('retains every compressed body frame and reads the imported conversation through the backend', async () => {
  const f = await fixture(), events = oneTurnLog()
  const header = f.bytes('conversation')
  const body = Buffer.from(eventLines(events) + '\n')
  const source = Buffer.concat([
    await compress(header), await compress(Buffer.from(eventLines(events.slice(0, 3)) + '\n')),
    await compress(Buffer.from(eventLines(events.slice(3)) + '\n')),
  ])
  const path = await f.put('conversation', source, '.jsonl.zstd')
  const bodyFrame = await compress(body, { params: { [constants.ZSTD_c_checksumFlag]: 1 } })
  const broken = Buffer.concat([await compress(f.bytes('damaged-body')), bodyFrame])
  broken[broken.length - 1] = broken[broken.length - 1]! ^ 255
  await f.put('damaged-body', broken, '.jsonl.zstd')
  await f.put('torn-body', Buffer.concat([await compress(f.bytes('torn-body')), bodyFrame.subarray(0, -1)]), '.jsonl.zstd')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const prepared = await prepareDesktopHistory(f.root)
  expect(prepared).toMatchObject({ imported: 1 })
  expect(prepared.failures).toHaveLength(2)
  const target = await readFile(join(prepared.root, '_no-cwd/conversation', `session.v${sessionFormatCatalog.currentVersion}.jsonl.zstd`))
  const decoded = await Promise.all(JsonlSessionPersistence.scanZstdFrames(target).frames.map(frame =>
    JsonlSessionPersistence.decompressZstdFrame(target.subarray(frame.start, frame.end))))
  expect(Buffer.concat(decoded)).toEqual(Buffer.concat([header, body]))
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: prepared.root, compression: 'zstd' })
  const handle = await ctx.sessionPersistence.open(SessionId('conversation'), 'read')
  try { expect((await handle.read()).events).toEqual(events) }
  finally { await handle.close() }
  expect(await readFile(path)).toEqual(source)
})

it('isolates a damaged highest generation, retries it later, and never selects its older generation', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const f = await fixture(), broken = await f.put('broken', 'bad header\n')
  const predecessor = join(f.root, 'sessions/_no-cwd/broken/session.jsonl')
  await writeFile(predecessor, 'older retained generation\n')
  await mkdir(join(f.root, 'sessions/_no-cwd/broken/session.v1.jsonl'))
  await f.put('healthy', f.bytes('healthy'))
  const first = await prepareDesktopHistory(f.root)
  expect(first.imported).toBe(1)
  expect(first.failures).toHaveLength(1)
  expect(await readdir(join(first.root, '_no-cwd'))).toEqual(['healthy'])
  expect(warning).toHaveBeenCalled()
  await writeFile(broken, f.bytes('broken'))
  expect(await prepareDesktopHistory(f.root)).toMatchObject({ imported: 1, failures: [] })
  expect(await readFile(predecessor, 'utf8')).toBe('older retained generation\n')
})

it('keeps the real backend available beside corrupt, misplaced, unsupported and ambiguous histories', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const f = await fixture()
  await f.put('healthy', f.bytes('healthy'))
  await f.put('wrong-id', f.bytes('different-id'))
  await f.put('compressed', 'not zstd', '.jsonl.zstd')
  await f.put('ambiguous', f.bytes('ambiguous'))
  await f.put('ambiguous', await compress(f.bytes('ambiguous')), '.jsonl.zstd')
  const future = await f.put('future', f.bytes('future'))
  await writeFile(future.replace(`v${sessionFormatCatalog.currentVersion}`, 'v999'), '{}\n')
  const prepared = await prepareDesktopHistory(f.root)
  expect(prepared.imported).toBe(1)
  expect(prepared.failures).toHaveLength(4)
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: prepared.root, compression: 'zstd' })
  expect((await ctx.sessionPersistence.list()).map(item => item.header.id)).toEqual(['healthy'])
})

it('keeps a usable empty history when the source tree cannot be enumerated', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const f = await fixture(); await writeFile(join(f.root, 'sessions'), 'not a directory')
  const prepared = await prepareDesktopHistory(f.root)
  expect(prepared.failures).toEqual(['preparation'])
  expect(await readdir(prepared.root)).toEqual([])
})

it('starts a persistent recovery store when the active directory is unusable and keeps it on later launches', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const f = await fixture()
  await f.put('healthy', f.bytes('healthy'))
  await writeFile(join(f.root, 'sessions-desktop'), 'retained broken directory entry')
  const prepared = await prepareDesktopHistory(f.root)
  expect(prepared.root).toBe(join(f.root, 'sessions-desktop-recovery'))
  expect(prepared.failures).toContain('active-root')
  expect(await readFile(join(f.root, 'sessions-desktop'), 'utf8')).toBe('retained broken directory entry')
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: prepared.root, compression: 'zstd' })
  expect((await ctx.sessionPersistence.list()).map(item => item.header.id)).toEqual(['healthy'])
  await rm(join(f.root, 'sessions-desktop'))
  const next = await prepareDesktopHistory(f.root)
  expect(next.root).toBe(prepared.root)
  expect((await ctx.sessionPersistence.list()).map(item => item.header.id)).toEqual(['healthy'])
})

it('isolates mixed active encodings without losing newer active conversations or changing their sources', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const f = await fixture()
  const original = await f.put('healthy', f.bytes('healthy'))
  const active = join(f.root, 'sessions-desktop/_no-cwd/newer')
  await mkdir(active, { recursive: true })
  const path = join(active, `session.v${sessionFormatCatalog.currentVersion}.jsonl`)
  await writeFile(path, f.bytes('newer'))
  const prepared = await prepareDesktopHistory(f.root)
  expect(prepared.root).toBe(join(f.root, 'sessions-desktop-recovery'))
  expect(prepared.failures).toContain('active-root')
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: prepared.root, compression: 'zstd' })
  expect((await ctx.sessionPersistence.list()).map(item => item.header.id).sort()).toEqual(['healthy', 'newer'])
  expect(await readFile(path)).toEqual(f.bytes('newer'))
  expect(await readFile(original)).toEqual(f.bytes('healthy'))
})

it('keeps healthy active history usable beside a damaged header and a malformed recovery directory', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const f = await fixture()
  await f.put('healthy', f.bytes('healthy'))
  const first = await prepareDesktopHistory(f.root)
  const damaged = join(first.root, '_no-cwd/damaged')
  await mkdir(damaged)
  const path = join(damaged, `session.v${sessionFormatCatalog.currentVersion}.jsonl.zstd`)
  const retained = await compress(Buffer.from('bad header\n'))
  await writeFile(path, retained)
  await writeFile(join(f.root, 'sessions-desktop-recovery'), 'retained recovery evidence')
  const prepared = await prepareDesktopHistory(f.root)
  expect(prepared.root).toBe(first.root)
  expect(prepared.failures).toContain('recovery-root-unavailable')
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: prepared.root, compression: 'zstd' })
  expect((await ctx.sessionPersistence.list()).map(item => item.header.id)).toEqual(['healthy'])
  const handle = await ctx.sessionPersistence.open(SessionId('healthy'), 'read')
  try { expect((await handle.read()).events).toEqual([]) }
  finally { await handle.close() }
  expect(await readFile(path)).toEqual(retained)
})

it('repairs a second unusable store without reusing primary checkpoints and persists resumed conversations', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const f = await fixture()
  const source = await f.put('retained', f.bytes('retained'))
  const first = await prepareDesktopHistory(f.root)
  await rm(first.root, { recursive: true })
  await writeFile(first.root, 'retained unusable active entry')
  await writeFile(join(f.root, 'sessions-desktop-recovery'), 'retained unusable recovery entry')
  const prepared = await prepareDesktopHistory(f.root)
  expect(prepared.root).toBe(join(f.root, 'sessions-desktop-recovery-2'))
  expect(prepared.imported).toBe(1)
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: prepared.root, compression: 'zstd' })
  const writer = await ctx.sessionPersistence.open(SessionId('retained'), 'write')
  try { await writer.append(oneTurnLog()) }
  finally { await writer.close() }
  await ctx.fiber.dispose()
  const next = await prepareDesktopHistory(f.root)
  expect(next.root).toBe(prepared.root)
  const reopened = new Context(); contexts.push(reopened)
  await reopened.plugin(JsonlSessionPersistence, { root: next.root, compression: 'zstd' })
  expect((await reopened.sessionPersistence.list()).map(item => item.header.id)).toEqual(['retained'])
  const reader = await reopened.sessionPersistence.open(SessionId('retained'), 'read')
  try { expect((await reader.read()).events).toEqual(oneTurnLog()) }
  finally { await reader.close() }
  expect(await readFile(source)).toEqual(f.bytes('retained'))
  expect(await readFile(first.root, 'utf8')).toBe('retained unusable active entry')
})
