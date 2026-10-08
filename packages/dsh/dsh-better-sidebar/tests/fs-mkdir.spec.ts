/**
 * The host's "new folder" mutation (`fs.mkdir` route → mkdirWorkspaceEntry):
 * shape rules, existence refusal, the root row as a legal PARENT, and the
 * happy path against a real temporary filesystem.
 *
 * The ZeroWall workspace fence remains on by default, including for mkdir.
 */
import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirWorkspaceEntry } from '../src/fs-operations.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-mkdir-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** The wire code of a rejected call (the route maps it to an HTTP status). */
async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (error) {
    return (error as { code?: string }).code ?? 'no-code'
  }
  return 'resolved'
}

describe('mkdirWorkspaceEntry', () => {
  it('creates one directory inside the named row and returns its absolute path', async () => {
    await mkdir(join(root, 'sub'))
    const result = await mkdirWorkspaceEntry({ cwd: root, path: join(root, 'sub'), name: 'fresh' })
    expect(result.path.endsWith(join('sub', 'fresh'))).toBe(true)
    expect(await readdir(join(root, 'sub'))).toEqual(['fresh'])
  })

  it('accepts the workspace root itself as the parent', async () => {
    const result = await mkdirWorkspaceEntry({ cwd: root, path: root, name: 'top' })
    expect(result.path.endsWith('top')).toBe(true)
    expect(await readdir(root)).toEqual(['top'])
  })

  it('refuses a name that is not a single path segment', async () => {
    expect(await codeOf(() => mkdirWorkspaceEntry({ cwd: root, path: root, name: 'a/b' }))).toBe('bad-request')
    expect(await codeOf(() => mkdirWorkspaceEntry({ cwd: root, path: root, name: '..' }))).toBe('bad-request')
    expect(await codeOf(() => mkdirWorkspaceEntry({ cwd: root, path: root, name: '' }))).toBe('bad-request')
  })

  it('refuses an existing destination with the same conflict code as rename', async () => {
    await mkdir(join(root, 'taken'))
    expect(await codeOf(() => mkdirWorkspaceEntry({ cwd: root, path: root, name: 'taken' }))).toBe('fs-error')
  })

  it('rejects an outside parent by default, but permits it when the fence is disabled', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'dsh-outside-'))
    try {
      await writeFile(join(outside, 'marker.txt'), 'x')
      expect(await codeOf(() => mkdirWorkspaceEntry({ cwd: root, path: outside, name: 'blocked' }))).toBe('forbidden')
      const result = await mkdirWorkspaceEntry({ cwd: root, path: outside, name: 'allowed', fence: false })
      expect(result.path.endsWith('allowed')).toBe(true)
      expect(await readdir(outside)).toEqual(['allowed', 'marker.txt'])
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('rejects an outside symlink by default, but permits it when the fence is disabled', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'dsh-link-'))
    try {
      await symlink(outside, join(root, 'escape'))
      expect(await codeOf(() => mkdirWorkspaceEntry({ cwd: root, path: join(root, 'escape'), name: 'blocked' }))).toBe('forbidden')
      const result = await mkdirWorkspaceEntry({ cwd: root, path: join(root, 'escape'), name: 'inside-link', fence: false })
      expect(result.path.endsWith('inside-link')).toBe(true)
      expect(await readdir(outside)).toEqual(['inside-link'])
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
})
