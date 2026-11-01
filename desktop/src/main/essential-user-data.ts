import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { parse, stringify } from 'yaml'
import { CREDENTIAL_KEY, type CredentialEncryption } from './credentials/vault.js'
import { openWindowsProfileEncryption } from './credentials/windows-profile.js'

const RECEIPT = '.migration/essential-user-data-v1/completed.json'
// Explicit user-owned data only. Never enumerate a legacy profile, dependency
// tree, runtime, download cache, Python environment or Chromium storage.
const TREES = ['harness/sessions', 'harness/attachments', 'harness/.agent-presets', 'harness/zerowall-skills/enabled', 'harness/zerowall-skills/disabled']
const DOCUMENTS = ['harness/storages/ssh_ops_known_hosts.json', 'harness/storages/ssh_ops_profiles.json',
  'harness/storages/ssh_ops_settings.json', 'harness/storages/message_feedback.json',
  'harness/wsl-workspaces.json', 'harness/dream-skin.json', 'harness/resources/plugins/selection.json']
const FILES = ['harness/settings.yaml.imported', 'harness/zerowall-mcp-defaults-v1.json']
type RecordValue = Record<string, any>
const object = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value)
const missing = (error: unknown) => ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')
const same = (a: string, b: string) => process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b)

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch (error) { if (missing(error)) return false; throw error }
}

// Check every path component, including junctions in a parent. The caller only
// supplies fixed relative paths or directory entries obtained under these roots.
async function safePath(root: string, path: string): Promise<boolean> {
  const child = relative(root, path)
  if (child === '..' || child.startsWith(`..${sep}`) || resolve(root, child) !== resolve(path)) throw new Error('Unsafe recovery path.')
  let current = resolve(root)
  for (const segment of ['', ...child.split(sep).filter(Boolean)]) {
    current = join(current, segment)
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink() || !same(current, await realpath(current))) throw new Error('Recovery path redirects outside its profile.')
    } catch (error) { if (missing(error)) return false; throw error }
  }
  return true
}

async function readOptional(root: string, path: string): Promise<string | undefined> {
  const file = join(root, path)
  if (!await safePath(root, file)) return undefined
  return readFile(file, 'utf8')
}

function decode(text: string, yaml = false): any {
  // Parser messages can quote source lines containing credentials.
  try { return yaml ? parse(text) : JSON.parse(text) } catch { throw new Error('A legacy user settings document has an invalid format.') }
}

/** Fill missing fields; existing settings, model selections and deletion flags
 * win. Named arrays (e.g. environment variables) merge without dropping rows. */
export function mergeUserSettings(legacy: any, current: any): any {
  if (current === undefined) return legacy
  if (object(legacy) && object(current)) {
    const result = Object.assign(Object.create(null), legacy)
    for (const [key, value] of Object.entries(current)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) continue
      result[key] = mergeUserSettings(legacy[key], value)
    }
    return result
  }
  if (Array.isArray(legacy) && Array.isArray(current)) {
    if ([...legacy, ...current].every(value => typeof value === 'string')) return [...new Set([...current, ...legacy])]
    if ([...legacy, ...current].every(value => object(value) && typeof value.name === 'string')) {
      const rows = new Map(legacy.map(row => [row.name, row]))
      for (const row of current) rows.set(row.name, mergeUserSettings(rows.get(row.name), row))
      return [...rows.values()]
    }
  }
  return current
}

