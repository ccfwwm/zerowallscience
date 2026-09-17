import { lstat, realpath } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve } from 'node:path'

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

/** Keep the Host alive and coordinate only the selected session's lifecycle. */
export async function deleteStoredSession(options: {
  root: string; sessionId: string; confirm(): Promise<boolean>;
  prepare(): Promise<PreparedDeletion>; commit(token: string): Promise<void>;
  abort(token: string): Promise<void>; trash(path: string): Promise<void>;
}): Promise<boolean> {
  if (!validSessionId(options.sessionId)) throw new Error('Invalid session id')
  if (!await options.confirm()) return false
  const prepared = await options.prepare()
  try {
    const path = await validateSessionDirectory(options.root, options.sessionId, prepared.path)
    await options.trash(path)
    await options.commit(prepared.token)
  } catch (error) {
    try { await options.abort(prepared.token) } catch { /* Preserve the original failure. */ }
    throw error
  }
  return true
}
