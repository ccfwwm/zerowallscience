import { randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { renameFile } from './atomic-file.js'
import { checkPythonCancellation } from './python-operation.js'

interface Change { path: string; existed: boolean }
interface Journal { schema: 1; id: string; root: string; state: 'prepared' | 'applying' | 'pending-verification' | 'committed' | 'restored'; changes: Change[] }
function within(root: string, path: string): string {
  const result = resolve(root, path); const local = relative(resolve(root), result)
  if (!local || local === '..' || local.startsWith('..\\') || local.startsWith('../') || isAbsolute(local) || local.split(/[\\/]/u).includes('.zerowall')) throw new Error('PYTHON_TRANSACTION_PATH: invalid owned file.')
  return result
}
/** Check every existing ancestor before following it. A junction in Lib must
 * never turn a package repair into a write outside the selected runtime. */
async function safePath(root: string, path: string, management = false): Promise<string> {
  const target = management ? resolve(root, path) : within(root, path)
  const local = relative(resolve(root), target)
  if (local === '..' || local.startsWith('..' + sep) || isAbsolute(local)) throw new Error('PYTHON_TRANSACTION_PATH: escaped root.')
  let cursor = resolve(root)
  for (const part of ['', ...local.split(sep).filter(Boolean)]) {
    cursor = part ? join(cursor, part) : cursor
    const info = await lstat(cursor).catch(error => { if (error.code === 'ENOENT') return undefined; throw error })
    if (info?.isSymbolicLink()) throw new Error('PYTHON_TRANSACTION_PATH: link in runtime path.')
    if (info && cursor !== target && !info.isDirectory()) throw new Error('PYTHON_TRANSACTION_PATH: ancestor is not a directory.')
  }
  return target
}
async function files(root: string, prefix = ''): Promise<string[]> {
  const rows: string[] = []
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('PYTHON_TRANSACTION_PATH: candidate contains a link.')
    const path = join(prefix, entry.name)
    if (entry.isDirectory()) rows.push(...await files(root, path))
    else if (entry.isFile()) { within(root, path); rows.push(path) }
  }
  return rows
}
async function atomic(path: string, value: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`
  await mkdir(dirname(path), { recursive: true }); await writeFile(temporary, JSON.stringify(value)); await renameFile(temporary, path)
}
async function replaceFile(source: string, target: string) {
  await mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.${randomUUID()}.tmp`
  try { await cp(source, temporary); await renameFile(temporary, target) } finally { await rm(temporary, { force: true }) }
}
export async function restoreFixedTransaction(root: string, id: string): Promise<void> {
  if (!/^[a-f0-9-]{36}$/u.test(id)) throw new Error('Invalid Python transaction id.')
  const directory = await safePath(root, join('.zerowall', 'transactions', id), true); const journal = JSON.parse(await readFile(await safePath(directory, 'journal.json'), 'utf8')) as Journal
  if (resolve(journal.root) !== resolve(root) || journal.id !== id || journal.schema !== 1) throw new Error('Python transaction target differs from the fixed runtime.')
  if (!Array.isArray(journal.changes) || !['prepared', 'applying', 'pending-verification', 'committed', 'restored'].includes(journal.state)) throw new Error('Invalid Python transaction journal.')
  if (journal.state === 'restored') return
  for (const change of [...journal.changes].reverse()) {
    const target = await safePath(root, change.path)
    if (change.existed) await replaceFile(await safePath(join(directory, 'backup'), change.path), target)
    else await rm(target, { force: true })
  }
  await atomic(join(directory, 'journal.json'), { ...journal, state: 'restored' })
  await atomic(join(root, '.zerowall', 'revision.json'), { revision: randomUUID(), restored: id })
}

/** Replace only candidate-owned files. User files and extra installed
 * distributions remain intact, including files inside Lib and Scripts. */
export async function commitFixedRuntime(root: string, candidate: string, verify: () => Promise<void | 'pending'>, options: { prefix?: (string) | undefined; removals?: (string[]) | undefined } = {}): Promise<string> {
  const id = randomUUID(); const directory = join(root, '.zerowall', 'transactions', id)
  await safePath(root, join('.zerowall', 'transactions', id), true)
  const incoming = await files(candidate)
  const sources = new Map(incoming.map(path => [join(options.prefix ?? '', path), path]))
  const changes: Change[] = []
  for (const path of new Set([...sources.keys(), ...(options.removals ?? [])])) {
    const target = await safePath(root, path); const existing = await lstat(target).catch(error => { if (error.code === 'ENOENT') return undefined; throw error })
    if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error('Python owned file is occupied by a directory or link: ' + path)
    changes.push({ path, existed: !!existing })
    if (existing) { const backup = within(join(directory, 'backup'), path); await mkdir(dirname(backup), { recursive: true }); await cp(target, backup) }
  }
  const journal: Journal = { schema: 1, id, root, state: 'prepared', changes }
  await atomic(join(directory, 'journal.json'), journal)
  try {
    await atomic(join(directory, 'journal.json'), { ...journal, state: 'applying' })
    for (const change of changes) {
      checkPythonCancellation()
      const target = await safePath(root, change.path)
      const source = sources.get(change.path)
      if (source) await replaceFile(await safePath(candidate, source), target)
      else await rm(target, { force: true })
    }
    const verification = await verify()
    checkPythonCancellation()
    await atomic(join(directory, 'journal.json'), { ...journal, state: verification === 'pending' ? 'pending-verification' : 'committed' })
    await atomic(join(root, '.zerowall', 'revision.json'), { revision: randomUUID(), transactionId: id })
    if (!options.prefix) {
      const previous = await readFile(join(root, '.zerowall', 'runtime-files.json'), 'utf8').then(JSON.parse, () => ({}))
      await atomic(join(root, '.zerowall', 'runtime-files.json'), { schema: 1, transactionId: id, files: [...new Set([...(previous.files ?? []), ...sources.keys()])] })
    }
    return id
  } catch (error) { await restoreFixedTransaction(root, id); throw error }
}

/** A package waiting for another package in this plan is durable but is not
 * accepted until its import succeeds against the final fixed environment. */
export async function completeFixedTransaction(root: string, id: string): Promise<void> {
  if (!/^[a-f0-9-]{36}$/u.test(id)) throw new Error('Invalid Python transaction id.')
  const directory = await safePath(root, join('.zerowall', 'transactions', id), true)
  const journal = JSON.parse(await readFile(await safePath(directory, 'journal.json'), 'utf8')) as Journal
  if (journal.schema !== 1 || journal.id !== id || resolve(journal.root) !== resolve(root) || journal.state !== 'pending-verification') throw new Error('Invalid pending Python transaction.')
  checkPythonCancellation()
  await atomic(join(directory, 'journal.json'), { ...journal, state: 'committed' })
}

export async function recoverFixedTransactions(root: string): Promise<void> {
  const transactions = join(root, '.zerowall', 'transactions')
  for (const id of await readdir(transactions).catch(() => [])) {
    if (!/^[a-f0-9-]{36}$/u.test(id)) continue
    const journal = await readFile(join(transactions, id, 'journal.json'), 'utf8').then(JSON.parse, () => undefined)
    if (journal?.state === 'prepared' || journal?.state === 'applying' || journal?.state === 'pending-verification') await restoreFixedTransaction(root, id)
  }
}
