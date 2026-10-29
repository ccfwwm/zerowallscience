import { cp, mkdir, readFile, writeFile, lstat, rename, readdir, unlink, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { copyProfileTree } from './profile-copy.mjs'
import { repairProfileLayout } from './profile-layout.mjs'
import { physicalizeProfilePlugins } from './profile-materialization.mjs'
import { preparePnpmResolution, mergePnpmResolution } from './profile-pnpm-resolution.mjs'
import { acquireProfileMutation } from './profile-mutation-lock.mjs'
import { commitPackagePaths, restorePackagePaths } from './profile-package-commit.mjs'

const exists = path => lstat(path).then(() => true, error => { if (error.code !== 'ENOENT') throw error; return false })
const read = path => readFile(path, 'utf8').then(JSON.parse)
const inside = (root, path) => { const child = relative(root, path); return !isAbsolute(child) && child !== '..' && !child.startsWith('..' + sep) }
const declarativeNames = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'cordis.patch.yml', 'compatibility.json']
const transactionId = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u
const candidateName = /^zerowall-pnpm-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u
const directFiles = [...declarativeNames, '.zerowall/resolution-targets.json']
async function record(directory, state) {
  const temporary = join(directory, 'journal.tmp')
  await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 })
  await rename(temporary, join(directory, 'journal.json'))
}

async function snapshotFiles(profile) {
  return Promise.all(directFiles.map(async name => ({ name,
    content: await readFile(join(profile, name)).then(bytes => bytes.toString('base64'), error => {
      if (error.code !== 'ENOENT') throw error
      return null
    }),
  })))
}

async function restoreFiles(profile, files = []) {
  for (const { name, content } of files) {
    if (!directFiles.includes(name)) throw new Error('Invalid plugin transaction recovery file')
    const path = join(profile, name)
    if (content === null) await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error })
    else {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, Buffer.from(content, 'base64'), { mode: 0o600 })
    }
  }
}

/** Reserve a DSH-style transaction before the active profile manifest is
 * changed. The caller owns the profile mutation lease; no profile copy is
 * created. */
export async function beginDirectProfilePackageChange(profile, owner = {}) {
  profile = resolve(profile)
  if (profile.split(/[\\/]/u).at(-1) !== 'web') throw new Error('PLUGIN_PROFILE_INVALID')
  await recoverPnpmTransactions(profile)
  const directory = join(profile, '.plugin-manager', 'package-transactions', randomUUID())
  const candidate = join(dirname(profile), 'zerowall-pnpm-' + randomUUID())
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const state = { state: 'preparing', schema: 2, direct: true, pid: owner.ownerPid ?? process.pid, ownerToken: owner.ownerToken, candidate, created: Date.now(), items: [], files: await snapshotFiles(profile) }
  await record(directory, state)
  const id = directory.split(/[\\/]/u).at(-1)
  return { id, directory, candidate, state,
    async restore() {
      const current = await read(join(directory, 'journal.json'))
      if (current.state === 'committing' || current.state === 'awaiting-validation') await restorePackagePaths(profile, directory, current)
      await restoreFiles(profile, current.files)
      await record(directory, { ...current, state: 'rolled-back' })
    },
    async finish(accepted) {
      const current = await read(join(directory, 'journal.json'))
      if (!accepted && (current.state === 'committing' || current.state === 'awaiting-validation')) await restorePackagePaths(profile, directory, current)
      if (!accepted) await restoreFiles(profile, current.files)
      await record(directory, { ...current, state: accepted ? 'complete' : 'rolled-back' })
      await cleanupTransaction(profile, directory, current, accepted ? 'complete' : 'rolled-back')
    },
  }
}