export function mergeWorkspace(legacy: RecordValue, current: RecordValue | undefined): RecordValue {
  if (legacy.unit?.name !== 'workspace' || legacy.unit?.version !== 2 || !object(legacy.tables?.workspaces)) throw new Error('Unsupported legacy workspace format.')
  if (current && (current.unit?.name !== 'workspace' || current.unit?.version !== 2 || !object(current.tables?.workspaces))) throw new Error('Unsupported current workspace format.')
  const merged = mergeUserSettings(legacy, current) as RecordValue
  const records = merged.tables.workspaces
  // One owner per session; current workspace ownership takes precedence.
  const ids = [...new Set([...(current?.global?.workspaceIds ?? []), ...(legacy.global?.workspaceIds ?? []), ...Object.keys(records)])] as string[]
  const owned = new Set<string>()
  for (const id of ids) {
    if (!object(records[id]) || !Array.isArray(records[id].sessionIds)) throw new Error('Invalid workspace session index.')
    records[id].sessionIds = records[id].sessionIds.filter((session: string) => {
      if (owned.has(session)) return false
      owned.add(session); return true
    })
  }
  merged.global.workspaceIds = ids
  delete merged.global.pendingMutation
  const archived = new Set(merged.global.archivedSessionIds ?? [])
  merged.global.pinnedSessionIds = (merged.global.pinnedSessionIds ?? []).filter((id: string) => !archived.has(id))
  return merged
}

export function mergePatches(legacy: any, current: any): any[] {
  legacy ??= []
  current ??= []
  if (!Array.isArray(legacy) || (current !== undefined && !Array.isArray(current))) throw new Error('Unsupported user patch format.')
  const rows: any[] = [...(current ?? [])]
  for (const row of legacy) {
    if (!object(row) || (typeof row.name !== 'string' && typeof row.id !== 'string')) throw new Error('Invalid user patch entry.')
    // Retired plugins must never be reintroduced by a historical patch.
    if (/dsh-auto-review|dsh-capability-menu/u.test(`${row.name ?? ''} ${row.id ?? ''}`)) continue
    const index = rows.findIndex(value => row.id ? value.id === row.id : value.name === row.name)
    if (index < 0) rows.push(row)
    else rows[index] = mergeUserSettings(row, rows[index])
  }
  return rows
}

export interface EssentialRecoveryResult {
  state: 'skipped' | 'completed' | 'already-completed'
  sources: number
  copiedFiles: number
  copiedBytes: number
  credentials: number
  conflicts: number
  elapsedMs: number
}

