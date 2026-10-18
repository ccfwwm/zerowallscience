import nativeFs from 'node:fs'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Electron virtualizes .asar paths. Installation must copy their actual bytes.
const fs = process.versions.electron ? createRequire(import.meta.url)('original-fs') : nativeFs
const { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, unlinkSync, readdirSync, rmdirSync, openSync, readSync, closeSync, renameSync, writeFileSync, fsyncSync } = fs
const { copyFile, rename, stat } = fs.promises
const logIndex = process.argv.indexOf('--log', 4)
const logFile = logIndex < 0 ? undefined : process.argv[logIndex + 1]
function log(message) {
  if (logFile) try {
    if (!existsSync(logFile)) appendFileSync(logFile, '\ufeff', 'utf16le')
    appendFileSync(logFile, `${new Date().toISOString()}|${message}\r\n`, 'utf16le')
  } catch { /* Preserve the original installation error. */ }
}
process.on('uncaughtExceptionMonitor', error => log(error.stack ?? String(error)))
log('copy-runtime-start; mode=' + (process.argv.includes('--preflight') ? 'preflight' : 'install'))

// NSIS CopyFiles uses legacy shell copying and can silently omit paths at
// MAX_PATH. Node's Windows file API supports extended paths without changing
// the user's Windows policy. Run with the freshly extracted Electron runtime.
const source = realpathSync(resolve(process.argv[2]))
const target = resolve(process.argv[3])
if (source === target || !isAbsolute(target) || target === dirname(target)) throw new Error('Invalid installer copy boundary')
function inside(root, path) {
  const rel = relative(root, path)
  if (rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel)) throw new Error('Installer file escaped its root')
}
const checkedDirectories = new Set()
function safeDirectory(directory) {
  if (checkedDirectories.has(directory)) return
  if (directory !== target) safeDirectory(dirname(directory))
  if (existsSync(directory)) {
    const info = lstatSync(directory)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Installer destination is occupied by a file or link')
  } else mkdirSync(directory)
  checkedDirectories.add(directory)
}
const checkedParents = new Set()
function checkParent(directory) {
  if (checkedParents.has(directory)) return
  inside(target, directory)
  if (existsSync(directory) && (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink())) throw new Error('Installer destination contains a link')
  if (directory !== target) checkParent(dirname(directory))
  checkedParents.add(directory)
}
// This synchronous reader cannot overlap with itself. Reuse its bounded
// buffer instead of allocating four MiB for every small payload file.
const digestBuffer = Buffer.allocUnsafe(4 * 1024 * 1024)
function digest(path) {
  const file = openSync(path, 'r'), hash = createHash('sha256'), buffer = digestBuffer
  try {
    for (let bytes; (bytes = readSync(file, buffer, 0, buffer.length, null)) > 0;) hash.update(buffer.subarray(0, bytes))
    return hash.digest('hex')
  } finally { closeSync(file) }
}
// Preflight the full source and destination before copying the first file.
const files = [], sourceDigests = new Map()
const ownership = JSON.parse(readFileSync(join(source, 'resources/installer-owned.json'), 'utf8'))
if (ownership.schema !== 1 || !Array.isArray(ownership.files) || !ownership.files.length) throw new Error('Missing installer ownership inventory')
const seen = new Set()
for (const local of ownership.files) {
      if (typeof local !== 'string' || isAbsolute(local) || local.split(/[\\/]/u).some(part => part === '..' || part === '.') || seen.has(local)) throw new Error('Invalid owned file path')
      seen.add(local)
      const path = resolve(source, local), destination = resolve(target, local)
      inside(source, path); inside(target, destination)
      if (/^(?:Python|\.zerowall)(?:[\\/]|$)/iu.test(local)) throw new Error('Application payload must not overwrite Python')
      if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error('Owned source must be a regular file')
      inside(source, realpathSync(path))
      checkParent(dirname(destination))
      if (existsSync(destination) && (!lstatSync(destination).isFile() || lstatSync(destination).isSymbolicLink())) throw new Error('Installer destination file is unsafe')
      files.push({ local, source: path, destination, size: statSync(path).size })
}
// The offline payload is a product-owned closed runtime, not user data. Copy
// the complete new signed payload and delete obsolete files from its active
// root. A missing, corrupt or outdated old receipt must not block an upgrade.
const stale = []
const offlineRoot = join(target, 'resources/offline-profile')
const newReceiptPath = join(source, 'resources/offline-profile/receipt.json')
let inspectOldOffline = () => {}
if (!existsSync(newReceiptPath) && [...seen].some(local => local.startsWith('resources/offline-profile/'))) throw new Error('Incoming offline payload is missing its signed receipt')
if (existsSync(newReceiptPath)) {
  const { verifySignedDocument } = await import(pathToFileURL(join(source, 'resources/commands/resource-catalog.mjs')).href)
  const keys = JSON.parse(readFileSync(join(source, 'resources/commands/trusted-keys.json'), 'utf8'))
  const incoming = verifySignedDocument(JSON.parse(readFileSync(newReceiptPath, 'utf8')), keys)
  const entries = incoming.schema === 2 ? incoming.payloadFiles : incoming.schema === 1 ? incoming.files : undefined
  if (incoming.kind !== 'offline-profile' || incoming.localOnly || !Array.isArray(entries) || !entries.length) throw new Error('Invalid incoming offline ownership receipt')
  const expected = new Set(['resources/offline-profile/receipt.json'])
  if (!seen.has('resources/offline-profile/receipt.json')) throw new Error('Incoming offline receipt is absent from the installer inventory')
  for (const entry of entries) {
    if (typeof entry.path !== 'string' || isAbsolute(entry.path) || entry.path.includes('\\') || entry.path.split('/').some(part => !part || part === '.' || part === '..') || !Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/u.test(entry.sha256)) throw new Error('Unsafe incoming offline ownership entry')
    const local = 'resources/offline-profile/' + entry.path
    if (!seen.has(local) || expected.has(local)) throw new Error('Incoming signed payload is absent or duplicated in the installer inventory')
    const path = resolve(source, local)
    if (statSync(path).size !== entry.size || digest(path) !== entry.sha256) throw new Error('Incoming offline payload size or SHA-256 mismatch')
    sourceDigests.set(local, entry.sha256)
    expected.add(local)
  }
  for (const local of seen) if (local.startsWith('resources/offline-profile/') && !expected.has(local)) throw new Error('Incoming offline payload contains an unsigned file')
  function inspectOld(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      inside(offlineRoot, path)
      if (entry.isSymbolicLink()) throw new Error('Old offline payload contains a link; close the app and repair its path')
      if (entry.isDirectory()) inspectOld(path)
      else if (entry.isFile()) {
        const local = relative(target, path).replaceAll('\\', '/')
        if (!expected.has(local)) stale.push(path)
      } else throw new Error('Old offline payload contains a special file')
    }
  }
  inspectOldOffline = () => {
    if (existsSync(offlineRoot)) {
      if (!lstatSync(offlineRoot).isDirectory() || lstatSync(offlineRoot).isSymbolicLink()) throw new Error('Old offline payload root is unsafe')
      inspectOld(offlineRoot)
    }
  }
  inspectOldOffline()
}
// Delete only the old/new ownership difference; unknown application files and
// Python remain untouched. Old inventories are validated before any mutation.
function validateLocal(local) {
  if (typeof local !== 'string' || !local || isAbsolute(local) || local.includes('\\') || local.split('/').some(part => !part || part === '..' || part === '.') || /^(?:Python|\.zerowall)(?:\/|$)/iu.test(local) || local.startsWith('resources/installer-recovery/')) throw new Error('Invalid transaction ownership path')
  const path = resolve(target, local)
  inside(target, path); checkParent(dirname(path))
  if (existsSync(path) && (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())) throw new Error('Unsafe transaction file')
}
for (const file of files) validateLocal(file.local.replaceAll('\\', '/'))
for (const path of stale) validateLocal(relative(target, path).replaceAll('\\', '/'))
log(`payload-preflight-complete; files=${files.length}`)
if (process.argv.includes('--preflight')) {
  console.log(`Installer payload verified before removal: ${files.length} files.`)
  process.exit(0)
}
safeDirectory(target)
const recovery = join(target, 'resources/installer-recovery'), journalFile = join(recovery, 'transaction.json')
function persist(document) {
  safeDirectory(recovery)
  const initial = !existsSync(journalFile)
  if (initial && process.env.ZEROWALL_TEST_INSTALLER_FAILURE_AT === 'initial-journal-directory') throw new Error('Injected installer initial journal directory failure')
  const temporary = journalFile + '.tmp'
  writeFileSync(temporary, JSON.stringify(document))
  const handle = openSync(temporary, 'r+')
  try { fsyncSync(handle) } finally { closeSync(handle) }
  if (initial && process.env.ZEROWALL_TEST_INSTALLER_FAILURE_AT === 'initial-journal-temp') throw new Error('Injected installer initial journal temporary failure')
  // Exercise a failed durable commit without advancing the rollback state.
  if (document.state === 'committed' && process.env.ZEROWALL_TEST_INSTALLER_FAILURE_AT === 'commit-journal') throw new Error('Injected installer commit journal failure')
  renameSync(temporary, journalFile)
}
function recoverInitialJournal() {
  // The first checkpoint precedes every stage/backup or installed-file change.
  // A crash may leave only its newly created directory or its complete fsynced
  // temporary document. Anything else needs an authoritative journal to undo.
  const entries = readdirSync(recovery, { withFileTypes: true })
  if (entries.length) {
    if (entries.length !== 1 || entries[0].name !== 'transaction.json.tmp' || !entries[0].isFile() || entries[0].isSymbolicLink()) throw new Error('Installer recovery without a journal contains unknown content')
    const temporary = journalFile + '.tmp'
    const prior = JSON.parse(readFileSync(temporary, 'utf8'))
    if (!prior || typeof prior !== 'object' || Object.keys(prior).sort().join(',') !== 'root,rows,schema,state' || prior.schema !== 1 || prior.root !== target || prior.state !== 'staging' || !Array.isArray(prior.rows) || !prior.rows.length) throw new Error('Invalid initial installer recovery journal')
    const incoming = new Set(files.map(file => file.local.replaceAll('\\', '/'))), locals = new Set()
    for (const row of prior.rows) {
      if (!row || typeof row !== 'object' || Object.keys(row).sort().join(',') !== 'incoming,local,original' || typeof row.original !== 'boolean' || typeof row.incoming !== 'boolean' || !row.original && !row.incoming) throw new Error('Invalid initial installer recovery row')
      validateLocal(row.local)
      const key = process.platform === 'win32' ? row.local.toLowerCase() : row.local
      if (locals.has(key) || row.incoming !== incoming.has(row.local) || row.original !== existsSync(join(target, row.local))) throw new Error('Initial installer recovery ownership changed')
      locals.add(key); incoming.delete(row.local)
    }
    if (incoming.size) throw new Error('Initial installer recovery inventory is incomplete')
    // No staging or backup directories exist, so do not run rollback against
    // installed files. Remove only the validated initial checkpoint itself.
    unlinkSync(temporary)
  }
  rmdirSync(recovery)
  checkedDirectories.clear()
}
function cleanup(document) {
  const directories = new Set([recovery])
  for (const row of document.rows) for (const kind of ['stage', 'backup']) {
    const path = join(recovery, kind, row.local)
    if (existsSync(path)) unlinkSync(path)
    let cursor = dirname(path)
    while (cursor !== recovery) { directories.add(cursor); cursor = dirname(cursor) }
  }
  for (const path of [journalFile, journalFile + '.tmp']) if (existsSync(path)) unlinkSync(path)
  for (const path of [...directories].sort((a,b) => b.length-a.length)) if (existsSync(path) && !readdirSync(path).length) rmdirSync(path)
  checkedDirectories.clear()
}
function rollback(document) {
  for (const row of document.rows) {
    const path = join(target, row.local), backup = join(recovery, 'backup', row.local), staged = join(recovery, 'stage', row.local)
    if (existsSync(backup)) {
      if (existsSync(path)) unlinkSync(path)
      safeDirectory(dirname(path)); renameSync(backup, path)
    } else if (document.state === 'applying' && !row.original && row.incoming && !existsSync(staged) && existsSync(path)) unlinkSync(path)
  }
  cleanup(document)
}
if (existsSync(recovery)) {
  checkParent(recovery)
  if (!existsSync(journalFile)) recoverInitialJournal()
  else {
  const prior = JSON.parse(readFileSync(journalFile, 'utf8'))
  if (prior.schema !== 1 || prior.root !== target || !['staging','applying','committed'].includes(prior.state) || !Array.isArray(prior.rows)) throw new Error('Invalid installer recovery journal')
  for (const row of prior.rows) {
    validateLocal(row.local)
    for (const kind of ['stage','backup']) {
      const path = join(recovery, kind, row.local)
      // Validate transaction parents separately: their root is installer-owned.
      let cursor = dirname(path)
      while (cursor !== target) {
        if (existsSync(cursor) && (!lstatSync(cursor).isDirectory() || lstatSync(cursor).isSymbolicLink())) throw new Error('Unsafe recovery path')
        cursor = dirname(cursor)
      }
      if (existsSync(path) && (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())) throw new Error('Unsafe recovery file')
    }
  }
  if (prior.state === 'committed') cleanup(prior)
  else rollback(prior)
  }
  // Rollback may restore obsolete closed-runtime files that were absent from
  // both the preflight tree and an older ownership inventory. Recalculate
  // against the signed incoming receipt after recovery, before staging.
  stale.length = 0
  inspectOldOffline()
  for (const path of stale) validateLocal(relative(target, path).replaceAll('\\', '/'))
  log('interrupted-transaction-recovered')
}
const oldInventory = join(target, 'resources/installer-owned.json')
if (existsSync(oldInventory)) {
  const old = JSON.parse(readFileSync(oldInventory, 'utf8'))
  if (old.schema !== 1 || !Array.isArray(old.files)) throw new Error('Invalid old installer ownership')
  for (const local of old.files) {
    validateLocal(local)
    if (!seen.has(local) && existsSync(join(target, local))) stale.push(join(target, local))
  }
}
const rows = [...new Set([...files.map(file => file.local.replaceAll('\\', '/')), ...stale.map(path => relative(target,path).replaceAll('\\', '/'))])].map(local => ({ local, original: existsSync(join(target,local)), incoming: seen.has(local) }))
const transaction = { schema: 1, root: target, state: 'staging', rows }
persist(transaction)
async function bounded(entries, task) {
  let next = 0
  const results = await Promise.allSettled(Array.from({ length: Math.min(12,entries.length) }, async () => {
    while(next < entries.length) { const index = next++; await task(entries[index],index) }
  }))
  const failure = results.find(result => result.status === 'rejected')
  if (failure) throw failure.reason
}
try {
  await bounded(files, async file => {
    const staged = join(recovery, 'stage', file.local)
    safeDirectory(dirname(staged))
    const expected = sourceDigests.get(file.local) ?? digest(file.source)
    let moved = false
    if (process.argv.includes('--move-source')) {
      try { await rename(file.source,staged); moved = true }
      catch(error) { if (!['EXDEV','EPERM','EBUSY','EACCES'].includes(error.code)) throw error }
    }
    if (!moved) await copyFile(file.source, staged)
    if ((await stat(staged)).size !== file.size || digest(staged) !== expected) throw new Error('Installer staging verification failed')
  })
  log('transaction-stage-verified')
  transaction.state = 'applying'; persist(transaction)
  await bounded(rows, async (row,index) => {
    const path = join(target,row.local), backup = join(recovery,'backup',row.local)
    if (row.original) { safeDirectory(dirname(backup)); await rename(path,backup) }
    if (row.incoming) { safeDirectory(dirname(path)); await rename(join(recovery,'stage',row.local),path) }
    // Fault injection is confined to isolated installer regression fixtures.
    if (process.env.ZEROWALL_TEST_INSTALLER_FAILURE_AT === String(index)) throw new Error('Injected installer transaction failure')
  })
  // A failed write/fsync/rename must still roll back every newly introduced
  // file. Advance the in-memory state only after the commit is durable.
  persist({ ...transaction, state: 'committed' }); transaction.state = 'committed'
} catch(error) {
  rollback(transaction)
  log('transaction-rolled-back')
  throw error
}
cleanup(transaction)
console.log(`Application files copied: ${files.length}; obsolete runtime files removed: ${stale.length}; Python and user data preserved.`)
log(`copy-complete; files=${files.length}; obsolete=${stale.length}`)
