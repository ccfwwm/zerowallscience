/** First-launch import of user-owned data; source roots and released log generations remain immutable. */
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename as renameFile, rm, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { load, dump } from 'js-yaml'
import { backup, DatabaseSync } from 'node:sqlite'
import { DesktopSecretVault, parseSecretVault, SECRET_ID, type SecretEncryption } from './secret-vault.ts'

/** One explicit user-data source, never an installation or dependency directory. */
export interface LegacySource {
  readonly home: string
  readonly vault?: string
  readonly encryption?: SecretEncryption
  readonly desktopProfile?: boolean
  readonly database?: string
}
/** Safe migration facts, without account names, credentials, or conversation text. */
export interface MigrationResult {
  readonly schema: 1
  readonly state: 'completed' | 'partial'
  readonly files: number
  readonly bytes: number
  readonly conflicts: number
  readonly credentials: number
  readonly credentialFailures: number
  readonly failures: readonly MigrationFailure[]
  readonly completedAt: string
}

/** Recovery diagnostics exclude source paths, account names, and file contents. */
export interface MigrationFailure {
  readonly sourceId: string
  readonly operation: 'preparation' | 'source' | 'session' | 'file' | 'database' | 'skills' | 'settings' | 'credentials' | 'receipt'
  readonly code: 'permission-denied' | 'unavailable' | 'invalid-data'
}

