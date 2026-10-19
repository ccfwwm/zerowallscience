import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, readdir, rename, writeFile, rm } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { repairProfileLayout } from './profile-layout.mjs'
import { runProfilePnpmTransaction } from './profile-pnpm-transaction.mjs'

const [pnpm, ...args] = process.argv.slice(2)
if (!pnpm) throw new Error('Missing installation-owned pnpm')
const executable = process.env.ZEROWALL_PNPM_NODE || process.execPath
async function run(arguments_, cwd = process.cwd()) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, ['--expose-internals', pnpm, ...arguments_], { cwd, env: process.env, windowsHide: true, stdio: ['inherit', 'pipe', 'pipe'] })
    let tail = ''
    for (const stream of ['stdout', 'stderr']) child[stream].on('data', chunk => {
      process[stream].write(chunk)
      tail = (tail + String(chunk)).slice(-65536)
    })
    child.once('error', reject)
    child.once('close', code => accept({ code: code ?? 1, tail }))
    for (const signal of ['SIGTERM', 'SIGINT']) {
      const forward = () => child.kill(signal)
      process.once(signal, forward)
      child.once('close', () => process.off(signal, forward))
    }
  })
}

const action = args.find(arg => !arg.startsWith('-'))
const mutating = ['add', 'install', 'i', 'update', 'up', 'remove', 'rm', 'uninstall'].includes(action)
const manifest = await readFile('package.json', 'utf8').then(JSON.parse, error => { if (error.code !== 'ENOENT') throw error })
const fixedRoots = Object.entries(manifest?.dependencies ?? {}).some(([id, spec]) => /^(file|link):/u.test(spec) && resolve(spec.slice(5)) === resolve('node_modules', id))
const activeProfile = basename(process.cwd()) === 'web' && manifest?.zerowall?.profileLayout >= 3
if (mutating && (fixedRoots || activeProfile)) {
  const cancellation = new AbortController()
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => cancellation.abort())
  try {
    const outcome = await runProfilePnpmTransaction({ profile: process.cwd(), args, run, signal: cancellation.signal,
      lifecycleId: process.env.ZEROWALL_PROFILE_TRANSACTION_ID,
      ownerPid: process.env.ZEROWALL_PROFILE_TRANSACTION_OWNER ? Number(process.env.ZEROWALL_PROFILE_TRANSACTION_OWNER) : undefined })
    process.exitCode = outcome.code
  } catch (error) { process.stderr.write(`ZeroWall: ${error.message}\n`); process.exitCode = 1 }
} else {
if (mutating) {
  const migrations = join(process.cwd(), '.plugin-manager', 'store-migrations')
  for (const entry of await readdir(migrations).catch(error => { if (error.code !== 'ENOENT') throw error; return [] })) {
    const directory = join(migrations, entry)
    const records = await readFile(join(directory, 'journal.jsonl'), 'utf8').catch(() => '')
    const last = records.trim().split('\n').at(-1)
    const state = last ? JSON.parse(last).state : undefined
    if (!['started', 'relinked'].includes(state)) continue
    const backup = join(directory, 'node_modules.before')
    if (!existsSync(backup)) continue
    const modules = join(process.cwd(), 'node_modules')
    if (existsSync(modules)) await rename(modules, join(directory, 'node_modules.interrupted-' + randomUUID()))
    await rename(backup, modules)
    const snapshotNames = await readFile(join(directory, 'snapshot-files.json'), 'utf8').then(JSON.parse, error => { if (error.code !== 'ENOENT') throw error; return ['package.json', 'pnpm-lock.yaml'] })
    for (const name of snapshotNames) {
      if (!['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'].includes(name)) throw new Error('Invalid profile recovery snapshot')
      const before = await readFile(join(directory, name), 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error })
      if (before === undefined) await rm(name, { force: true })
      else await writeFile(name, before, { mode: 0o600 })
    }
    await appendFile(join(directory, 'journal.jsonl'), JSON.stringify({ state: 'recovered', at: new Date().toISOString() }) + '\n')
  }
}
// Capture declarative state before pnpm gets a chance to rewrite it. A store
// mismatch can be reported after pnpm has already touched package.json or the
// lockfile, so taking this snapshot after the first run would not be a real
// rollback point.
const originalFiles = mutating
  ? await Promise.all(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'].map(async name => ({ name, text: await readFile(name, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return undefined }) })))
  : undefined
if (mutating) {
  const layout = await repairProfileLayout(process.cwd(), { home: process.env.DSH_HOME })
  if (layout.changed) process.stderr.write('ZeroWall: repaired relocated profile links with the bundled pnpm layout.\n')
}
const result = await run(args)
// The official DSH operation already holds package.json's write lock. Only an
// explicit package mutation can relink an older pnpm store; startup/list/view
// never trigger installation. pnpm owns the relink rather than forged metadata.
if (result.code !== 0 && /ERR_PNPM_UNEXPECTED_(?:VIRTUAL_)?STORE/u.test(result.tail) && mutating) {
  const directory = join(process.cwd(), '.plugin-manager', 'store-migrations', randomUUID())
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const files = originalFiles
  for (const file of files) if (file.text !== undefined) await writeFile(join(directory, file.name), file.text, { mode: 0o600 })
  await writeFile(join(directory, 'snapshot-files.json'), JSON.stringify(files.map(file => file.name)), { mode: 0o600 })
  const record = async state => appendFile(join(directory, 'journal.jsonl'), JSON.stringify({ state, at: new Date().toISOString() }) + '\n', { mode: 0o600 })
  const restore = async () => {
    for (const file of files) {
      if (file.text === undefined) await rm(file.name, { force: true })
      else { const temporary = file.name + '.' + randomUUID() + '.tmp'; await writeFile(temporary, file.text, { mode: 0o600 }); await rename(temporary, file.name) }
    }
  }
  await record('started')
  // Relink the last known declarative state before retrying the requested
  // mutation. The failed first attempt may already have changed either file.
  await restore()
  const modules = join(process.cwd(), 'node_modules')
  const backupModules = join(directory, 'node_modules.before')
  let backedUp = false
  if (existsSync(modules)) {
    await rename(modules, backupModules)
    backedUp = true
  }
  let rolledBack = false
  const rollbackModules = async () => {
    if (rolledBack) return
    if (existsSync(modules)) await rename(modules, join(directory, 'node_modules.failed'))
    if (backedUp) await rename(backupModules, modules)
    rolledBack = true
  }
  process.stderr.write('ZeroWall: relinking this profile with the bundled pnpm; existing package versions and plugin selections are retained.\n')
  // pnpm 11's optimistic repeat-install can return success before inspecting
  // .modules.yaml, even with --force. Disable that fast path for this repair
  // so pnpm actually recreates links in the selected store.
  const repairArgs = ['install', '--force', '--config.optimistic-repeat-install=false', ...(existsSync('pnpm-lock.yaml') ? ['--frozen-lockfile'] : [])]
  try {
  const repaired = await run(repairArgs)
  if (repaired.code === 0) {
    await record('relinked')
    const retried = await run(args)
    if (retried.code !== 0) { await restore(); await rollbackModules() }
    await record(retried.code === 0 ? 'completed' : 'retry-failed')
    process.exitCode = retried.code
  } else {
    // Restore exact declarative state; pnpm can leave downloaded packages, and
    // the journal preserves the recovery evidence instead of claiming success.
    await restore()
    await rollbackModules()
    await record('failed-manifests-restored')
    process.stderr.write(`ZeroWall: store migration failed; profile manifest and lockfile restored. Recovery record: ${directory}\n`)
    process.exitCode = repaired.code
  }
  } catch (error) {
    await restore()
    await rollbackModules()
    await record('failed-manifests-restored')
    throw error
  }
} else process.exitCode = result.code
}
