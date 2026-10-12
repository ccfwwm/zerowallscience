import nativeFs from 'node:fs'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Electron virtualizes .asar paths. Installation must copy their actual bytes.
const { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, unlinkSync, readdirSync, rmdirSync, openSync, readSync, closeSync } = process.versions.electron ? createRequire(import.meta.url)('original-fs') : nativeFs

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
function safeDirectory(directory) {
  if (directory !== target) safeDirectory(dirname(directory))
  if (existsSync(directory)) {
    const info = lstatSync(directory)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Installer destination is occupied by a file or link')
  } else mkdirSync(directory)
}
function digest(path) {
  const file = openSync(path, 'r'), hash = createHash('sha256'), buffer = Buffer.allocUnsafe(4 * 1024 * 1024)
  try {
    for (let bytes; (bytes = readSync(file, buffer, 0, buffer.length, null)) > 0;) hash.update(buffer.subarray(0, bytes))
    return hash.digest('hex')
  } finally { closeSync(file) }
}
// Preflight the full source and destination before copying the first file.
const files = []
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
      let parent = dirname(destination)
      while (parent !== target) {
        if (existsSync(parent) && (!lstatSync(parent).isDirectory() || lstatSync(parent).isSymbolicLink())) throw new Error('Installer destination contains a link')
        parent = dirname(parent)
      }
      if (existsSync(destination) && (!lstatSync(destination).isFile() || lstatSync(destination).isSymbolicLink())) throw new Error('Installer destination file is unsafe')
      files.push({ source: path, destination, size: statSync(path).size })
}
// The offline payload is a product-owned closed runtime, not user data. Copy
// the complete new signed payload and delete obsolete files from its active
// root. A missing, corrupt or outdated old receipt must not block an upgrade.
const stale = []
const offlineRoot = join(target, 'resources/offline-profile')
const newReceiptPath = join(source, 'resources/offline-profile/receipt.json')
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
  if (existsSync(offlineRoot)) {
    if (!lstatSync(offlineRoot).isDirectory() || lstatSync(offlineRoot).isSymbolicLink()) throw new Error('Old offline payload root is unsafe')
    inspectOld(offlineRoot)
  }
}
safeDirectory(target)
// Remove only stale physical files inside the product-owned runtime.
const staleDirectories = new Set()
for (const path of stale) {
  unlinkSync(path)
  let cursor = dirname(path)
  while (cursor !== target) { staleDirectories.add(cursor); cursor = dirname(cursor) }
}
for (const path of [...staleDirectories].sort((a, b) => b.length - a.length)) if (existsSync(path) && readdirSync(path).length === 0) rmdirSync(path)
for (const file of files) {
  safeDirectory(dirname(file.destination))
  copyFileSync(file.source, file.destination)
  if (statSync(file.destination).size !== file.size) throw new Error('Installer copy incomplete')
}
console.log(`Application files copied: ${files.length}; obsolete runtime files removed: ${stale.length}; Python and user data preserved.`)
