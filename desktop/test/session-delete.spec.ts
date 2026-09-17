import { mkdtemp, mkdir, writeFile, readFile, rm, rename, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { deleteStoredSession, validateSessionDirectory } from '../src/main/session-delete.js'

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
})
