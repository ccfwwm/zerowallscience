import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { cleanupLegacyRuntimeData } from '../src/main/legacy-runtime-cleanup.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 2 }))) })

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-legacy-cleanup-')); roots.push(root)
  const legacy = join(root, 'Roaming/zerowall-science')
  const current = join(root, 'Local/zerowall-science')
  await mkdir(legacy, { recursive: true }); await mkdir(current, { recursive: true })
  const put = async (path: string, body = 'fixture') => { await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, body) }
  const options = { ready: true, explicitUserData: false, appDataPath: join(root, 'Roaming'), userDataPath: current, protectedRoots: [] as string[], channel: 'stable' as const }
  return { root, legacy, current, put, options }
}

it('deletes only obsolete runtime/cache trees, preserves user data, and never copies into the active profile', async () => {
  const f = await fixture()
  const data = ['credentials/vault.json', 'harness/.credentials.yaml', 'harness/sessions/chat.jsonl', 'harness/attachments/photo.png',
    'harness/storages/workspace.json', 'harness/profiles/web/cordis.patch.yml', 'harness/resources/plugins/selection.json', 'harness/zerowall-skills/enabled/custom/SKILL.md']
  for (const path of data) await f.put(join(f.legacy, path), `keep:${path}`)
  const disposable = ['Cache/entry', 'Code Cache/entry', 'python/runtime', 'harness/profiles/web/node_modules/plugin/entry',
    'harness/profiles/zerowall-pnpm-8b48f512-b82b-4cc7-940b-31015825c777/node_modules/entry', 'harness/resources/downloads/archive']
  for (const path of disposable) await f.put(join(f.legacy, path))
  await f.put(join(f.legacy, 'harness/profiles/zerowall-pnpm-custom/user-file'), 'unknown profile')
  await f.put(join(f.current, 'harness/profiles/web/node_modules/plugin/entry'), 'active plugin')
  const result = await cleanupLegacyRuntimeData(f.options)
  expect(result.state).toBe('completed')
  expect(result.removed).toHaveLength(disposable.length)
  for (const path of disposable) await expect(readFile(join(f.legacy, path))).rejects.toThrow()
  for (const path of data) {
    expect(await readFile(join(f.legacy, path), 'utf8')).toBe(`keep:${path}`)
    await expect(readFile(join(f.current, path))).rejects.toThrow()
  }
  expect(await readFile(join(f.current, 'harness/profiles/web/node_modules/plugin/entry'), 'utf8')).toBe('active plugin')
  expect(await readFile(join(f.legacy, 'harness/profiles/zerowall-pnpm-custom/user-file'), 'utf8')).toBe('unknown profile')
  expect((await cleanupLegacyRuntimeData(f.options)).removed).toEqual([])
})

it('does nothing before readiness or for an explicitly isolated user-data root', async () => {
  const f = await fixture()
  await f.put(join(f.legacy, 'Cache/entry'))
  expect((await cleanupLegacyRuntimeData({ ...f.options, ready: false })).state).toBe('skipped')
  expect((await cleanupLegacyRuntimeData({ ...f.options, explicitUserData: true })).state).toBe('skipped')
  expect(await readFile(join(f.legacy, 'Cache/entry'), 'utf8')).toBe('fixture')
})

it('leaves failed deletions in place and continues with other disposable paths', async () => {
  const f = await fixture()
  await f.put(join(f.legacy, 'Cache/entry')); await f.put(join(f.legacy, 'Code Cache/entry'))
  const result = await cleanupLegacyRuntimeData(f.options, async path => {
    if (path === join(f.legacy, 'Cache')) throw Object.assign(new Error('locked'), { code: 'EBUSY' })
    await rm(path, { recursive: true, force: true })
  })
  expect(result.state).toBe('partial')
  expect(result.failed).toEqual([{ path: 'zerowall-science/Cache', code: 'EBUSY' }])
  expect(await readFile(join(f.legacy, 'Cache/entry'), 'utf8')).toBe('fixture')
  await expect(readFile(join(f.legacy, 'Code Cache/entry'))).rejects.toThrow()
  expect((await cleanupLegacyRuntimeData(f.options)).failed).toEqual([])
})

it('protects the active user-data root and a fixed Python installation inside a legacy tree', async () => {
  const f = await fixture()
  await f.put(join(f.legacy, 'Cache/entry')); await f.put(join(f.legacy, 'python/runtime'))
  await cleanupLegacyRuntimeData({ ...f.options, userDataPath: f.legacy })
  await cleanupLegacyRuntimeData({ ...f.options, protectedRoots: [join(f.legacy, 'python')] })
  expect(await readFile(join(f.legacy, 'Cache/entry'), 'utf8')).toBe('fixture')
  expect(await readFile(join(f.legacy, 'python/runtime'), 'utf8')).toBe('fixture')
})

it('rejects junction roots and parents and does not follow nested junctions during removal', async () => {
  const f = await fixture()
  const outside = join(f.root, 'outside')
  await f.put(join(outside, 'important'), 'preserve')
  await symlink(outside, join(f.legacy, 'Cache'), 'junction')
  await symlink(outside, join(f.legacy, 'harness'), 'junction')
  await symlink(outside, join(f.root, 'Roaming/zerowall-science-3'), 'junction')
  await f.put(join(f.legacy, 'Code Cache/entry'))
  await symlink(outside, join(f.legacy, 'Code Cache/link'), 'junction')
  const result = await cleanupLegacyRuntimeData(f.options)
  expect(result.removed).toEqual(['zerowall-science/Code Cache'])
  expect(await readFile(join(outside, 'important'), 'utf8')).toBe('preserve')
})

it('keeps preview and stable namespaces separate', async () => {
  const f = await fixture()
  await f.put(join(f.legacy, 'Cache/entry'))
  const preview = join(f.root, 'Roaming/zerowall-science-preview/Cache/entry')
  await f.put(preview)
  await cleanupLegacyRuntimeData({ ...f.options, channel: 'preview' })
  await expect(readFile(preview)).rejects.toThrow()
  expect(await readFile(join(f.legacy, 'Cache/entry'), 'utf8')).toBe('fixture')
})
