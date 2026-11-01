import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { parse } from 'yaml'
import { recoverEssentialUserData } from '../src/main/essential-user-data.js'
import { chromiumProfileEncryption } from '../src/main/credentials/windows-profile.js'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 3 }) })
const put = async (root: string, path: string, value: string | object) => {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), typeof value === 'string' ? value : JSON.stringify(value))
}
const workspace = (id: string, sessions: string[]) => ({ unit: { name: 'workspace', version: 2 },
  global: { initialized: true, workspaceIds: [id], archivedSessionIds: [], pinnedSessionIds: [sessions[0]] },
  tables: { workspaces: { [id]: { path: 'C:/projects/original', title: id, sessionIds: sessions, createdAt: '2026-01-01', updatedAt: '2026-11-01' } } } })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'zws-essential-')); roots.push(root)
  const legacy = join(root, 'Roaming/zerowall-science'), secondary = join(root, 'Roaming/zerowall-science-3'), target = join(root, 'Local/zerowall-science')
  await Promise.all([legacy, secondary, target].map(path => mkdir(path, { recursive: true })))
  const old = chromiumProfileEncryption(randomBytes(32)), current = chromiumProfileEncryption(randomBytes(32))
  const encode = (values: Record<string, string>, provider = old) => ({ version: 1, entries: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, provider.encrypt(value).toString('base64')])) })
  const options = { enabled: true, userDataPath: target, legacyRoots: [legacy, secondary], encryption: current, openLegacyEncryption: async () => old }
  return { root, legacy, secondary, target, old, current, encode, options }
}

it('recovers history, workspace/model settings and the complete account across differing keys without copying runtime', async () => {
  const f = await fixture()
  const history = 'original conversation event bytes\n'
  await put(f.legacy, 'harness/sessions/old.jsonl', history)
  await put(f.legacy, 'harness/attachments/image.png', 'image bytes')
  await put(f.legacy, 'harness/profiles/web/node_modules/never-copy/index.js', 'runtime')
  await put(f.legacy, 'python/Lib/site-packages/never-copy.py', 'runtime')
  await put(f.legacy, 'harness/storages/workspace.json', workspace('old', ['old-session']))
  await put(f.target, 'harness/storages/workspace.json', workspace('new', ['new-session']))
  await put(f.target, 'harness/sessions/new.jsonl', 'new conversation')
  await put(f.legacy, 'credentials/vault.json', f.encode({ 'zerowall.ai-cloud.login': 'old-login', 'zerowall.ai-cloud.session': 'old-session', 'zerowall.ai-cloud.group.1': 'old-group', 'zerowall.environment.var.custom': 'custom-value' }))
  // Reproduce 8.4.21: old ciphertext had been copied into a new encryption root.
  await put(f.target, 'credentials/vault.json', f.encode({ 'zerowall.ai-cloud.group.1': 'old-group', 'zerowall.environment.var.custom': 'custom-value' }))
  const oldVault = await readFile(join(f.target, 'credentials/vault.json'), 'utf8')
  await put(f.legacy, 'harness/profiles/web/cordis.patch.yml', '- id: model\n  name: default-model\n  config:\n    model: selected-original\n    reasoningEffort: xhigh\n- id: environment\n  name: environment\n  config:\n    imageQuality: max\n    variables:\n      - name: CUSTOM\n')
  await put(f.target, 'harness/profiles/web/cordis.patch.yml', '- id: environment\n  name: environment\n  config:\n    imageQuality: high\n    variables:\n      - name: NEW\n')
  const result = await recoverEssentialUserData(f.options)
  expect(result.state).toBe('completed')
  expect(await readFile(join(f.target, 'harness/sessions/old.jsonl'), 'utf8')).toBe(history)
  expect(await readFile(join(f.target, 'harness/sessions/new.jsonl'), 'utf8')).toBe('new conversation')
  const index = JSON.parse(await readFile(join(f.target, 'harness/storages/workspace.json'), 'utf8'))
  expect(index.global.workspaceIds).toEqual(['new', 'old'])
  expect(index.tables.workspaces.old.path).toBe('C:/projects/original')
  const vault = JSON.parse(await readFile(join(f.target, 'credentials/vault.json'), 'utf8'))
  for (const [key, value] of Object.entries(vault.entries) as Array<[string, string]>) expect(f.current.decrypt(Buffer.from(value, 'base64'))).toBe(key.endsWith('login') ? 'old-login' : key.endsWith('session') ? 'old-session' : key.includes('group') ? 'old-group' : 'custom-value')
  expect(await readFile(join(f.target, '.migration/essential-user-data-v1/backup/credentials/vault.json'), 'utf8')).toBe(oldVault)
  const patch = parse(await readFile(join(f.target, 'harness/profiles/web/cordis.patch.yml'), 'utf8'))
  expect(patch.find((row: any) => row.id === 'model').config).toEqual({ model: 'selected-original', reasoningEffort: 'xhigh' })
  expect(patch.find((row: any) => row.id === 'environment').config).toEqual({ imageQuality: 'high', variables: [{ name: 'CUSTOM' }, { name: 'NEW' }] })
  await expect(access(join(f.target, 'python'))).rejects.toThrow()
  await expect(access(join(f.target, 'harness/profiles/web/node_modules'))).rejects.toThrow()
  expect(await readFile(join(f.legacy, 'harness/sessions/old.jsonl'), 'utf8')).toBe(history)
  // A later launch does not inspect even an unreadable or invalid old profile.
  await put(f.legacy, 'credentials/vault.json', 'invalid')
  expect((await recoverEssentialUserData(f.options)).state).toBe('already-completed')
})