/** Restore an interrupted publication before another explicit pnpm mutation. */
export async function recoverPnpmTransactions(profile, { lifecycleId } = {}) {
  const history = join(profile, '.plugin-manager', 'package-transactions')
  const entries = await readdir(history).catch(error => { if (error.code !== 'ENOENT') throw error; return [] })
  const records = await Promise.all(entries.filter(id => transactionId.test(id)).map(async id => {
    const directory = join(history, id)
    return { directory, state: await read(join(directory, 'journal.json')) }
  }))
  // A single CLI operation can invoke pnpm more than once. Unwind the newest
  // tree first, exactly as the caller's runtime-validation rollback does.
  for (const { directory, state } of records.sort((a, b) => b.state.created - a.state.created)) {
    if (['complete', 'rolled-back', 'preparation-failed'].includes(state.state)) {
      await cleanupTransaction(profile, directory, state, state.state)
      continue
    }
    if (state.state === 'preparing') {
      const candidate = typeof state.candidate === 'string' ? resolve(state.candidate) : undefined
      const candidateValid = candidate !== undefined && dirname(candidate) === dirname(resolve(profile)) && candidateName.test(candidate.split(/[\\/]/u).at(-1))
      let ownerActive = false
      if (state.schema >= 2 && candidateValid && state.ownerToken && Number.isSafeInteger(state.pid) && state.pid > 0) {
        const lock = await read(join(dirname(resolve(profile)), '.zerowall-plugin-mutation.lock')).catch(error => {
          if (error.code !== 'ENOENT') throw error
          return undefined
        })
        if (lock?.pid === state.pid && lock.token === state.ownerToken) {
          try { process.kill(state.pid, 0); ownerActive = true } catch (error) { if (error.code !== 'ESRCH') throw error }
        }
      } else if (state.schema === undefined || !state.ownerToken) {
        // Journals written before tokenized ownership retain their historical
        // PID-only behavior for compatibility with older desktop builds.
        try { process.kill(state.pid, 0); ownerActive = true } catch (error) { if (error.code !== 'ESRCH') throw error }
      }
      if (ownerActive) throw new Error('Another profile package transaction is still running')
      if (!candidateValid) {
        await record(directory, { ...state, state: 'preparation-failed', error: 'Invalid transaction candidate path' })
        continue
      }
      if (state.direct) await restoreFiles(profile, state.files)
      await record(directory, { ...state, state: 'preparation-failed' })
      await cleanupTransaction(profile, directory, state, 'preparation-failed')
      continue
    }
    if (!['committing', 'awaiting-validation'].includes(state.state)) continue
    if (state.state === 'awaiting-validation' && lifecycleId && state.lifecycleId === lifecycleId) continue
    if (state.state === 'awaiting-validation' && transactionId.test(state.lifecycleId ?? '')) {
      const parent = await read(join(profile, '.plugin-manager', 'lifecycle-transactions', state.lifecycleId, 'journal.json'))
      if (parent.state === 'complete') {
        await record(directory, { ...state, state: 'complete' })
        await cleanupTransaction(profile, directory, state, 'complete')
        continue
      }
    }
    try { process.kill(state.pid, 0); throw new Error('Another profile package transaction is still running') }
    catch (error) { if (error.code !== 'ESRCH') throw error }
    await restore(profile, directory, state)
    if (state.direct) await restoreFiles(profile, state.files)
    await cleanupTransaction(profile, directory, state, 'rolled-back')
  }
  const lifecycles = join(profile, '.plugin-manager', 'lifecycle-transactions')
  for (const id of await readdir(lifecycles).catch(error => { if (error.code !== 'ENOENT') throw error; return [] })) {
    if (id === lifecycleId || !transactionId.test(id)) continue
    const file = join(lifecycles, id, 'journal.json'), state = await read(file)
    if (state.state !== 'pending') continue
    try { process.kill(state.pid, 0); throw new Error('Another profile package lifecycle is still running') }
    catch (error) { if (error.code !== 'ESRCH') throw error }
    for (const { name, content } of state.files) {
      if (!declarativeNames.includes(name)) throw new Error('Invalid plugin lifecycle recovery file')
      if (content === null) await unlink(join(profile, name)).catch(error => { if (error.code !== 'ENOENT') throw error })
      else await writeFile(join(profile, name), Buffer.from(content, 'base64'), { mode: 0o600 })
    }
    await writeFile(file, JSON.stringify({ state: 'rolled-back', pid: process.pid }), { mode: 0o600 })
  }
}

