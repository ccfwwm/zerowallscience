import { Context } from '@deepseek-ai/cordis'
import { appendPluginRecord, Session, SessionId, KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import * as JsonlSessionPersistence from '../../../../packages/session/session-persistence-jsonl/src/index.ts'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { ClaudeTranscript } from '../src/shared/types.js'
import { ClaudeMetricsCollector } from '../src/host/metrics.js'

it('persists Claude process records and reopens the session with its plugin vocabulary absent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-claude-history-'))
  let ctx = new Context()
  try {
    await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
    const id = SessionId('claude-history-restart')
    const session = Session.create(id)
    session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Inspect the project' }] }), { surfaceOp: 'append' })
    const transcript: ClaudeTranscript = { turn: 1, step: 1, renderer: 'plugin', running: false, activity: [
      { index: 0, kind: 'reasoning', text: 'Check the file', ended: true },
      { index: 1, kind: 'tool-call', text: '{"file_path":"README.md"}', id: 'read-1', name: 'Read', result: 'file content', ended: true },
    ] }
    appendPluginRecord(session, 'plugin:zerowall-claude/turn', { turn: 1, step: 1 })
    appendPluginRecord(session, 'plugin:zerowall-claude/transcript', transcript)
    appendPluginRecord(session, 'plugin:zerowall-claude/metrics', new ClaudeMetricsCollector({ runId: 'run', nativeSessionId: 'native', provider: 'test', model: 'test', turn: 1, main: true }).snapshot())
    expect(KNOWN_SESSION_EVENT_TYPES.has('zerowall-claude/transcript')).toBe(false)
    expect(KNOWN_SESSION_EVENT_TYPES.has('zerowall-claude/metrics')).toBe(false)
    const writer = await ctx.sessionPersistence.create(session.header)
    await writer.append(session.snapshotEvents())
    await writer.flush()
    await writer.close()
    await ctx.fiber.dispose()
    ctx = new Context()
    // Only the DSH backend is mounted: the Claude service and its vocabulary
    // are absent, as after plugin removal or a normal cold startup.
    await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
    const reader = await ctx.sessionPersistence.open(id, 'read')
    try {
      const stored = await reader.read()
      const reopened = Session.create(id, stored.events, reader.header)
      expect(reopened.deriveMessages()).toMatchObject([{ role: 'user', content: [{ type: 'text', text: 'Inspect the project' }] }])
      expect(reopened.snapshotEvents().find(event => event.type === 'plugin:zerowall-claude/transcript')).toMatchObject({ ignorable: true, data: transcript })
      expect(reopened.snapshotEvents().find(event => event.type === 'plugin:zerowall-claude/metrics')).toMatchObject({ ignorable: true, data: { runId: 'run' } })
    } finally { await reader.close() }
  } finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true, maxRetries: 3 }) }
})
