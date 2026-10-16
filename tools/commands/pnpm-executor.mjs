import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const [pnpm, ...args] = process.argv.slice(2)
if (!pnpm) throw new Error('Missing installation-owned pnpm')
const executable = process.env.ZEROWALL_PNPM_NODE || process.execPath
async function run(arguments_) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, ['--expose-internals', pnpm, ...arguments_], { cwd: process.cwd(), env: process.env, windowsHide: true, stdio: ['inherit', 'pipe', 'pipe'] })
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
// Capture declarative state before pnpm gets a chance to rewrite it. A store
// mismatch can be reported after pnpm has already touched package.json or the
// lockfile, so taking this snapshot after the first run would not be a real
// rollback point.
const originalFiles = mutating
  ? await Promise.all(['package.json', 'pnpm-lock.yaml'].map(async name => ({ name, text: await readFile(name, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return undefined }) })))
  : undefined
const result = await run(args)
// The official DSH operation already holds package.json's write lock. Only an
// explicit package mutation can relink an older pnpm store; startup/list/view
// never trigger installation. pnpm owns the relink rather than forged metadata.
if (result.code !== 0 && /ERR_PNPM_UNEXPECTED_STORE/u.test(result.tail) && mutating) {
  const directory = join(process.cwd(), '.plugin-manager', 'store-migrations', randomUUID())
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const files = originalFiles
  for (const file of files) if (file.text !== undefined) await writeFile(join(directory, file.name), file.text, { mode: 0o600 })
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
  process.stderr.write('ZeroWall: relinking this profile with the bundled pnpm; existing package versions and plugin selections are retained.\n')
  // pnpm 11's optimistic repeat-install can return success before inspecting
  // .modules.yaml, even with --force. Disable that fast path for this repair
  // so pnpm actually recreates links in the selected store.
  const repairArgs = ['install', '--force', '--config.optimistic-repeat-install=false', ...(existsSync('pnpm-lock.yaml') ? ['--frozen-lockfile'] : [])]
  const repaired = await run(repairArgs)
  if (repaired.code === 0) {
    await record('relinked')
    const retried = await run(args)
    if (retried.code !== 0) await restore()
    await record(retried.code === 0 ? 'completed' : 'retry-failed')
    process.exitCode = retried.code
  } else {
    // Restore exact declarative state; pnpm can leave downloaded packages, and
    // the journal preserves the recovery evidence instead of claiming success.
    await restore()
    await record('failed-manifests-restored')
    process.stderr.write(`ZeroWall: store migration failed; profile manifest and lockfile restored. Recovery record: ${directory}\n`)
    process.exitCode = repaired.code
  }
} else process.exitCode = result.code