/** The DSH caller owns acceptance through compatibility, selection and HMR. */
export async function beginProfilePackageChange(profile, { resourceCandidateId = process.env.ZEROWALL_RESOURCE_CANDIDATE_ID } = {}) {
  profile = resolve(profile)
  // Desktop owns acceptance and rollback for this operation. Its nested DSH
  // command must authenticate that ownership before reusing the transaction;
  // taking the active-profile lease again would deadlock against its parent.
  if (resourceCandidateId) {
    await authenticateResourceCandidate(profile, resourceCandidateId)
    return undefined
  }
  if (dirname(profile) === profile || profile.split(/[\\/]/u).at(-1) !== 'web') return undefined
  const release = await acquireProfileMutation(profile)
  try {
    await recoverPnpmTransactions(profile)
    const directory = join(profile, '.plugin-manager', 'lifecycle-transactions', randomUUID())
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const files = await Promise.all(declarativeNames.map(async name => ({ name,
      content: await readFile(join(profile, name)).then(bytes => bytes.toString('base64'), error => { if (error.code !== 'ENOENT') throw error; return null }),
    })))
    const id = directory.split(/[\\/]/u).at(-1)
    await record(directory, { pid: process.pid, state: 'pending', files })
    let finished = false
    return {
      env: { ZEROWALL_PROFILE_TRANSACTION_ID: id, ZEROWALL_PROFILE_TRANSACTION_OWNER: String(process.pid), ZEROWALL_PROFILE_TRANSACTION_OWNER_TOKEN: String(release.ownerToken ?? '') },
      async finish(accepted) {
        if (finished) throw new Error('Plugin lifecycle transaction already settled')
        const history = join(profile, '.plugin-manager', 'package-transactions')
        const records = []
        for (const entry of await readdir(history).catch(error => { if (error.code !== 'ENOENT') throw error; return [] })) {
          const local = join(history, entry), state = await read(join(local, 'journal.json'))
          if (state.lifecycleId === id && state.state === 'awaiting-validation') records.push({ local, state })
        }
        records.sort((a, b) => b.state.created - a.state.created)
        try {
          // This single durable decision is the commit point for all nested
          // pnpm runs. Recovery must never roll back half an accepted action.
          if (accepted) {
            await record(directory, { pid: process.pid, state: 'complete' })
            finished = true
            let cleanupPending = false
            for (const { local, state } of records) {
              try {
                await record(local, { ...state, state: 'complete', cleanupPending: true })
                await cleanupTransaction(profile, local, { ...state, cleanupPending: true }, 'complete')
              } catch (error) {
                // The parent decision remains authoritative if a receipt cannot
                // be written. The next explicit mutation retries child cleanup.
                cleanupPending = true
              }
            }
            return { cleanupPending }
          }
          for (const { local, state } of records) {
            await restore(profile, local, state)
          }
          if (!accepted) for (const { name, content } of files) {
            if (content === null) await unlink(join(profile, name)).catch(error => { if (error.code !== 'ENOENT') throw error })
            else await writeFile(join(profile, name), Buffer.from(content, 'base64'), { mode: 0o600 })
          }
          if (!accepted) await record(directory, { pid: process.pid, state: 'rolled-back' })
          // Successful CLI work needs no retained duplicate tree. Resource
          // updates keep their independent signed per-plugin rollback history.
          finished = true
          for (const { local, state } of records) await cleanupTransaction(profile, local, state, accepted ? 'complete' : 'rolled-back')
        } finally { await release() }
      },
    }
  } catch (error) { await release(); throw error }
}

async function restore(profile, directory, state) {
  if (state.schema === 2) return restorePackagePaths(profile, directory, state)
  const failed = join(directory, 'failed'), backup = join(directory, 'before')
  await mkdir(failed, { recursive: true })
  for (const item of [...state.items].reverse()) {
    if (await exists(join(backup, item.name))) {
      if (await exists(join(profile, item.name))) await rename(join(profile, item.name), join(failed, item.name))
      await rename(join(backup, item.name), join(profile, item.name))
    } else if (!item.existed && await exists(join(profile, item.name))) {
      await rename(join(profile, item.name), join(failed, item.name))
    }
  }
  await repairProfileLayout(profile, { from: profile })
  await record(directory, { ...state, state: 'rolled-back' })
}

/** Isolate pnpm from fixed plugin roots. Only publish a complete dependency tree;
 * failures and cancellation leave the running profile's bytes untouched. */