function failure(sourceId: string, operation: MigrationFailure['operation'], error: unknown): MigrationFailure {
  const code = record(error) && typeof error.code === 'string' ? error.code : undefined
  return { sourceId, operation, code: ['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '') ? 'permission-denied'
    : ['ENOENT', 'ENOTDIR', 'ENOSPC', 'EIO'].includes(code ?? '') ? 'unavailable' : 'invalid-data' }
}

const trees = ['attachments', '.agent-presets', 'zerowall-skills/enabled', 'zerowall-skills/disabled', 'zerowall-skills/imports']
const documents = ['wsl-workspaces.json', 'dream-skin.json', 'zerowall-mcp-defaults-v1.json', 'storages/ssh_ops_known_hosts.json',
  'storages/ssh_ops_profiles.json', 'storages/ssh_ops_settings.json', 'storages/message_feedback.json']
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const absent = (error: unknown): boolean => ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')

function json(text: string): unknown {
  try { return JSON.parse(text) }
  catch (_error) { throw new Error('Unreadable migration document; source data was retained') }
}

async function optional(path: string): Promise<string | undefined> {
  try { return await readFile(path, 'utf8') } catch (error) { if (absent(error)) return undefined; throw error }
}

async function checkpointExists(path: string): Promise<boolean> {
  const text = await optional(path)
  if (text === undefined) return false
  const value = json(text)
  if (!record(value) || value.schema !== 1) throw new Error('Invalid migration checkpoint; retained data requires repair')
  return true
}

async function safe(root: string, file: string): Promise<boolean> {
  const rel = relative(root, file)
  if (rel === '..' || rel.startsWith('..' + sep) || resolve(root, rel) !== resolve(file)) throw new Error('Unsafe migration path')
  let current = resolve(root)
  for (const segment of ['', ...rel.split(sep).filter(Boolean)]) {
    current = join(current, segment)
    try {
      const stat = await lstat(current)
      if (stat.isSymbolicLink() || resolve(await realpath(current)).toLowerCase() !== resolve(current).toLowerCase()) throw new Error('Linked migration paths require manual recovery')
    } catch (error) { if (absent(error)) return false; throw error }
  }
  return true
}

async function digest(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

async function files(root: string, path: string, failed?: (error: unknown) => void): Promise<string[]> {
  if (!await safe(root, join(root, path))) return []
  const output: string[] = []
  for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
    const child = join(path, entry.name)
    try {
      if (entry.isSymbolicLink()) throw new Error('Linked user data requires manual recovery')
      if (entry.isDirectory()) output.push(...await files(root, child, failed))
      else if (entry.isFile()) output.push(child)
      else throw new Error('Unsupported migration entry')
    } catch (error) { if (failed === undefined) throw error; failed(error) }
  }
  return output
}

async function rename(from: string, to: string): Promise<void> {
  for (let attempt = 0;; attempt++) {
    try { await renameFile(from, to); return }
    catch (error) {
      if (process.platform !== 'win32' || attempt >= 7
        || !['EACCES', 'EBUSY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
    }
    await delay(Math.min(20 * 2 ** attempt, 200))
  }
}

/** Session files live below workspace directories; activation and conflicts belong to each session. */
async function sessionDirectories(root: string, path: string, failed: (error: unknown) => void): Promise<string[]> {
  if (!await safe(root, join(root, path))) return []
  const entries = await readdir(join(root, path), { withFileTypes: true })
  if (entries.some(entry => entry.isFile()) || entries.length === 0) return [path]
  const output: string[] = []
  for (const entry of entries) {
    try {
      if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error('Unsupported legacy session entry')
      output.push(...await sessionDirectories(root, join(path, entry.name), failed))
    } catch (error) { failed(error) }
  }
  return output
}

/** Merge missing settings and ids; destination values and explicit false/deletion markers win. */
export function mergeMigratedSettings(previous: unknown, current: unknown): unknown {
  if (current === undefined) return previous
  if (record(previous) && record(current)) {
    const result = Object.create(null) as Record<string, unknown>
    for (const key of new Set([...Object.keys(previous), ...Object.keys(current)])) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) continue
      result[key] = mergeMigratedSettings(previous[key], current[key])
    }
    return result
  }
  if (Array.isArray(previous) && Array.isArray(current)) {
    const old: readonly unknown[] = previous, present: readonly unknown[] = current
    if ([...old, ...present].every(value => typeof value === 'string')) return [...new Set([...present, ...old])]
  }
  return current
}

async function workspace(previous: unknown, current: unknown): Promise<unknown> {
  for (const value of [previous, current]) {
    if (value === undefined) continue
    if (!record(value) || !record(value.unit) || value.unit.name !== 'workspace' || value.unit.version !== 2
      || !record(value.tables) || !record(value.tables.workspaces) || !record(value.global)) throw new Error('Unsupported workspace index; source data was retained')
  }
  const merged = mergeMigratedSettings(previous, current)
  if (!record(merged) || !record(merged.tables) || !record(merged.tables.workspaces) || !record(merged.global)) throw new Error('Invalid workspace index')
  const ids = merged.global.workspaceIds
  if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string')) throw new Error('Invalid workspace ids')
  const rows = merged.tables.workspaces
  const byPath = new Map<string, string>()
  const aliases = new Map<string, string>()
  const order: string[] = []
  for (const id of [...new Set([...ids, ...Object.keys(rows)])]) {
    const row = rows[id]
    if (!record(row) || typeof row.path !== 'string' || !isAbsolute(row.path)
      || !Array.isArray(row.sessionIds) || !row.sessionIds.every(value => typeof value === 'string')) throw new Error('Invalid workspace sessions')
    try { row.path = await realpath(row.path) }
    catch (error) { if (!absent(error)) throw error }
    const path = String(row.path)
    const holder = byPath.get(path)
    if (holder === undefined) {
      byPath.set(path, id)
      order.push(id)
      continue
    }
    const retained = rows[holder]
    if (!record(retained) || !Array.isArray(retained.sessionIds)) throw new Error('Invalid retained workspace')
    const retainedSessions: unknown[] = retained.sessionIds
    const incomingSessions: unknown[] = row.sessionIds
    retained.sessionIds = [...new Set([...retainedSessions, ...incomingSessions])]
    aliases.set(id, holder)
    Reflect.deleteProperty(rows, id)
  }
  const owned = new Set<string>()
  for (const id of order) {
    const row = rows[id]
    if (!record(row) || !Array.isArray(row.sessionIds)) throw new Error('Invalid workspace sessions')
    row.sessionIds = row.sessionIds.filter((session: string) => { if (owned.has(session)) return false; owned.add(session); return true })
  }
  merged.global.workspaceIds = order
  const defaultId = merged.global.defaultWorkspaceId
  if (typeof defaultId === 'string' && aliases.has(defaultId)) merged.global.defaultWorkspaceId = aliases.get(defaultId)
  delete merged.global.pendingMutation
  const archived = merged.global.archivedSessionIds
  const pinned = merged.global.pinnedSessionIds
  if (Array.isArray(archived) && Array.isArray(pinned)) merged.global.pinnedSessionIds = pinned.filter(id => !archived.includes(id))
  return merged
}

async function persistDocument(destination: string, path: string, text: string): Promise<void> {
  await safe(destination, path)
  await mkdir(dirname(path), { recursive: true })
  const temporary = path + '.' + randomUUID() + '.tmp'
  try { await writeFile(temporary, text, { flag: 'wx', mode: 0o600 }); await rename(temporary, path) }
  finally { await rm(temporary, { force: true }) }
}

/** Repair the destination index once without revisiting completed source imports. */
async function repairWorkspaceIndex(destination: string): Promise<void> {
  const migration = join(destination, '.migration/zerowall-v9')
  const marker = join(migration, 'workspace-index-v1.json')
  await safe(destination, marker)
  if (await checkpointExists(marker)) return
  const path = join(destination, 'storages/workspace.json')
  await safe(destination, path)
  const input = await optional(path)
  if (input !== undefined) {
    const normalized = JSON.stringify(await workspace(undefined, json(input))) + '\n'
    if (normalized !== input) {
      const backup = join(migration, 'backup/workspace-before-dedup.json')
      await safe(destination, backup)
      if (await optional(backup) === undefined) await persistDocument(destination, backup, input)
      await persistDocument(destination, path, normalized)
    }
  }
  await persistDocument(destination, marker, JSON.stringify({ schema: 1 }) + '\n')
}

/**
 * Copy and hash user files, atomically activate complete session directories, and retain conflicts separately.
 * Failed items remain recoverable and do not stop unrelated imports. No source is modified.
 * @param destination - New isolated Harness home.
 * @param sources - Ordered sources; existing destination wins, then the first source.
 * @param vault - Destination OS-encrypted secrets.
 * @param progress - Safe status notification.
 * @returns Import summary with safe failure categories; partial imports retry on the next launch.
 */
export async function migrateLegacyData(destination: string, sources: readonly LegacySource[], vault: DesktopSecretVault,
  progress?: (phase: 'history' | 'settings' | 'credentials') => void): Promise<MigrationResult> {
  try { return await importLegacyData(destination, sources, vault, progress) }
  catch (error) {
    return { schema: 1, state: 'partial', files: 0, bytes: 0, conflicts: 0, credentials: 0, credentialFailures: 0,
      failures: [failure('destination', 'preparation', error)], completedAt: new Date().toISOString() }
  }
}

async function importLegacyData(destination: string, sources: readonly LegacySource[], vault: DesktopSecretVault,
  progress?: (phase: 'history' | 'settings' | 'credentials') => void): Promise<MigrationResult> {
  const migration = join(destination, '.migration', 'zerowall-v9')
  const receipt = join(migration, 'completed.json')
  await mkdir(destination, { recursive: true, mode: 0o700 })
  await safe(destination, destination)
  const result = { files: 0, bytes: 0, conflicts: 0, credentials: 0, credentialFailures: 0 }
  const failures: MigrationFailure[] = []
  try {
    await safe(destination, receipt)
    const completed = await optional(receipt)
    if (completed !== undefined) {
      const value = json(completed)
      if (!record(value) || value.schema !== 1 || value.state !== 'completed' || typeof value.completedAt !== 'string'
        || !['files', 'bytes', 'conflicts', 'credentials', 'credentialFailures'].every(key => typeof value[key] === 'number'
          && Number.isSafeInteger(value[key]) && value[key] >= 0)) throw new Error('Invalid migration receipt')
      if (value.credentialFailures === 0) {
        try { await repairWorkspaceIndex(destination) }
        catch (error) { failures.push(failure('destination', 'settings', error)) }
        return { schema: 1, state: failures.length === 0 ? 'completed' : 'partial', files: Number(value.files),
          bytes: Number(value.bytes), conflicts: Number(value.conflicts), credentials: Number(value.credentials),
          credentialFailures: 0, failures, completedAt: value.completedAt }
      }
    }
  } catch (error) { failures.push(failure('destination', 'receipt', error)) }
  await mkdir(migration, { recursive: true })
  const lock = join(migration, 'lock')
  // Only the Electron single-instance owner enters migration; an interrupted process leaves a resumable staging area.
  await writeFile(lock, String(process.pid), { mode: 0o600 })
  const persist = (path: string, text: string): Promise<void> => persistDocument(destination, path, text)
  const copy = async (source: string, path: string, output = path): Promise<void> => {
    const from = join(source, path), target = join(destination, output)
    await safe(source, from)
    await safe(destination, target)
    const hash = await digest(from)
    if (await safe(destination, target)) {
      if (await digest(target) === hash) return
      const sourceId = createHash('sha256').update(resolve(source)).digest('hex').slice(0, 16)
      result.conflicts++
      const alternate = join('.migration/zerowall-v9/conflicts', sourceId, path + '.' + hash)
      if (output === alternate) throw new Error('Migration conflict archive changed; manual recovery is required')
      await copy(source, path, alternate)
      return
    }
    await mkdir(dirname(target), { recursive: true })
    const temporary = target + '.' + randomUUID() + '.tmp'
    try {
      await copyFile(from, temporary)
      if (await digest(temporary) !== hash || await digest(from) !== hash) throw new Error('Source changed during import; close the previous app and retry')
      const size = (await lstat(temporary)).size
      await rename(temporary, target)
      result.files++; result.bytes += size
    } finally { await rm(temporary, { force: true }) }
  }
  try {
    for (const source of sources) {
      const sourceId = createHash('sha256').update(resolve(source.home)).digest('hex').slice(0, 16)
      const report = (operation: MigrationFailure['operation'], error: unknown): void => { failures.push(failure(sourceId, operation, error)) }
      const attempt = async <T>(operation: MigrationFailure['operation'], action: () => Promise<T>): Promise<T | undefined> => {
        try { return await action() } catch (error) { report(operation, error); return undefined }
      }
      if (resolve(source.home).toLowerCase() === resolve(destination).toLowerCase()
        || !await attempt('source', () => safe(source.home, source.home))) continue
      progress?.('history')
      const sessions = await attempt('session', () => sessionDirectories(source.home, 'sessions', (error) => { report('session', error) }))
      for (const path of sessions ?? []) {
        await attempt('session', async () => {
          const checkpoint = join(migration, 'sessions', sourceId, createHash('sha256').update(path).digest('hex') + '.json')
          await safe(destination, checkpoint)
          if (await checkpointExists(checkpoint)) return
          const roster = await files(source.home, path)
          const target = join(destination, path)
          let conflict = false
          if (await safe(destination, target)) {
            for (const file of roster) {
              if (!await safe(destination,
                join(destination,
                  file)) || await digest(join(source.home,
                file)) !== await digest(join(destination,
                file))) { conflict = true
                break }
            }
            if (!conflict) { await persist(checkpoint, '{"schema":1}\n'); return }
          }
          const staging = conflict ? join('.migration/zerowall-v9/conflicts',
            sourceId,
            path) : join('.migration/zerowall-v9/staging',
            sourceId,
            randomUUID(),
            path)
          await mkdir(join(destination, staging), { recursive: true })
          for (const file of roster) await copy(source.home, file, join(staging, relative(path, file)))
          if (conflict) result.conflicts++
          else { await mkdir(dirname(target), { recursive: true }); await rename(join(destination, staging), target) }
          await persist(checkpoint, '{"schema":1}\n')
        })
      }
      for (const tree of trees) {
        const paths = await attempt('file', () => files(source.home, tree, (error) => { report('file', error) }))
        for (const path of paths ?? []) await attempt('file', () => copy(source.home, path))
      }
      for (const path of documents) await attempt('file', async () => {
        if (await safe(source.home, join(source.home, path))) await copy(source.home, path)
      })
      if (source.desktopProfile) for (const path of ['profiles/desktop/package.json',
        'profiles/desktop/cordis.patch.yml',
        'profiles/desktop/pnpm-lock.yaml',
        'profiles/desktop/pnpm-workspace.yaml']) {
        await attempt('file', async () => {
          if (await safe(source.home, join(source.home, path))) await copy(source.home, path)
        })
      }
      // SQLite backup includes committed WAL transactions; copying only the main file would lose them.
      await attempt('database', async () => {
        if (source.database === undefined || !await safe(dirname(source.database), source.database)) return
        await mkdir(join(destination, 'zerowall'), { recursive: true })
        const database = new DatabaseSync(source.database, { readOnly: true })
        const temporary = join(destination, 'zerowall', 'research-' + randomUUID() + '.tmp')
        try {
          const check = database.prepare('PRAGMA quick_check').get()
          if (check?.quick_check !== 'ok') throw new Error('Legacy research database requires repair; source data was retained')
          await backup(database, temporary)
          const copied = new DatabaseSync(temporary, { readOnly: true })
          try { if (copied.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok') throw new Error('Copied research database failed verification') }
          finally { copied.close() }
          const target = join(destination, 'zerowall/research.sqlite')
          if (!await safe(destination, target)) {
            await rename(temporary, target)
            result.files++; result.bytes += (await lstat(target)).size
          } else if (await digest(temporary) !== await digest(target)) {
            const sourceId = createHash('sha256').update(resolve(source.home)).digest('hex').slice(0, 16)
            result.conflicts++
            await copy(destination,
              relative(destination,
                temporary),
              join('.migration/zerowall-v9/conflicts',
                sourceId,
                'research.sqlite.' + await digest(temporary)))
          }
        } finally { database.close(); await rm(temporary, { force: true }) }
      })
      progress?.('settings')
      await attempt('skills', async () => {
        const skillState = join(destination, 'zerowall-skills/state.json')
        await safe(destination, skillState)
        {
          const currentSkillState = await optional(skillState)
          const previousState = await safe(source.home, join(source.home, 'zerowall-skills/state.json'))
            ? await optional(join(source.home, 'zerowall-skills/state.json')) : undefined
          if (previousState !== undefined && currentSkillState === undefined) {
            const state = json(previousState)
            if (!record(state) || state.version !== 1 || !Array.isArray(state.imports)) throw new Error('Unsupported skill management state')
            for (const entry of state.imports) {
              if (!record(entry)) throw new Error('Invalid imported skill')
              for (const key of ['path', 'root']) {
                const old = entry[key]
                if (typeof old !== 'string') throw new Error('Invalid imported skill path')
                const rel = relative(source.home, old)
                if (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep)) {
                  entry[key] = join(destination, rel)
                }
              }
            }
            await persist(skillState, JSON.stringify(state) + '\n')
          } else {
            const current: unknown = currentSkillState === undefined ? { version: 1,
              imports: [],
              overrides: {},
              workspaceOverrides: {},
              topics: [] } : json(currentSkillState)
            if (!record(current) || current.version !== 1 || !Array.isArray(current.imports) || !record(current.overrides)) throw new Error('Unsupported skill management state')
            const imports: Record<string, unknown>[] = current.imports.filter(record)
            const overrides = current.overrides
            for (const enabled of [true, false]) {
              const directory = join('zerowall-skills', enabled ? 'enabled' : 'disabled')
              const paths = await files(source.home, directory, (error) =>{  report('skills', error) })
              for (const path of paths) {
                await attempt('skills', async () => {
                  if (!path.endsWith('SKILL.md')) return
                  const text = await readFile(join(source.home, path), 'utf8')
                  const front = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(text)
                  const metadata: unknown = front?.[1] === undefined ? {} : load(front[1])
                  const name = record(metadata) && typeof metadata.name === 'string' ? metadata.name : relative(directory,
                    dirname(path)).replaceAll(sep,
                    '-')
                  const description = record(metadata) && typeof metadata.description === 'string' ? metadata.description : name
                  if (imports.some(entry => entry.name === name)) return
                  const installed = join(destination, path)
                  imports.push({ id: 'legacy-' + createHash('sha256').update(path).digest('hex').slice(0, 24), name, description,
                    path: installed, root: dirname(installed), source: 'legacy-8.x' })
                  overrides[name] ??= enabled
                })
              }
            }
            if (imports.length > 0) await persist(skillState, JSON.stringify({ ...current, overrides, imports }) + '\n')
          }
        }
      })
      for (const path of ['settings.yaml', 'settings.yaml.imported', 'storages/workspace.json']) {
        await attempt('settings', async () => {
          if (!await safe(source.home, join(source.home, path))) return
          const input = await optional(join(source.home, path))
          if (input === undefined) return
          const outputPath = path === 'settings.yaml.imported' ? 'settings.yaml' : path
          const target = join(destination, outputPath)
          await safe(destination, target)
          const present = await optional(target)
          const yaml = outputPath.endsWith('.yaml')
          let previous: unknown, current: unknown
          try { previous = yaml ? load(input) : JSON.parse(input)
            current = present === undefined ? undefined : yaml ? load(present) : JSON.parse(present) }
          catch (_error) { throw new Error('Unreadable legacy user settings; source data was retained') }
          if (present !== undefined) await copy(destination, outputPath, join('.migration/zerowall-v9/backup', outputPath))
          const merged = yaml ? mergeMigratedSettings(previous, current) : await workspace(previous, current)
          await persist(target, yaml ? dump(merged) : JSON.stringify(merged) + '\n')
        })
      }
      progress?.('credentials')
      const imported = Object.create(null) as Record<string, string>
      await attempt('credentials', async () => {
        if (source.vault !== undefined && source.encryption !== undefined) {
          const encrypted = await optional(source.vault)
          if (encrypted !== undefined) {
            const entries = parseSecretVault(json(encrypted))
            for (const [id, encoded] of Object.entries(entries)) {
              try { imported[id] = source.encryption.decrypt(Buffer.from(encoded, 'base64')) }
              catch (_error) { result.credentialFailures++ }
            }
          }
        }
      })
      await attempt('credentials', async () => {
        const localCredentials = join(source.home, '.credentials.yaml')
        if (await safe(source.home, localCredentials)) {
          const text = await optional(localCredentials)
          let document: unknown
          try { document = text === undefined ? undefined : load(text) } catch (_error) { throw new Error('Unreadable credential document; source data was retained') }
          if (record(document) && record(document.records)) for (const [key, value] of Object.entries(document.records)) {
            const match = /^zerowall-ai-cloud\/secret-([a-f0-9]+)$/u.exec(key)
            if (match?.[1] === undefined || !record(value) || value.kind !== 'grant' || typeof value.payload !== 'string') continue
            const id = Buffer.from(match[1], 'hex').toString('utf8')
            if (SECRET_ID.test(id) && imported[id] === undefined) imported[id] = value.payload
          }
          if (record(document)) {
          // Keep other provider records in their original credential format; ZeroWall secrets use only the encrypted vault.
            const filtered = record(document.records) ? Object.fromEntries(Object.entries(document.records).filter(([key]) => !key.startsWith('zerowall-ai-cloud/'))) : {}
            if (Object.keys(filtered).length > 0 || (record(document.refs) && Object.keys(document.refs).length > 0)) {
              const target = join(destination, '.credentials.yaml')
              await safe(destination, target)
              const present = await optional(target)
              const current: unknown = present === undefined ? undefined : load(present)
              await persist(target, dump(mergeMigratedSettings({ ...document, records: filtered }, current)))
            }
          }
        }
      })
      await attempt('credentials', async () => {
      // A destination account or explicit sign-out is authoritative across all sources.
        const accountChosen = (await vault.get('zerowall.ai-cloud.login')) !== undefined || (await vault.get('zerowall.ai-cloud.manual-signout')) !== undefined
        const pending = Object.create(null) as Record<string, string>
        for (const [id, value] of Object.entries(imported)) {
          if (accountChosen && id.startsWith('zerowall.ai-cloud.')) continue
          if (await vault.get(id) === undefined) pending[id] = value
          Reflect.deleteProperty(imported, id)
        }
        if (Object.keys(pending).length > 0) {
          try {
            await vault.setMany(pending)
            result.credentials += Object.keys(pending).length
          } catch (_error) {
            // A failed batch writes nothing; isolate individual encryption or write failures.
            for (const [id, value] of Object.entries(pending)) {
              try { await vault.set(id, value); result.credentials++ }
              catch (error) { result.credentialFailures++; report('credentials', error) }
            }
          }
        }
      })
    }
  } finally {
    try { await rm(lock, { force: true }) }
    catch (error) { failures.push(failure('destination', 'receipt', error)) }
  }
  try { await repairWorkspaceIndex(destination) }
  catch (error) { failures.push(failure('destination', 'settings', error)) }
  let summary: MigrationResult = { schema: 1, state: failures.length > 0 || result.credentialFailures > 0 ? 'partial' : 'completed',
    ...result, failures, completedAt: new Date().toISOString() }
  try { await persist(summary.state === 'completed' ? receipt : join(migration, 'partial.json'), JSON.stringify(summary) + '\n') }
  catch (error) { failures.push(failure('destination', 'receipt', error)); summary = { ...summary, state: 'partial' } }
  return summary
}
