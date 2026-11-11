/** Compare an extracted Host tree with the exact files in its authenticated archive. */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { t as listTar } from 'tar'

/**
 * Verify extracted file bytes and membership without following filesystem links.
 * @param directory - Extracted runtime directory with its retained authenticated archive.
 * @param archive - Archive whose size, digest and signed manifest were already checked.
 * @returns Resolves after every comparison reader closes; any mismatch rejects startup.
 */
export async function verifyHostRuntimeFiles(directory: string, archive: string): Promise<void> {
  const expected = new Map<string, { path: string; bytes: number; sha256: string }>()
  let archiveRoot: string | undefined
  let invalid: Error | undefined
  await listTar({ file: archive, strict: true, onReadEntry: (entry) => {
    const parts = entry.path.replace(/\/+$/u, '').split('/')
    const root = parts.shift()
    const path = parts.join('/')
    if (root === undefined || root === '' || root === '.' || root === '..'
      || parts.some(part => part === '' || part === '.' || part === '..')
      || entry.path.includes('\\') || entry.path.includes(':')
      || (archiveRoot !== undefined && root !== archiveRoot)
      || !['Directory', 'File', 'OldFile'].includes(entry.type)
      || path === 'host-runtime.json' || parts[0] === '.update') {
      invalid ??= new Error('host runtime: unsupported archive path or entry')
      return
    }
    archiveRoot = root
    if (entry.type === 'Directory') return
    const identity = path.toLowerCase()
    if (path === '' || expected.has(identity)) {
      invalid ??= new Error('host runtime: duplicate archive file')
      return
    }
    const item = { path, bytes: entry.size, sha256: '' }
    expected.set(identity, item)
    const hash = createHash('sha256')
    entry.on('data', (chunk: Buffer) => { hash.update(chunk) })
    entry.on('end', () => { item.sha256 = hash.digest('hex') })
  } })
  if (invalid !== undefined) throw invalid
  if (expected.size === 0) throw new Error('host runtime: empty runtime archive')
  if (!(await lstat(directory)).isDirectory()) throw new Error('host runtime: linked runtime directory')
  const actual = new Map<string, string>()
  const visit = async (parent: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) await visit(join(parent, entry.name), path)
      else if (!entry.isFile()) throw new Error('host runtime: linked or unsupported runtime file')
      else if (path !== 'host-runtime.json' && path !== '.update/host-runtime.tgz') actual.set(path.toLowerCase(), path)
    }
  }
  await visit(directory, '')
  if (actual.size !== expected.size) throw new Error('host runtime: extracted file membership mismatch')
  const remaining = expected.values()
  let failure: Error | undefined
  const workers = Array.from({ length: Math.min(8, expected.size) }, async () => {
    while (failure === undefined) {
      const next = remaining.next()
      if (next.done) return
      const item = next.value
      try {
        if (actual.get(item.path.toLowerCase()) !== item.path) throw new Error('host runtime: extracted file path mismatch')
        const hash = createHash('sha256')
        let bytes = 0
        for await (const chunk of createReadStream(join(directory, ...item.path.split('/')))) {
          const buffer = chunk as Buffer
          bytes += buffer.length
          hash.update(buffer)
        }
        if (bytes !== item.bytes || hash.digest('hex') !== item.sha256) throw new Error('host runtime: extracted file digest mismatch')
      } catch (error) { failure = error instanceof Error ? error : new Error(String(error)) }
    }
  })
  await Promise.all(workers)
  if (failure !== undefined) throw failure
}
