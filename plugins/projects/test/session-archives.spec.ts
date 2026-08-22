import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'
import type { SessionPersistence, SessionRawArtifact } from '@deepseek-ai/dsh-session-persistence'
import { createSessionArchive } from '@zerowallscience/research-store'
import { collectProjectSessionArchives, restoreSessionArchives } from '../src/host/index.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('ZeroWall project session archives', () => {
  it('exports only sessions owned by the project root in deterministic order', async () => {
    const root = temporaryRoot()
    const first = rawSession('later', 'C:/science/project', 20)
    const second = rawSession('earlier', 'C:/science/project', 10)
    const foreign = rawSession('foreign', 'C:/science/other', 5)
    const persistence = fakePersistence(root, [first, second, foreign])

    const archives = await collectProjectSessionArchives(persistence, 'C:/science/project')
    expect(archives.map((archive) => archive.sessionId)).toEqual(['earlier', 'later'])
    expect(archives).toEqual([createSessionArchive(second.content), createSessionArchive(first.content)])
  })

  it('restores plaintext JSONL without overwriting an existing or live session', async () => {
    const root = temporaryRoot()
    const raw = rawSession('portable', 'C:/science/project', 10)
    const persistence = fakePersistence(root, [])
    const archive = createSessionArchive(raw.content)

    const restored = await restoreSessionArchives(persistence, [archive])
    expect(restored.map((entry) => entry.id)).toEqual(['portable'])
    expect(readFileSync(restored[0]!.path, 'utf8')).toBe(raw.content)
    await expect(restoreSessionArchives(persistence, [archive])).rejects.toThrow('already exists')

    const livePersistence = fakePersistence(temporaryRoot(), [])
    await expect(restoreSessionArchives(livePersistence, [archive], (id) => id === 'portable')).rejects.toThrow('currently live')
  })
})

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'zerowall-session-archive-'))
  roots.push(root)
  return root
}

function rawSession(id: string, cwd: string, createdAt: number): SessionRawArtifact {
  const content = `${JSON.stringify({ type: 'session', version: 0, id, createdAt, cwd, delegationDepth: 0 })}\n`
  return { meta: { version: 0, id: SessionId(id), createdAt, cwd, delegationDepth: 0 }, filename: 'session.jsonl', content }
}

function fakePersistence(root: string, initial: SessionRawArtifact[]): SessionPersistence {
  const artifacts = new Map(initial.map((artifact) => [String(artifact.meta.id), artifact]))
  return {
    supportsRawArtifacts: true,
    list: async () => [...artifacts.values()].map((artifact) => artifact.meta),
    readRaw: async (id: string) => artifacts.get(String(id)),
    locate: (header: SessionHeader) => ({ kind: 'jsonl', path: join(root, String(header.id), 'session.jsonl') }),
  } as unknown as SessionPersistence
}