it('keeps a current account and explicit sign-out intact instead of mixing legacy group tokens', async () => {
  for (const signedOut of [false, true]) {
    const f = await fixture()
    await put(f.legacy, 'credentials/vault.json', f.encode({ 'zerowall.ai-cloud.login': 'old', 'zerowall.ai-cloud.group.1': 'old-group' }))
    const values: Record<string, string> = signedOut ? { 'zerowall.ai-cloud.manual-signout': 'true' } : { 'zerowall.ai-cloud.session': 'new', 'zerowall.ai-cloud.group.2': 'new-group' }
    await put(f.target, 'credentials/vault.json', f.encode(values, f.current))
    await put(f.legacy, 'harness/profiles/web/cordis.patch.yml', '- id: environment\n  name: environment\n  config:\n    imageQuality: max\n')
    await put(f.target, 'harness/profiles/web/cordis.patch.yml', '- id: environment\n  name: environment\n  config:\n    imageQuality: high\n')
    await recoverEssentialUserData(f.options)
    const vault = JSON.parse(await readFile(join(f.target, 'credentials/vault.json'), 'utf8'))
    expect(Object.keys(vault.entries).sort()).toEqual(Object.keys(values).sort())
    expect(parse(await readFile(join(f.target, 'harness/profiles/web/cordis.patch.yml'), 'utf8'))[0].config.imageQuality).toBe('high')
  }
})

it('preserves encrypted data and retries after a temporary DPAPI failure without writing a completion receipt', async () => {
  const f = await fixture()
  await put(f.legacy, 'credentials/vault.json', f.encode({ 'zerowall.ai-cloud.login': 'recoverable' }))
  const original = await readFile(join(f.legacy, 'credentials/vault.json'), 'utf8')
  await expect(recoverEssentialUserData({ ...f.options, openLegacyEncryption: async () => { throw new Error('temporarily locked') } })).rejects.toThrow()
  expect(await readFile(join(f.legacy, 'credentials/vault.json'), 'utf8')).toBe(original)
  await expect(access(join(f.target, '.migration/essential-user-data-v1/completed.json'))).rejects.toThrow()
  expect((await recoverEssentialUserData(f.options)).state).toBe('completed')
})

it('rejects junctions into other directories and preserves conflicting session files', async () => {
  const f = await fixture()
  await put(f.legacy, 'harness/sessions/conflict.jsonl', 'old history is longer')
  await put(f.target, 'harness/sessions/conflict.jsonl', 'new history')
  expect((await recoverEssentialUserData(f.options)).conflicts).toBe(1)
  expect(await readFile(join(f.target, 'harness/sessions/conflict.jsonl'), 'utf8')).toBe('new history')
  expect(await readFile(join(f.target, '.migration/essential-user-data-v1/conflicts/0/harness/sessions/conflict.jsonl'), 'utf8')).toBe('old history is longer')
  const linked = await fixture()
  await put(linked.root, 'outside/private.jsonl', 'outside')
  await mkdir(join(linked.legacy, 'harness'), { recursive: true })
  await symlink(join(linked.root, 'outside'), join(linked.legacy, 'harness/sessions'), process.platform === 'win32' ? 'junction' : 'dir')
  await expect(recoverEssentialUserData(linked.options)).rejects.toThrow(/redirect/u)
})