export async function runProfilePnpmTransaction(options) {
  if (options.resourceCandidateId) return runResourceCandidate(options)
  const { profile, lifecycleId } = options
  if (lifecycleId) {
    if (!transactionId.test(lifecycleId) || !Number.isSafeInteger(options.ownerPid) || options.ownerPid <= 0) throw new Error('PLUGIN_LIFECYCLE_INVALID')
    const parent = await read(join(resolve(profile), '.plugin-manager', 'lifecycle-transactions', lifecycleId, 'journal.json'))
    const lease = await read(join(dirname(resolve(profile)), '.zerowall-plugin-mutation.lock'))
    if (parent.state !== 'pending' || parent.pid !== options.ownerPid || lease.pid !== parent.pid || options.ownerToken && lease.token !== options.ownerToken) throw new Error('PLUGIN_LIFECYCLE_INVALID')
  }
  // A resource candidate is already protected by the desktop's active-profile
  // lease. Give its nested CLI a separate lease rather than deadlocking it.
  const lockProfile = resolve(profile).split(/[\\/]/u).at(-1) === 'web' ? resolve(profile) : join(resolve(profile), '.plugin-manager', 'candidate')
  const release = lifecycleId ? undefined : await acquireProfileMutation(lockProfile)
  try { return await runCandidate({ ...options, ownerToken: options.ownerToken ?? release?.ownerToken }) } finally { await release?.() }
}

/** The desktop already owns an isolated candidate and its activation journal.
 * Authenticate the lease, then resolve directly there without copying it again. */
async function authenticateResourceCandidate(profile, resourceCandidateId) {
  if (!transactionId.test(resourceCandidateId) || !['zerowall', 'web'].includes(profile.split(/[\\/]/u).at(-1))) throw new Error('RESOURCE_CANDIDATE_INVALID')
  const receipt = await read(join(profile, '.zerowall/resource-transaction.json'))
  const lease = await read(join(dirname(profile), '.zerowall-plugin-mutation.lock'))
  if (receipt.id !== resourceCandidateId || receipt.profile !== join(dirname(profile), 'web') || receipt.pid !== lease.pid || !Number.isSafeInteger(lease.pid) || lease.pid <= 0 || typeof lease.token !== 'string' || !lease.token || receipt.token !== lease.token) throw new Error('RESOURCE_CANDIDATE_INVALID')
  process.kill(lease.pid, 0)
  if (profile.split(/[\\/]/u).at(-1) === 'web') {
    if (!receipt.direct || !transactionId.test(receipt.transactionId ?? '')) throw new Error('RESOURCE_CANDIDATE_INVALID')
    const state = await read(join(profile, '.plugin-manager/package-transactions', receipt.transactionId, 'journal.json'))
    if (!state.direct || state.state !== 'preparing' || state.pid !== lease.pid) throw new Error('RESOURCE_CANDIDATE_INVALID')
  }
  return receipt
}

async function runResourceCandidate({ profile, args, run, signal, resourceCandidateId, report }) {
  profile = resolve(profile)
  const receipt = await authenticateResourceCandidate(profile, resourceCandidateId)
  if (args.some(arg => /^(?:--(?:dir|prefix|workspace-dir|global-dir)|-C|-g|--global|--workspace-root|-w)(?:=|$)/u.test(arg))) throw new Error('PLUGIN_CWD_OVERRIDE_DENIED')
  signal?.throwIfAborted()
  if (profile.split(/[\\/]/u).at(-1) === 'web') return runDirectProfile({ profile, args, run, signal, report, transactionId: receipt.transactionId })
  const manifest = await read(join(profile, 'package.json'))
  const resolution = await preparePnpmResolution({ profile, manifest, args, signal, report })
  const result = await run(resolution.args, resolution.directory)
  signal?.throwIfAborted()
  if (result.code !== 0) return result
  await mergePnpmResolution(resolution)
  await physicalizeProfilePlugins({ profile, ids: [...resolution.targets].filter(id => !resolution.removed.has(id)) })
  const layout = await repairProfileLayout(profile, { from: profile, diagnoseMissingTargets: true })
  if (layout.needsRelink) throw new Error('PLUGIN_CANDIDATE_LAYOUT_INVALID')
  return result
}

/** Resolve pnpm in a short-lived sibling tree and publish only the selected
 * package roots into the active profile. This is the resource-manager path for
 * modern profiles; it never copies unrelated user files. */
