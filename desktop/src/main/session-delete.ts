import { lstat, mkdir, readFile, readdir, realpath, unlink, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'

export function validSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)
}

/** Revalidate the Host-resolved target before passing it to the OS trash API. */
export async function validateSessionDirectory(root: string, sessionId: string, path: string): Promise<string> {
  if (!validSessionId(sessionId)) throw new Error('Invalid session id')
  const canonicalRoot = await realpath(root)
  const canonical = await realpath(path)
  const suffix = relative(canonicalRoot, canonical)
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink() || !suffix || isAbsolute(suffix)
    || suffix.startsWith('..') || basename(canonical) !== sessionId
    || canonical.toLowerCase() !== resolve(path).toLowerCase()) throw new Error('Invalid session data directory')
  return canonical
}

export interface PreparedDeletion { token: string; path: string }

export interface SessionDeletionJournal {
  write(sessionId: string, prepared: PreparedDeletion): Promise<void>
  clear(sessionId: string): Promise<void>
}

/** Persist the Host lease before the OS moves a Session to trash. */
export function sessionDeletionJournal(directory: string): SessionDeletionJournal {
  return {
    async write(sessionId, prepared) {
      if (!validSessionId(sessionId) || !/^[0-9a-f-]{36}$/iu.test(prepared.token)) throw new Error('Invalid Session deletion journal')
      await mkdir(directory, { recursive: true })
      await writeFile(join(directory, `${sessionId}.json`), `${JSON.stringify({ sessionId, ...prepared })}\n`, { flag: 'wx' })
    },
    async clear(sessionId) {
      if (!validSessionId(sessionId)) throw new Error('Invalid session id')
      try { await unlink(join(directory, `${sessionId}.json`)) } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    },
  }
}

/** Finish a trash move interrupted by a desktop restart, or release a move never made. */
export async function recoverSessionDeletions(options: {
  directory: string; root: string;
  commit(sessionId: string, token: string): Promise<void>;
  abort(sessionId: string, token: string): Promise<void>;
}): Promise<void> {
  let entries: string[]
  try { entries = await readdir(options.directory) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  const journal = sessionDeletionJournal(options.directory)
  for (const entry of entries.filter(name => name.endsWith('.json'))) {
    const record = JSON.parse(await readFile(join(options.directory, entry), 'utf8')) as Partial<PreparedDeletion> & { sessionId?: unknown }
    if (!validSessionId(record.sessionId) || entry !== `${record.sessionId}.json`
      || typeof record.path !== 'string' || typeof record.token !== 'string'
      || !/^[0-9a-f-]{36}$/iu.test(record.token)) throw new Error('Invalid Session deletion journal')
    const root = await realpath(options.root)
    const path = resolve(record.path)
    const suffix = relative(root, path)
    if (!suffix || isAbsolute(suffix) || suffix.startsWith('..') || basename(path) !== record.sessionId) {
      throw new Error('Invalid Session deletion journal path')
    }
    let exists: boolean
    try { await lstat(path); exists = true } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      exists = false
    }
    if (exists) await options.abort(record.sessionId, record.token)
    else await options.commit(record.sessionId, record.token)
    await journal.clear(record.sessionId)
  }
}

export interface SessionDeleteRpcResponse {
  ok: boolean
  status: number
  text: string
}

interface SessionDeleteRpcEnvelope {
  result?: {
    ok?: unknown
    value?: unknown
    error?: { message?: unknown }
  }
  error?: { message?: unknown }
}

/** Parse the Host response outside the browser context so plain-text errors are diagnosable. */
export function parseSessionDeleteRpcResponse<T>(response: SessionDeleteRpcResponse, fallback: string): T {
  let parsed: SessionDeleteRpcEnvelope
  try {
    parsed = JSON.parse(response.text) as SessionDeleteRpcEnvelope
  } catch {
    const detail = response.text ? `HTTP ${response.status}: ${response.text}` : `HTTP ${response.status}`
    throw new Error(`${fallback} (${detail})`)
  }

  const remoteMessage = typeof parsed.result?.error?.message === 'string'
    ? parsed.result.error.message
    : typeof parsed.error?.message === 'string' ? parsed.error.message : undefined
  if (!response.ok || parsed.result?.ok !== true) {
    if (remoteMessage) throw new Error(response.ok ? remoteMessage : `${remoteMessage} (HTTP ${response.status})`)
    throw new Error(response.ok ? fallback : `${fallback} (HTTP ${response.status})`)
  }
  if (parsed.result.value === undefined) throw new Error(fallback)
  return parsed.result.value as T
}

/** Keep the Host alive and coordinate only the selected session's lifecycle. */
export async function deleteStoredSession(options: {
  root: string; sessionId: string; confirm(): Promise<boolean>;
  prepare(): Promise<PreparedDeletion>; commit(token: string): Promise<void>;
  abort(token: string): Promise<void>; trash(path: string): Promise<void>;
  journal?: SessionDeletionJournal;
}): Promise<boolean> {
  if (!validSessionId(options.sessionId)) throw new Error('Invalid session id')
  if (!await options.confirm()) return false
  const prepared = await options.prepare()
  let moved = false
  let journaled = false
  try {
    const path = await validateSessionDirectory(options.root, options.sessionId, prepared.path)
    await options.journal?.write(options.sessionId, prepared)
    journaled = true
    await options.trash(path)
    moved = true
    await options.commit(prepared.token)
  } catch (error) {
    if (!moved) {
      try { await options.abort(prepared.token) } catch { /* Preserve the original failure. */ }
      if (journaled) {
        try { await options.journal?.clear(options.sessionId) } catch { /* Recovery can retry the journal. */ }
      }
    }
    throw error
  }
  try { await options.journal?.clear(options.sessionId) } catch { /* Committed removal stays successful; startup can replay cleanup. */ }
  return true
}
