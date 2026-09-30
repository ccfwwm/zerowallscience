import { mkdtemp, mkdir, writeFile, readFile, rm, rename, symlink, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { deleteStoredSession, parseSessionDeleteRpcResponse, recoverSessionDeletions, sessionDeletionJournal, validateSessionDirectory } from '../src/main/session-delete.js'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-delete-'))
  const sessions = join(root, 'sessions')
  const target = join(sessions, 'project', 'session-one')
  const other = join(sessions, 'project', 'session-two')
  for (const path of [target, other]) {
    await mkdir(path, { recursive: true }); await writeFile(join(path, 'session.v5.jsonl'), 'history')
  }
  const calls: string[] = []
  const ops = { root: sessions, sessionId: 'session-one', confirm: async () => { calls.push('confirm'); return true },
    prepare: async () => { calls.push('prepare'); return { token: 'lease', path: target } },
    commit: async (token: string) => { expect(token).toBe('lease'); calls.push('commit') },
    abort: async () => { calls.push('abort') },
    trash: async (path: string) => { calls.push('trash'); await rename(path, join(root, 'recycle')) } }
  return { root, sessions, target, other, calls, ops, close: () => rm(root, { recursive: true, force: true }) }
}

describe('local session deletion without restarting the Host', () => {
  it('reports plain-text HTTP errors without leaking a JSON parse exception', () => {
    expect(() => parseSessionDeleteRpcResponse({ ok: false, status: 404, text: 'not found' }, '会话操作失败。'))
      .toThrow('会话操作失败。 (HTTP 404: not found)')
    expect(() => parseSessionDeleteRpcResponse({ ok: false, status: 404, text: 'not found' }, '会话操作失败。'))
      .not.toThrow('Unexpected token')
  })
  it('preserves JSON-RPC errors and unwraps successful values', () => {
    expect(parseSessionDeleteRpcResponse<{ token: string }>(
      { ok: true, status: 200, text: JSON.stringify({ result: { ok: true, value: { token: 'lease' } } }) },
      'Session operation failed',
    )).toEqual({ token: 'lease' })
    expect(() => parseSessionDeleteRpcResponse(
      { ok: false, status: 409, text: JSON.stringify({ result: { ok: false, error: { message: 'session is busy' } } }) },
      'Session operation failed',
    )).toThrow('session is busy (HTTP 409)')
  })

  it('cancellation performs no Host or filesystem operation', async () => {
    const f = await fixture()
    try {
      expect(await deleteStoredSession({ ...f.ops, confirm: async () => false })).toBe(false)
      expect(f.calls).toEqual([])
      expect(await readFile(join(f.target, 'session.v5.jsonl'), 'utf8')).toBe('history')
    } finally { await f.close() }
  })
  it('prepares only the target and commits after the OS move', async () => {
    const f = await fixture()
    try {
      expect(await deleteStoredSession(f.ops)).toBe(true)
      expect(f.calls).toEqual(['confirm', 'prepare', 'trash', 'commit'])
      expect(await readFile(join(f.other, 'session.v5.jsonl'), 'utf8')).toBe('history')
      expect(await readFile(join(f.root, 'recycle', 'session.v5.jsonl'), 'utf8')).toBe('history')
    } finally { await f.close() }
  })
  it('busy target never reaches trash and trash failure aborts the lease', async () => {
    const f = await fixture()
    try {
      await expect(deleteStoredSession({ ...f.ops, prepare: async () => { throw new Error('busy') } })).rejects.toThrow('busy')
      expect(f.calls).toEqual(['confirm'])
      f.calls.length = 0
      await expect(deleteStoredSession({ ...f.ops, trash: async () => { throw new Error('trash failed') } })).rejects.toThrow('trash failed')
      expect(f.calls).toEqual(['confirm', 'prepare', 'abort'])
      expect(await readFile(join(f.target, 'session.v5.jsonl'), 'utf8')).toBe('history')
    } finally { await f.close() }
  })
  it('rejects outside paths, another session, traversal and junctions', async () => {
    const f = await fixture()
    try {
      await expect(validateSessionDirectory(f.sessions, '../project', f.target)).rejects.toThrow('Invalid')
      await expect(validateSessionDirectory(f.sessions, 'session-one', f.other)).rejects.toThrow('Invalid')
      await expect(validateSessionDirectory(f.sessions, 'session-one', f.root)).rejects.toThrow('Invalid')
      const link = join(f.sessions, 'project', 'session-link')
      await symlink(f.other, link, 'junction')
      await expect(validateSessionDirectory(f.sessions, 'session-link', link)).rejects.toThrow('Invalid')
    } finally { await f.close() }
  })

  it('keeps a durable journal after trash succeeds but Host commit fails, then replays cleanup', async () => {
    const f = await fixture()
    const directory = join(f.root, 'pending')
    const token = '12345678-1234-4234-8234-123456789abc'
    try {
      await expect(deleteStoredSession({
        ...f.ops,
        prepare: async () => ({ token, path: f.target }),
        journal: sessionDeletionJournal(directory),
        commit: async () => { throw new Error('Host disconnected') },
      })).rejects.toThrow('Host disconnected')
      expect(f.calls).not.toContain('abort')
      expect(await readdir(directory)).toEqual(['session-one.json'])
      const committed: string[] = []
      await recoverSessionDeletions({
        directory, root: f.sessions,
        commit: async (sessionId, replayToken) => { committed.push(`${sessionId}:${replayToken}`) },
        abort: async () => { throw new Error('must not abort a moved directory') },
      })
      expect(committed).toEqual([`session-one:${token}`])
      expect(await readdir(directory)).toEqual([])
    } finally { await f.close() }
  })

  it('aborts and clears the journal when the OS trash move fails', async () => {
    const f = await fixture()
    const directory = join(f.root, 'pending')
    try {
      await expect(deleteStoredSession({
        ...f.ops,
        prepare: async () => ({ token: '12345678-1234-4234-8234-123456789abc', path: f.target }),
        journal: sessionDeletionJournal(directory),
        trash: async () => { throw new Error('recycle denied') },
      })).rejects.toThrow('recycle denied')
      expect(f.calls).toContain('abort')
      expect(await readdir(directory)).toEqual([])
      expect(await readFile(join(f.target, 'session.v5.jsonl'), 'utf8')).toBe('history')
    } finally { await f.close() }
  })
})
