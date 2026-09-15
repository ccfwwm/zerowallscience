import { Context } from '@deepseek-ai/cordis'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { createSessionArchive } from '@zerowallscience/research-store'
import { collectProjectSessionArchives, restoreSessionArchives } from '../src/host/session-archives.js'

const roots: string[] = []
const disposers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('ZeroWall project session archives', () => {
  it.each(['none', 'zstd'] as const)('migrates legacy archives and round-trips current sessions with %s storage', async compression => {
    const persistence = await backend(compression)
    const cwd = join(tmpdir(), 'science-project')
    await restoreSessionArchives(persistence, [legacy('later', cwd, 20), legacy('earlier', cwd, 10), legacy('foreign', join(tmpdir(), 'other'), 5)])
    const archives = await collectProjectSessionArchives(persistence, cwd)
    expect(archives.map(archive => archive.sessionId)).toEqual(['earlier', 'later'])
    expect(JSON.parse(archives[0]!.content.split('\n')[0]!)).toMatchObject({ version: 3, isSeeded: false })
    const target = await backend(compression)
    await restoreSessionArchives(target, archives)
    expect(await collectProjectSessionArchives(target, cwd)).toEqual(archives)
  })

  it('refuses existing, live, duplicate, corrupt and invalid-body sessions before publication', async () => {
    const persistence = await backend('none')
    const archive = legacy('portable', join(tmpdir(), 'science-project'), 10)
    await expect(restoreSessionArchives(persistence, [archive], () => true)).rejects.toThrow('currently live')
    await expect(restoreSessionArchives(persistence, [archive, archive])).rejects.toThrow('Duplicate')
    await expect(restoreSessionArchives(persistence, [{ ...archive, sha256: 'wrong' }])).rejects.toThrow('checksum')
    const invalid = createSessionArchive(archive.content + '{"type":"unknown","seq":0,"time":1,"data":{}}\n')
    await expect(restoreSessionArchives(persistence, [invalid])).rejects.toThrow()
    expect(await persistence.list()).toEqual([])
    const restored = await restoreSessionArchives(persistence, [archive])
    expect(restored.map(entry => entry.id)).toEqual(['portable'])
    await expect(restoreSessionArchives(persistence, [archive])).rejects.toThrow('already exists')
    const handle = await persistence.open(SessionId('portable'), 'read')
    try {
      expect(handle.header.version).toBe(3)
      expect((await handle.read()).events).toEqual([])
    } finally {
      await handle.close()
    }
  })
})

function legacy(id: string, cwd: string, createdAt: number) {
  return createSessionArchive(JSON.stringify({ type: 'session', version: 0, id, createdAt, cwd, delegationDepth: 0 }) + '\n')
}

async function backend(compression: 'none' | 'zstd') {
  const root = mkdtempSync(join(tmpdir(), 'zerowall-session-archive-'))
  roots.push(root)
  const ctx = new Context()
  const fiber = await ctx.plugin(JsonlSessionPersistence, { root, compression })
  disposers.push(async () => { await fiber.dispose() })
  return ctx.sessionPersistence
}
