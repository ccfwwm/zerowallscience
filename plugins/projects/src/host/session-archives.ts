import { Context } from '@deepseek-ai/cordis'
import { SessionId, SessionLogOffset, type SessionHeader, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import { createSessionArchive } from '@zerowallscience/research-store'
import type { SessionArchiveV1 } from '@zerowallscience/research-store/types'
import { link, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'

export interface RestoredSessionArchive {
  id: string
  path: string
}

export async function collectProjectSessionArchives(
  persistence: SessionPersistence,
  rootPath: string,
): Promise<SessionArchiveV1[]> {
  const snapshots = (await persistence.list())
    .filter(({ header }) => header.cwd === rootPath)
    .sort((a, b) => a.header.createdAt - b.header.createdAt || String(a.header.id).localeCompare(String(b.header.id)))
  const archives: SessionArchiveV1[] = []
  for (const { header } of snapshots) {
    const handle = await persistence.open(header.id, 'read')
    try {
      const { events } = await handle.read()
      const rows = [sessionFormatCatalog.encodeCurrentHeader({ ...handle.header, delegationDepth: handle.header.delegationDepth ?? 0 }, handle.inheritedEventCount)]
      for (const event of events) {
        rows.push(sessionFormatCatalog.encodeCurrentEvent(event as unknown as Parameters<typeof sessionFormatCatalog.encodeCurrentEvent>[0]))
      }
      archives.push(createSessionArchive(rows.map(row => JSON.stringify(row)).join('\n') + '\n'))
    } finally {
      await handle.close()
    }
  }
  return archives
}

export async function restoreSessionArchives(
  persistence: SessionPersistence,
  archives: readonly SessionArchiveV1[],
  isLive: (id: string) => boolean = () => false,
): Promise<RestoredSessionArchive[]> {
  if (!(persistence instanceof JsonlSessionPersistence)) {
    throw new Error('ZeroWall session import requires the JSONL DSH session backend.')
  }
  const ids = new Set<string>()
  const prepared = archives.map(archive => {
    const checked = createSessionArchive(archive.content)
    if (checked.sessionId !== archive.sessionId || checked.sha256 !== archive.sha256) throw new Error('Session archive identity or checksum mismatch.')
    if (ids.has(archive.sessionId)) throw new Error(`Duplicate session archive: ${archive.sessionId}`)
    ids.add(archive.sessionId)
    const rows: unknown[] = archive.content.trimEnd().split('\n').map(line => JSON.parse(line) as unknown)
    const restore = sessionFormatCatalog.createRestore(rows[0], { recovery: 'strict', validation: 'current' })
    for (const row of rows.slice(1)) restore.decodeRow(row)
    // The installed catalog validates and migrates both headers and event bodies.
    const artifact = restore.finish()
    return {
      header: artifact.header as unknown as SessionHeader,
      events: artifact.events as readonly SessionEvent[],
      inheritedEventCount: SessionLogOffset(artifact.inheritedEventCount),
    }
  })
  for (const { header } of prepared) {
    if (isLive(header.id)) throw new Error(`DSH session is currently live: ${header.id}`)
    if (await persistence.stat(SessionId(header.id)) !== undefined) throw new Error(`DSH session already exists: ${header.id}`)
  }
  if (prepared.length === 0) return []

  const root = resolve(persistence.config.root)
  await mkdir(root, { recursive: true })
  // A sibling directory keeps hard-link publication on the same filesystem.
  const staging = await mkdtemp(join(dirname(root), '.zerowall-session-import-'))
  const ctx = new Context()
  const fiber = await ctx.plugin(JsonlSessionPersistence, { ...persistence.config, root: staging })
  const restored: RestoredSessionArchive[] = []
  try {
    const staged = new Map<string, string>()
    for (const entry of prepared) {
      const handle = await ctx.sessionPersistence.create(entry.header, { inheritedEventCount: entry.inheritedEventCount })
      try {
        await handle.append(entry.events)
        await handle.flush()
      } finally {
        await handle.close()
      }
      const files = await readdir(staging, { recursive: true, withFileTypes: true })
      for (const file of files) {
        if (!file.isFile() || !/\.jsonl(?:\.zstd)?$/.test(file.name)) continue
        const source = join(file.parentPath, file.name)
        if (!staged.has(source)) staged.set(source, entry.header.id)
      }
    }
    if (staged.size !== prepared.length) throw new Error('Session staging produced an unexpected artifact count.')
    for (const [source, id] of staged) {
      const destination = join(root, relative(staging, source))
      await mkdir(dirname(destination), { recursive: true })
      // link fails atomically if a concurrent importer already published this file.
      await link(source, destination)
      restored.push({ id, path: destination })
    }
    for (const entry of prepared) {
      if (await persistence.stat(entry.header.id) === undefined) throw new Error(`Imported session is not readable: ${entry.header.id}`)
    }
    return restored
  } catch (error) {
    await Promise.all(restored.map(entry => rm(entry.path, { force: true })))
    throw error
  } finally {
    await fiber.dispose()
    await rm(staging, { recursive: true, force: true })
  }
}
