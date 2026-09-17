import { open, readdir, realpath } from 'node:fs/promises'
import { join, relative, resolve, isAbsolute } from 'node:path'

export function validSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)
}

/** Resolve one persisted session, never a workspace directory or a supplied path. */
export async function findSessionDirectory(root: string, sessionId: string): Promise<string> {
  if (!validSessionId(sessionId)) throw new Error('Invalid session id')
  const canonicalRoot = await realpath(root)
  const matches: string[] = []
  for (const group of await readdir(canonicalRoot, { withFileTypes: true })) {
    if (!group.isDirectory() || group.isSymbolicLink()) continue
    const candidate = join(canonicalRoot, group.name, sessionId)
    let canonical: string
    try { canonical = await realpath(candidate) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    const suffix = relative(canonicalRoot, canonical)
    if (isAbsolute(suffix) || suffix.startsWith('..') || canonical.toLowerCase() !== resolve(candidate).toLowerCase()) throw new Error('Session path is outside its data directory')
    const handle = await open(join(canonical, 'session.v3.jsonl'), 'r')
    try {
      const buffer = Buffer.alloc(64 * 1024)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      const end = buffer.subarray(0, bytesRead).indexOf(10)
      if (end < 0) throw new Error('Unsupported session header')
      const header = JSON.parse(buffer.subarray(0, end).toString('utf8'))
      if (header.id !== sessionId) throw new Error('Session header does not match the requested id')
    } finally { await handle.close() }
    matches.push(canonical)
  }
  if (matches.length !== 1) throw new Error(matches.length ? 'Ambiguous session data directory' : 'Session data not found')
  return matches[0]!
}

export async function deleteStoredSession(options: {
  root: string; sessionId: string; confirm(): Promise<boolean>; assertIdle(): Promise<void>;
  stop(): Promise<void>; trash(path: string): Promise<void>; start(): Promise<void>;
}): Promise<boolean> {
  await options.assertIdle()
  await findSessionDirectory(options.root, options.sessionId)
  if (!await options.confirm()) return false
  // Recheck after the user has spent arbitrary time in the confirmation dialog.
  await options.assertIdle()
  await options.stop()
  try {
    const path = await findSessionDirectory(options.root, options.sessionId)
    await options.trash(path)
  } finally { await options.start() }
  return true
}
