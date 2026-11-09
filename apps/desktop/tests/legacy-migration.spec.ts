/** Migration preserves released bytes, account choices, and recovery copies across interrupted starts. */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import { migrateLegacyData } from '../src/legacy-migration.ts'
import { DesktopSecretVault } from '../src/secret-vault.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-v9-migration-')); roots.push(root)
  const source = join(root, 'old'), target = join(root, 'new'), key = randomBytes(32)
  const encryption = {
    encrypt: (value: string) => {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
      return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()])
    },
    decrypt: (value: Buffer) => {
      const cipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); cipher.setAuthTag(value.subarray(-16))
      return Buffer.concat([cipher.update(value.subarray(12, -16)), cipher.final()]).toString('utf8')
    },
  }
  const vaultPath = join(root, 'vault.json'), vault = new DesktopSecretVault(vaultPath, encryption)
  await mkdir(source)
  const put = async (path: string, value: string, base = source) => {
    await mkdir(dirname(join(base, path)), { recursive: true }); await writeFile(join(base, path), value)
  }
  return { root, source, target, encryption, vaultPath, vault, put }
}

it('copies every released generation and attachment byte without changing the source, then stays idempotent', async () => {
  const f = await fixture()
  for (const version of [0, 3, 4]) await f.put(`sessions/s${version}/log.jsonl`, JSON.stringify({ version }) + '\noriginal log\n')
  await f.put('attachments/image.bin', 'binary fixture')
  const result = await migrateLegacyData(f.target, [{ home: f.source }], f.vault)
  expect(result.files).toBe(4)
  for (const version of [0, 3, 4]) expect(await readFile(join(f.target, `sessions/s${version}/log.jsonl`))).toEqual(await readFile(join(f.source, `sessions/s${version}/log.jsonl`)))
  expect(await migrateLegacyData(f.target, [{ home: f.source }], f.vault)).toEqual(result)
})

it('retains an entire same-id session separately even when changed files have the same size', async () => {
  const f = await fixture()
  await f.put('sessions/s/log.jsonl', 'old'); await f.put('sessions/s/log.jsonl', 'new', f.target)
  const result = await migrateLegacyData(f.target, [{ home: f.source }], f.vault)
  expect(result.conflicts).toBe(1)
  expect(await readFile(join(f.target, 'sessions/s/log.jsonl'), 'utf8')).toBe('new')
  const ids = await readdir(join(f.target, '.migration/zerowall-v9/conflicts'))
  expect(await readFile(join(f.target, '.migration/zerowall-v9/conflicts', ids[0]!, 'sessions/s/log.jsonl'), 'utf8')).toBe('old')
})

it('merges different sessions in the same workspace while archiving only the conflicting session', async () => {
  const f = await fixture()
  await f.put('sessions/workspace/old/session.v4.jsonl', 'old')
  await f.put('sessions/workspace/shared/session.v4.jsonl', 'previous')
  await f.put('sessions/workspace/new/session.v4.jsonl', 'new', f.target)
  await f.put('sessions/workspace/shared/session.v4.jsonl', 'current', f.target)
  const result = await migrateLegacyData(f.target, [{ home: f.source }], f.vault)
  expect(result.conflicts).toBe(1)
  expect(await readFile(join(f.target, 'sessions/workspace/old/session.v4.jsonl'), 'utf8')).toBe('old')
  expect(await readFile(join(f.target, 'sessions/workspace/new/session.v4.jsonl'), 'utf8')).toBe('new')
  expect(await readFile(join(f.target, 'sessions/workspace/shared/session.v4.jsonl'), 'utf8')).toBe('current')
})