async function runDirectProfile({ profile, args, run, signal, report, transactionId: id }) {
  if (!transactionId.test(id)) throw new Error('PLUGIN_TRANSACTION_INVALID')
  const directory = join(profile, '.plugin-manager', 'package-transactions', id)
  const state = await read(join(directory, 'journal.json'))
  if (!state.direct || state.state !== 'preparing') throw new Error('PLUGIN_TRANSACTION_INVALID')
  // Keep the PID that reserved the transaction in the desktop process. This
  // executor is short-lived; recording its PID would make startup recovery
  // treat a still-unvalidated Host activation as abandoned as soon as pnpm
  // exits, and roll back a successfully installed plugin after a restart.
  await record(directory, state)
  const candidate = resolve(state.candidate)
  if (dirname(candidate) !== dirname(profile) || !candidateName.test(candidate.split(/[\\/]/u).at(-1))) throw new Error('Invalid direct package candidate')
  await mkdir(candidate, { recursive: true })
  try {
    const manifest = await read(join(profile, 'package.json'))
    const resolution = await preparePnpmResolution({ profile, manifest, args, signal, report, resolutionDirectory: candidate })
    const result = await run(resolution.args, resolution.directory)
    const outcome = result ?? { code: 0 }
    signal?.throwIfAborted()
    if (outcome.code !== 0) {
      await restoreFiles(profile, state.files)
      await record(directory, { ...state, state: 'preparation-failed' })
      await cleanupTransaction(profile, directory, state, 'preparation-failed')
      return { ...outcome, code: outcome.code || 1 }
    }
    await mergePnpmResolution(resolution, { publish: false })
    await physicalizeProfilePlugins({ profile: candidate, ids: [...resolution.targets].filter(id => !resolution.removed.has(id)) })
    for (const name of ['cordis.patch.yml', 'compatibility.json']) {
      if (await exists(join(profile, name))) await cp(join(profile, name), join(candidate, name))
    }
    // The marker is declarative state and must travel with the package commit;
    // it is not a profile snapshot.
    const marker = join(profile, '.zerowall/materialized-profile.json')
    if (await exists(marker)) {
      await mkdir(dirname(join(candidate, '.zerowall/materialized-profile.json')), { recursive: true })
      await writeFile(join(candidate, '.zerowall/materialized-profile.json'), await readFile(marker))
    }
    const layout = await repairProfileLayout(candidate, { from: profile, diagnoseMissingTargets: true })
    if (layout.needsRelink) throw new Error('PLUGIN_CANDIDATE_LAYOUT_INVALID')
    // Include removed targets so the publication journal also removes their
    // old active roots. Newly materialized roots are physicalized above.
    const ids = [...resolution.targets]
    state.state = 'preparing'
    await commitPackagePaths({ profile, candidate, directory, state, ids, includeDependencyRoot: true })
    await record(directory, { ...state, state: 'awaiting-validation' })
    return outcome
  } catch (error) {
    const current = await read(join(directory, 'journal.json')).catch(() => state)
    if (current.state !== 'committing' && current.state !== 'awaiting-validation') {
      await restoreFiles(profile, state.files).catch(() => {})
      await record(directory, { ...current, state: 'preparation-failed', error: error.message }).catch(() => {})
      await cleanupTransaction(profile, directory, current, 'preparation-failed').catch(() => {})
    }
    throw error
  }
}

