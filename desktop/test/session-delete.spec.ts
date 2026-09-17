import { mkdtemp, mkdir, writeFile, readFile, rm, rename, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { deleteStoredSession, findSessionDirectory } from '../src/main/session-delete.js'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-delete-'))
  const sessions = join(root, 'sessions')
  const target = join(sessions, 'project', 'session-one')
  const other = join(sessions, 'project', 'session-two')
  for (const [path, id] of [[target, 'session-one'], [other, 'session-two']]) {
    await mkdir(path!, { recursive: true }); await writeFile(join(path!, 'session.v3.jsonl'), JSON.stringify({ id }) + '\n')
  }
  return { root, sessions, target, other, close: () => rm(root, { recursive: true, force: true }) }
}

describe('confirmed desktop session deletion', () => {
  it('cancel never stops the Host or changes either session', async () => {
    const f = await fixture(); const calls: string[] = []
    try {
      expect(await deleteStoredSession({ root: f.sessions, sessionId: 'session-one', assertIdle: async () => {}, confirm: async () => false,
        stop: async () => { calls.push('stop') }, start: async () => { calls.push('start') }, trash: async () => { calls.push('trash') } })).toBe(false)
      expect(calls).toEqual([]); expect(await findSessionDirectory(f.sessions, 'session-one')).toBe(f.target)
    } finally { await f.close() }
  })
  it('rechecks activity, stops writers, removes only the chosen session and restarts', async () => {
    const f = await fixture(); const calls: string[] = []
    try {
      await deleteStoredSession({ root: f.sessions, sessionId: 'session-one', assertIdle: async () => { calls.push('idle') }, confirm: async () => { calls.push('confirm'); return true },
        stop: async () => { calls.push('stop') }, start: async () => { calls.push('start') }, trash: async path => { calls.push('trash'); await rename(path, join(f.root, 'recycle')) } })
      expect(calls).toEqual(['idle', 'confirm', 'idle', 'stop', 'trash', 'start'])
      await expect(findSessionDirectory(f.sessions, 'session-one')).rejects.toThrow('not found')
      expect(await readFile(join(f.other, 'session.v3.jsonl'), 'utf8')).toContain('session-two')
    } finally { await f.close() }
  })
  it('running task after confirmation blocks deletion; failed trash restarts the Host', async () => {
    const f = await fixture(); let checks = 0; let stopped = false; let restarted = false
    const ops = { root: f.sessions, sessionId: 'session-one', confirm: async () => true,
      stop: async () => { stopped = true }, start: async () => { restarted = true }, trash: async () => { throw new Error('trash failed') } }
    try {
      await expect(deleteStoredSession({ ...ops, assertIdle: async () => { if (++checks === 2) throw new Error('busy') } })).rejects.toThrow('busy')
      expect(stopped).toBe(false)
      await expect(deleteStoredSession({ ...ops, assertIdle: async () => {} })).rejects.toThrow('trash failed')
      expect(restarted).toBe(true); expect(await findSessionDirectory(f.sessions, 'session-one')).toBe(f.target)
    } finally { await f.close() }
  })
  it('rejects path traversal, mismatched headers and junctions', async () => {
    const f = await fixture()
    try {
      await expect(findSessionDirectory(f.sessions, '../project')).rejects.toThrow('Invalid')
      await writeFile(join(f.target, 'session.v3.jsonl'), '{"id":"wrong"}\n')
      await expect(findSessionDirectory(f.sessions, 'session-one')).rejects.toThrow('does not match')
      await symlink(f.other, join(f.sessions, 'project', 'session-link'), 'junction')
      await expect(findSessionDirectory(f.sessions, 'session-link')).rejects.toThrow('outside')
    } finally { await f.close() }
  })
})