export async function recoverEssentialUserData(options: {
  enabled: boolean
  userDataPath: string
  legacyRoots: readonly string[]
  encryption: CredentialEncryption
  openLegacyEncryption?: (root: string) => Promise<CredentialEncryption & { dispose?(): void }>
  progress?: (message: string) => void
}): Promise<EssentialRecoveryResult> {
  const started = Date.now()
  const result: EssentialRecoveryResult = { state: 'skipped', sources: 0, copiedFiles: 0, copiedBytes: 0, credentials: 0, conflicts: 0, elapsedMs: 0 }
  if (!options.enabled) return result
  const target = resolve(options.userDataPath)
  if (await readOptional(target, RECEIPT) !== undefined) {
    const receipt = decode((await readOptional(target, RECEIPT))!)
    if (receipt.schema === 1 && receipt.state === 'completed') return { ...result, state: 'already-completed', elapsedMs: Date.now() - started }
    throw new Error('Invalid essential recovery receipt.')
  }
  await mkdir(target, { recursive: true })
  if (!await safePath(target, target)) throw new Error('User profile is unavailable.')
  const roots: string[] = []
  for (const candidate of options.legacyRoots) {
    const root = resolve(candidate)
    if (same(root, target) || roots.some(value => same(value, root))) continue
    if (await safePath(root, root) && (await lstat(root)).isDirectory()) roots.push(root)
  }
  result.sources = roots.length
  const backupRoot = '.migration/essential-user-data-v1/backup'
  const persist = async (path: string, contents: string) => {
    const file = join(target, path)
    await safePath(target, file)
    await mkdir(dirname(file), { recursive: true })
    const backup = join(target, backupRoot, path)
    if (await exists(file) && !await exists(backup)) {
      await safePath(target, backup)
      await mkdir(dirname(backup), { recursive: true })
      await copyFile(file, backup, constants.COPYFILE_EXCL)
    }
    const temporary = `${file}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, contents, { flag: 'wx', mode: 0o600 })
      await rename(temporary, file)
    } finally { await rm(temporary, { force: true }) }
  }
  const copy = async (source: string, path: string, conflict = false) => {
    const from = join(source, path), to = join(target, path)
    if (!await safePath(source, from)) return
    const info = await lstat(from)
    if (!info.isFile()) throw new Error('Unsupported user data entry.')
    await safePath(target, to)
    if (await exists(to)) {
      // Never overwrite current session logs or attachments. Keep a conflicting
      // legacy file separately so both byte streams remain recoverable.
      if (conflict && (await stat(to)).size !== info.size) {
        const alternate = join(target, '.migration/essential-user-data-v1/conflicts', String(roots.indexOf(source)), path)
        await safePath(target, alternate)
        await mkdir(dirname(alternate), { recursive: true })
        if (!await exists(alternate)) await copyFile(from, alternate, constants.COPYFILE_EXCL)
        result.conflicts++
      }
      return
    }
    await mkdir(dirname(to), { recursive: true })
    const temporary = `${to}.${randomUUID()}.tmp`
    try {
      await copyFile(from, temporary, constants.COPYFILE_EXCL)
      if ((await stat(temporary)).size !== info.size) throw new Error('Incomplete user data copy.')
      await rename(temporary, to)
      result.copiedFiles++; result.copiedBytes += info.size
    } finally { await rm(temporary, { force: true }) }
  }
  const tree = async (source: string, path: string) => {
    if (!await safePath(source, join(source, path))) return
    const entries = await readdir(join(source, path), { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new Error('Linked legacy user data requires manual recovery.')
      const child = join(path, entry.name)
      if (entry.isDirectory()) await tree(source, child)
      else if (entry.isFile()) files.push(child)
    }
    for (let offset = 0; offset < files.length; offset += 8) await Promise.all(files.slice(offset, offset + 8).map(path => copy(source, path, true)))
  }
  options.progress?.('正在恢复旧版聊天记录和用户配置（仅首次启动）')
  const providers: Array<CredentialEncryption & { dispose?(): void }> = []
  try {
    const sourceVaults: Array<{ entries: Record<string, string>; provider?: CredentialEncryption }> = []
    const vaultPath = 'credentials/vault.json'
    const currentText = await readOptional(target, vaultPath)
    const current = currentText === undefined ? { version: 1, entries: {} } : decode(currentText)
    const validate = (document: any) => {
      if (document.version !== 1 || !object(document.entries) || Object.entries(document.entries).some(([key, value]) => !CREDENTIAL_KEY.test(key) || typeof value !== 'string')) throw new Error('Unsupported credential vault format.')
    }
    validate(current)
    for (const root of roots) {
      const text = await readOptional(root, vaultPath)
      if (text === undefined) { sourceVaults.push({ entries: {} }); continue }
      const document = decode(text); validate(document)
      let provider: CredentialEncryption | undefined
      // Old ciphertext may already decrypt with the current profile. Only
      // invoke DPAPI when a differing key actually requires recovery.
      const values = Object.values(document.entries) as string[]
      if (values.some(value => { try { options.encryption.decrypt(Buffer.from(value, 'base64')); return false } catch { return true } })) {
        const opened = await (options.openLegacyEncryption ?? openWindowsProfileEncryption)(root)
        providers.push(opened); provider = opened
      }
      sourceVaults.push({ entries: document.entries, provider })
    }
    const decrypt = (encoded: string, preferred?: CredentialEncryption): string => {
      for (const provider of [options.encryption, ...(preferred ? [preferred] : []), ...providers]) {
        try { return provider.decrypt(Buffer.from(encoded, 'base64')) } catch { /* try the profile which owns this ciphertext */ }
      }
      throw new Error('A stored credential could not be recovered for this Windows user.')
    }
    // Repair ciphertext copied by earlier releases with the wrong profile key.
    for (const [key, value] of Object.entries(current.entries) as Array<[string, string]>) {
      try { options.encryption.decrypt(Buffer.from(value, 'base64')) } catch {
        current.entries[key] = options.encryption.encrypt(decrypt(value)).toString('base64'); result.credentials++
      }
    }
    const accountPrefix = 'zerowall.ai-cloud.'
    const hasAccount = (entries: Record<string, string>) => ['session', 'login', 'manual-signout'].some(key => entries[accountPrefix + key] !== undefined)
    const accountSource = !hasAccount(current.entries) ? sourceVaults.find(document => hasAccount(document.entries)) : undefined
    if (accountSource) {
      for (const key of Object.keys(current.entries)) if (key.startsWith(accountPrefix)) delete current.entries[key]
      for (const [key, value] of Object.entries(accountSource.entries)) if (key.startsWith(accountPrefix)) {
        current.entries[key] = options.encryption.encrypt(decrypt(value, accountSource.provider)).toString('base64'); result.credentials++
      }
    }
    for (const source of sourceVaults) for (const [key, value] of Object.entries(source.entries)) {
      if (key.startsWith(accountPrefix)) continue // never combine two accounts
      if (key === 'zerowall.environment.meta' && current.entries[key]) {
        const merged = mergeUserSettings(decode(decrypt(value, source.provider)), decode(decrypt(current.entries[key])))
        current.entries[key] = options.encryption.encrypt(JSON.stringify(merged)).toString('base64')
      } else if (current.entries[key] === undefined) {
        current.entries[key] = options.encryption.encrypt(decrypt(value, source.provider)).toString('base64'); result.credentials++
      }
    }
    // Complete data copies before making restored workspace indices visible.
    for (const root of roots) for (const path of TREES) await tree(root, path)
    for (const root of roots) {
      for (const path of FILES) await copy(root, path)
      for (const path of DOCUMENTS) {
        const source = await readOptional(root, path)
        if (source === undefined) continue
        const current = await readOptional(target, path)
        if (path.endsWith('/selection.json') && current !== undefined) continue
        await persist(path, JSON.stringify(mergeUserSettings(decode(source), current === undefined ? undefined : decode(current))))
      }
      for (const path of ['harness/.credentials.yaml', 'harness/profiles/web/cordis.patch.yml', 'harness/storages/workspace.json']) {
        const source = await readOptional(root, path)
        if (source === undefined) continue
        const yaml = path.endsWith('.yaml') || path.endsWith('.yml')
        const oldDocument = decode(source, yaml)
        const current = await readOptional(target, path)
        const currentDocument = current === undefined ? undefined : decode(current, yaml)
        const merged = path.endsWith('workspace.json') ? mergeWorkspace(oldDocument, currentDocument)
          : path.endsWith('cordis.patch.yml') ? mergePatches(oldDocument, currentDocument) : mergeUserSettings(oldDocument, currentDocument)
        if (path.endsWith('.credentials.yaml') && currentDocument) {
          // Credential records are tagged unions; a current record must replace
          // its old counterpart in full rather than combine two auth formats.
          for (const field of ['refs', 'records']) merged[field] = { ...(oldDocument?.[field] ?? {}), ...(currentDocument[field] ?? {}) }
        }
        await persist(path, yaml ? stringify(merged) : JSON.stringify(merged))
      }
    }
    if (currentText !== undefined || Object.keys(current.entries).length) await persist(vaultPath, JSON.stringify(current))
    result.state = 'completed'; result.elapsedMs = Date.now() - started
    await persist(RECEIPT, JSON.stringify({ schema: 1, ...result, completedAt: new Date().toISOString() }))
    return result
  } finally { for (const provider of providers) provider.dispose?.() }
}