async function runCandidate({ profile, args, run, signal, lifecycleId, ownerPid, ownerToken }) {
  profile = resolve(profile)
  if (args.some(arg => /^(?:--(?:dir|prefix|workspace-dir|global-dir)|-C|-g|--global|--workspace-root|-w)(?:=|$)/u.test(arg))) throw new Error('PLUGIN_CWD_OVERRIDE_DENIED')
  await recoverPnpmTransactions(profile, { lifecycleId })
  const before = await read(join(profile, 'package.json'))
  const directory = join(profile, '.plugin-manager', 'package-transactions', randomUUID())
  // The candidate must be outside the source; the live lock and operation logs
  // remain at their stable paths while DSH performs compatibility checks/HMR.
  const candidate = join(dirname(profile), 'zerowall-pnpm-' + randomUUID())
  await mkdir(directory, { recursive: true })
  const state = { state: 'preparing', schema: 2, pid: ownerPid ?? process.pid, ownerToken, candidate, created: Date.now(), lifecycleId, items: [] }
  await record(directory, state)
  try {
    await copyProfileTree(profile, candidate, { filter: local => !/^\.plugin-manager(?:\/|$)|(?:^|\/)package\.json\.lock(?:\/|$)/u.test(local) })
    const layout = await repairProfileLayout(candidate, { from: profile, diagnoseMissingTargets: true })
    if (layout.needsRelink) throw new Error('PROFILE_LAYOUT_RELINK_REQUIRED: repair plugins with the bundled package manager')
    const manifest = await read(join(candidate, 'package.json'))
    const ids = []
    for (const [id, spec] of Object.entries(manifest.dependencies ?? {})) {
      if (!/^(?:file|link):/u.test(spec) || !inside(candidate, resolve(candidate, spec.slice(5)))) continue
      const installed = await read(join(candidate, 'node_modules', id, 'package.json')).catch(error => { if (!['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) throw error })
      if (installed?.name === id) ids.push(id)
    }
    await physicalizeProfilePlugins({ profile: candidate, ids })
    const resolution = await preparePnpmResolution({ profile: candidate, manifest, args })
    const result = await run(resolution.args, resolution.directory)
    if (result.code !== 0 || signal?.aborted) {
      await record(directory, { ...state, state: 'preparation-failed' })
      await cleanupTransaction(profile, directory, state, 'preparation-failed')
      return { ...result, code: result.code || 1 }
    }
    await mergePnpmResolution(resolution)
    await physicalizeProfilePlugins({ profile: candidate, ids: [...resolution.targets].filter(id => !resolution.removed.has(id)) })
    const after = await read(join(candidate, 'package.json'))
    for (const id of Object.keys(after.dependencies ?? {})) {
      if (resolution.damaged.has(id)) continue
      const installed = await read(join(candidate, 'node_modules', id, 'package.json'))
      if (installed.name !== id) throw new Error('PLUGIN_CANDIDATE_IDENTITY_MISMATCH: ' + id)
    }
    if (!['update', 'up'].includes(args[0])) for (const [id, spec] of Object.entries(before.dependencies ?? {})) {
      if (resolution.targets.has(id)) continue
      if (resolution.damaged.has(id)) continue
      if (after.dependencies?.[id] !== manifest.dependencies?.[id]) continue
      const previous = await read(join(profile, 'node_modules', id, 'package.json'))
      const next = await read(join(candidate, 'node_modules', id, 'package.json'))
      if (previous.version !== next.version) throw new Error('PLUGIN_UNRELATED_VERSION_CHANGED: ' + id)
    }
    const finalLayout = await repairProfileLayout(candidate, { from: candidate, diagnoseMissingTargets: true })
    if (finalLayout.needsRelink) throw new Error('PLUGIN_CANDIDATE_LAYOUT_INVALID')
    state.diagnostics = { damagedPlugins: [...resolution.damaged.keys()], brokenTargets: finalLayout.brokenTargets ?? [] }
    if (signal?.aborted) throw new Error('PLUGIN_INSTALL_CANCELLED')
    try {
      await commitPackagePaths({ profile, candidate, directory, state, ids: [...resolution.targets] })
      // Keep rollback bytes at the original link locations until a rollback is
      // requested; no reader follows this archived tree during normal loading.
      await record(directory, { ...state, state: lifecycleId ? 'awaiting-validation' : 'complete' })
    } catch (error) { if (state.state === 'committing') await restore(profile, directory, state); throw error }
    if (!lifecycleId) {
      await cleanupTransaction(profile, directory, state, 'complete')
    }
    return result
  } catch (error) {
    if (state.state !== 'committing') {
      const terminal = state.state === 'rolled-back' ? 'rolled-back' : 'preparation-failed'
      await record(directory, { ...state, state: terminal, error: error.message })
      await cleanupTransaction(profile, directory, state, terminal)
    }
    throw error
  }
}

async function cleanupTransaction(profile, directory, state, terminal) {
  // Cleanup is independent of acceptance: a locked obsolete file must not turn
  // a successful activation into an apparent install failure. Keep its receipt
  // for a later explicit mutation/GC, never remove rollback evidence on error.
  try {
    if (dirname(state.candidate) !== dirname(profile) || !/^zerowall-pnpm-[a-f0-9-]{36}$/u.test(state.candidate.split(/[\\/]/u).at(-1))) throw new Error('Invalid candidate cleanup path')
    if (terminal === 'complete') await rm(join(directory, 'before'), { recursive: true, force: true })
    if (terminal === 'rolled-back') await rm(join(directory, 'failed'), { recursive: true, force: true })
    await rm(state.candidate, { recursive: true, force: true })
    if (state.cleanupPending) {
      const { cleanupPending, cleanupError, ...cleaned } = state
      await record(directory, { ...cleaned, state: terminal })
    }
  } catch (error) {
    await record(directory, { ...state, state: terminal, cleanupPending: true, cleanupError: error.message })
  }
}
