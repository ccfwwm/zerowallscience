import { Context } from '@deepseek-ai/cordis'
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '../../../deepseek-harness/packages/session/session-persistence-jsonl/src/index.ts'
import { generationLogPath } from '../../../deepseek-harness/packages/session/session-persistence-jsonl/src/format.ts'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import '../src/host/index.js'

describe('removed module history compatibility', () => {
  it.skipIf(!process.env.ZEROWALL_VERIFY_HISTORY_PATH)('reads a private history copy without modifying its source', async () => {
    const source = process.env.ZEROWALL_VERIFY_HISTORY_PATH!
    const bytes = await readFile(source)
    const header = JSON.parse(bytes.toString('utf8').split('\n')[0]!)
    const root = await mkdtemp(join(tmpdir(), 'zerowall-real-history-'))
    const path = join(root, basename(dirname(dirname(source))), header.id, 'session.v3.jsonl')
    const ctx = new Context()
    try {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, bytes)
      await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
      const handle = await ctx.sessionPersistence.open(SessionId(header.id), 'read')
      try {
        const record = await handle.read()
        expect(record.events.some(event => event.type === 'zerowall/capabilities/selection')).toBe(true)
        expect(record.events.length).toBeGreaterThan(52)
      } finally { await handle.close() }
      expect(await readFile(source)).toEqual(bytes)
      expect(await readFile(path)).toEqual(bytes)
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it.each(['zerowall/capabilities/selection', 'future/required'])('reads only recognized historical metadata: %s', async type => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-history-'))
    const id = SessionId('legacy-history')
    const path = generationLogPath(root, undefined, id, 3, 'none')
    const event = { type, seq: 1, time: 2, data: { tools: ['read'], disabled: [], onDemand: ['python'] } }
    const bytes = Buffer.from([
      { type: 'session', version: 3, id, createdAt: 1, isSeeded: false, delegationDepth: 0 },
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
      event,
    ].map(row => JSON.stringify(row)).join('\n') + '\n')
    const ctx = new Context()
    try {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, bytes)
      await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
      if (type === 'future/required') {
        await expect(ctx.sessionPersistence.open(id, 'read')).rejects.toThrow('unknown to this harness')
        expect(await readFile(path)).toEqual(bytes)
        return
      }
      for (const mode of ['read', 'write'] as const) {
        const handle = await ctx.sessionPersistence.open(id, mode)
        try {
          const record = await handle.read()
          expect(record.events[1]).toEqual(event)
          expect(await readFile(path)).toEqual(bytes)
          if (mode === 'write') {
            await handle.append([{ type: 'turn/end', seq: SessionSeq(2), time: 3, data: { turn: 1, reason: { kind: 'completed' } } }])
          }
        } finally { await handle.close() }
      }
      const stored = await readFile(path)
      expect(stored.subarray(0, bytes.length)).toEqual(bytes)
      expect(JSON.parse(stored.toString().trim().split('\n').at(-1)!)).toMatchObject({ seq: 2, type: 'turn/end' })
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})