it('keeps destination settings and account choice while encrypting imported legacy login', async () => {
  const f = await fixture()
  const legacy = { 'zerowall.ai-cloud.login': JSON.stringify({ email: 'fixture@example.invalid', password: 'never-plaintext' }), 'zerowall.ai-cloud.preferred-base': 'https://fixture.invalid' }
  const encrypted = Object.fromEntries(Object.entries(legacy).map(([id, value]) => [id, f.encryption.encrypt(value).toString('base64')]))
  const sourceVault = join(f.root, 'old-vault.json')
  await writeFile(sourceVault, JSON.stringify({ version: 1, entries: encrypted }))
  await f.put('settings.yaml.imported', 'theme: dark\ncustom: true\n')
  await f.put('settings.yaml', 'theme: light\n', f.target)
  const result = await migrateLegacyData(f.target, [{ home: f.source, vault: sourceVault, encryption: f.encryption }], f.vault)
  expect(result.credentials).toBe(2)
  expect(await f.vault.get('zerowall.ai-cloud.login')).toBe(legacy['zerowall.ai-cloud.login'])
  expect(await readFile(f.vaultPath, 'utf8')).not.toContain('never-plaintext')
  expect(await readFile(join(f.target, 'settings.yaml'), 'utf8')).toContain('theme: light')
  await expect(readFile(join(f.target, '.credentials.yaml'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('does not undo an explicit current sign-out and reports credentials that cannot decrypt', async () => {
  const f = await fixture()
  await f.vault.set('zerowall.ai-cloud.manual-signout', 'true')
  const sourceVault = join(f.root, 'old-vault.json')
  await writeFile(sourceVault, JSON.stringify({ version: 1, entries: { 'zerowall.ai-cloud.login': Buffer.from('unreadable').toString('base64') } }))
  const result = await migrateLegacyData(f.target, [{ home: f.source, vault: sourceVault, encryption: f.encryption }], f.vault)
  expect(result.credentialFailures).toBe(1)
  expect(await f.vault.get('zerowall.ai-cloud.manual-signout')).toBe('true')
  expect(await f.vault.get('zerowall.ai-cloud.login')).toBeUndefined()
})

it('resumes after a rejected settings import without marking a partial import complete', async () => {
  const f = await fixture()
  await f.put('sessions/s/log.jsonl', 'unchanged')
  await f.put('settings.yaml', 'broken: [')
  const partial = await migrateLegacyData(f.target, [{ home: f.source }], f.vault)
  expect(partial).toMatchObject({ state: 'partial', files: 1, failures: [{ operation: 'settings', code: 'invalid-data' }] })
  await expect(readFile(join(f.target, '.migration/zerowall-v9/completed.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  await f.put('sessions/s/log.jsonl', 'continued in 9.0', f.target)
  await f.put('settings.yaml', 'theme: dark\n')
  expect(await migrateLegacyData(f.target, [{ home: f.source }], f.vault)).toMatchObject({ state: 'completed', conflicts: 0, files: 0 })
  expect(await readFile(join(f.target, 'sessions/s/log.jsonl'), 'utf8')).toBe('continued in 9.0')
  await expect(readdir(join(f.target, '.migration/zerowall-v9/conflicts'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('merges directory aliases, retains session membership and repairs completed imports without reimporting', async () => {
  const f = await fixture(), directory = join(f.root, 'project')
  await mkdir(directory)
  const index = { unit: { name: 'workspace', version: 2 }, tables: { workspaces: {
    primary: { path: directory, title: 'Current title', sessionIds: ['s1'], createdAt: 1, updatedAt: 2 },
    alias: { path: directory, title: 'Legacy title', sessionIds: ['s2', 's1'], createdAt: 1, updatedAt: 2 },
  } }, global: { workspaceIds: ['primary', 'alias'], defaultWorkspaceId: 'alias', archivedSessionIds: ['s2'], pinnedSessionIds: ['s1', 's2'] } }
  const original = JSON.stringify(index)
  await f.put('storages/workspace.json', original, f.target)
  await f.put('.migration/zerowall-v9/completed.json', JSON.stringify({ schema: 1, state: 'completed', files: 2, bytes: 10, conflicts: 0, credentials: 0, credentialFailures: 0, failures: [], completedAt: new Date().toISOString() }), f.target)
  await f.put('sessions/should-not-import/log.jsonl', 'not imported')
  const result = await migrateLegacyData(f.target, [{ home: f.source }], f.vault)
  expect(result.state).toBe('completed')
  const repaired = await readFile(join(f.target, 'storages/workspace.json'), 'utf8')
  expect(JSON.parse(repaired)).toMatchObject({ tables: { workspaces: { primary: { title: 'Current title', sessionIds: ['s1', 's2'] } } }, global: { workspaceIds: ['primary'], defaultWorkspaceId: 'primary', archivedSessionIds: ['s2'], pinnedSessionIds: ['s1'] } })
  expect(Object.keys((JSON.parse(repaired) as typeof index).tables.workspaces)).toEqual(['primary'])
  expect(await readFile(join(f.target, '.migration/zerowall-v9/backup/workspace-before-dedup.json'), 'utf8')).toBe(original)
  await expect(readdir(join(f.target, 'sessions'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await migrateLegacyData(f.target, [{ home: f.source }], f.vault)).toEqual(result)
  expect(await readFile(join(f.target, 'storages/workspace.json'), 'utf8')).toBe(repaired)
})

it('deduplicates workspace paths while merging separate source and destination indexes', async () => {
  const f = await fixture(), directory = join(f.root, 'project')
  await mkdir(directory)
  const index = (id: string, session: string) => JSON.stringify({ unit: { name: 'workspace', version: 2 }, tables: { workspaces: { [id]: { path: directory, title: id, sessionIds: [session], createdAt: 1, updatedAt: 2 } } }, global: { workspaceIds: [id], archivedSessionIds: [], pinnedSessionIds: [] } })
  await f.put('storages/workspace.json', index('old', 'old-session'))
  await f.put('storages/workspace.json', index('current', 'new-session'), f.target)
  expect((await migrateLegacyData(f.target, [{ home: f.source }], f.vault)).state).toBe('completed')
  const merged = JSON.parse(await readFile(join(f.target, 'storages/workspace.json'), 'utf8')) as { global: { workspaceIds: string[] }; tables: { workspaces: Record<string, { sessionIds: string[] }> } }
  expect(merged.global.workspaceIds).toEqual(['current'])
  expect(merged.tables.workspaces.current?.sessionIds).toEqual(['new-session', 'old-session'])
})

it('continues with healthy sessions, attachments and credentials after independent migration failures', async () => {
  const f = await fixture(), second = join(f.root, 'second')
  await mkdir(second)
  await f.put('sessions/workspace/good/session.v4.jsonl', 'retained history')
  await symlink(second, join(f.source, 'sessions/workspace/linked'), process.platform === 'win32' ? 'junction' : 'dir')
  await f.put('attachments/image.bin', 'retained attachment')
  await f.put('settings.yaml', 'broken: [')
  await f.put('research.sqlite', 'invalid sqlite bytes')
  await f.put('zerowall-skills/state.json', 'invalid json')
  const sourceVault = join(f.root, 'old-vault.json')
  await writeFile(sourceVault, JSON.stringify({ version: 1, entries: {
    'zerowall.ai-cloud.login': f.encryption.encrypt('recoverable-login').toString('base64'),
    'zerowall.ai-cloud.token': Buffer.from('broken-ciphertext').toString('base64'),
  } }))
  await f.put('sessions/second/session.v4.jsonl', 'second source', second)
  const result = await migrateLegacyData(f.target, [
    { home: f.source, database: join(f.source, 'research.sqlite'), vault: sourceVault, encryption: f.encryption },
    { home: second },
  ], f.vault)
  expect(result).toMatchObject({ state: 'partial', credentials: 1, credentialFailures: 1 })
  expect(result.failures.map(entry => entry.operation)).toEqual(expect.arrayContaining(['session', 'settings', 'database', 'skills']))
  expect(await readFile(join(f.target, 'sessions/workspace/good/session.v4.jsonl'), 'utf8')).toBe('retained history')
  expect(await readFile(join(f.target, 'sessions/second/session.v4.jsonl'), 'utf8')).toBe('second source')
  expect(await readFile(join(f.target, 'attachments/image.bin'), 'utf8')).toBe('retained attachment')
  expect(await f.vault.get('zerowall.ai-cloud.login')).toBe('recoverable-login')
  const report = await readFile(join(f.target, '.migration/zerowall-v9/partial.json'), 'utf8')
  expect(report).not.toContain('recoverable-login')
  expect(report).not.toContain(f.source.replaceAll('\\', '\\\\'))
  expect(await readFile(join(f.source, 'settings.yaml'), 'utf8')).toBe('broken: [')
  await expect(readFile(join(f.target, '.migration/zerowall-v9/completed.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('returns a partial result when the migration destination is unavailable so startup can continue', async () => {
  const f = await fixture()
  await writeFile(f.target, 'not a directory')
  await expect(migrateLegacyData(f.target, [{ home: f.source }], f.vault)).resolves.toMatchObject({
    state: 'partial', failures: [{ operation: 'preparation' }],
  })
  expect(await readFile(f.target, 'utf8')).toBe('not a directory')
})

it('imports committed WAL data through a consistent SQLite backup and retains the source database', async () => {
  const f = await fixture(), path = join(f.source, 'research.sqlite')
  const database = new DatabaseSync(path)
  try {
    database.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE research (id INTEGER PRIMARY KEY, title TEXT); PRAGMA user_version=19')
    database.prepare('INSERT INTO research (title) VALUES (?)').run('retained WAL row')
    await migrateLegacyData(f.target, [{ home: f.source, database: path }], f.vault)
    const copied = new DatabaseSync(join(f.target, 'zerowall/research.sqlite'), { readOnly: true })
    try {
      expect(copied.prepare('SELECT title FROM research').get()?.title).toBe('retained WAL row')
      expect(copied.prepare('PRAGMA user_version').get()?.user_version).toBe(19)
    } finally { copied.close() }
    expect(database.prepare('SELECT count(*) AS count FROM research').get()?.count).toBe(1)
  } finally { database.close() }
})

it('retains a conflicting research database as a verified snapshot without replacing the active database', async () => {
  const f = await fixture(), second = join(f.root, 'second')
  await mkdir(second)
  for (const [home, value] of [[f.source, 'first'], [second, 'second']] as const) {
    const database = new DatabaseSync(join(home, 'research.sqlite'))
    try {
      database.exec('CREATE TABLE research (title TEXT)')
      database.prepare('INSERT INTO research VALUES (?)').run(value)
    } finally { database.close() }
  }
  const result = await migrateLegacyData(f.target, [f.source, second].map(home => ({ home, database: join(home, 'research.sqlite') })), f.vault)
  expect(result.conflicts).toBe(1)
  const archives = join(f.target, '.migration/zerowall-v9/conflicts')
  const [id] = await readdir(archives)
  const [file] = await readdir(join(archives, id!))
  for (const [path, value] of [[join(f.target, 'zerowall/research.sqlite'), 'first'], [join(archives, id!, file!), 'second']] as const) {
    const database = new DatabaseSync(path, { readOnly: true })
    try { expect(database.prepare('SELECT title FROM research').get()?.title).toBe(value) }
    finally { database.close() }
  }
})

it('maps enabled and disabled legacy skills while retaining current skill selections', async () => {
  const f = await fixture()
  await f.put('zerowall-skills/enabled/a/SKILL.md', '---\nname: analysis\ndescription: Data analysis\n---\nRun analysis.\n')
  await f.put('zerowall-skills/disabled/b/SKILL.md', '---\nname: archived\n---\nArchived skill.\n')
  await f.put('zerowall-skills/state.json', JSON.stringify({ version: 1, imports: [], overrides: { analysis: false }, workspaceOverrides: {}, topics: [] }), f.target)
  await migrateLegacyData(f.target, [{ home: f.source }], f.vault)
  const state = JSON.parse(await readFile(join(f.target, 'zerowall-skills/state.json'), 'utf8')) as { overrides: Record<string, boolean>; imports: { name: string; path: string }[] }
  expect(state.overrides).toEqual({ analysis: false, archived: false })
  expect(state.imports.map((entry: { name: string }) => entry.name)).toEqual(['analysis', 'archived'])
  expect(state.imports[0]?.path).toBe(join(f.target, 'zerowall-skills/enabled/a/SKILL.md'))
})

it('keeps the complete credential batch unchanged when encryption fails, then permits a retry', async () => {
  const f = await fixture()
  await f.vault.set('zerowall.environment.token', 'existing')
  const before = await readFile(f.vaultPath)
  let calls = 0
  const failing = new DesktopSecretVault(f.vaultPath, { ...f.encryption, encrypt(value: string) {
    if (++calls === 2) throw new Error('OS encryption unavailable')
    return f.encryption.encrypt(value)
  } })
  await expect(failing.setMany({ 'zerowall.ai-cloud.login': 'fixture-login', 'zerowall.ai-cloud.token': 'fixture-token' })).rejects.toThrow('OS encryption unavailable')
  expect(await readFile(f.vaultPath)).toEqual(before)
  await f.vault.setMany({ 'zerowall.ai-cloud.login': 'fixture-login', 'zerowall.ai-cloud.token': 'fixture-token' })
  expect(await f.vault.get('zerowall.ai-cloud.login')).toBe('fixture-login')
  expect(await f.vault.get('zerowall.ai-cloud.token')).toBe('fixture-token')
})
