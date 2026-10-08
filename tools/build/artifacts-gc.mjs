import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { contract, root } from './paths.mjs'
import { createCleanupPlan, removeCandidate } from './artifacts-gc-lib.mjs'

const apply = process.argv.includes('--apply')
const requestedDryRun = process.argv.includes('--dry-run')
if (apply && requestedDryRun) throw new Error('Choose either --dry-run or --apply.')
const dryRun = requestedDryRun || !apply
const policy = JSON.parse(await readFile(join(root, 'config/layout/cleanup-policy.json'), 'utf8'))
const lockDirectory = join(contract.cache, 'build-graph', 'locks')
for (const name of await readdir(lockDirectory).catch(() => [])) {
  const owner = await readFile(join(lockDirectory, name, 'owner.json'), 'utf8').then(JSON.parse, () => undefined)
  if (!owner?.pid) continue
  try { process.kill(owner.pid, 0); throw new Error(`Build process ${owner.pid} owns ${name}; artifact GC will not run during a build.`) }
  catch (error) {
    if (error.message.includes('artifact GC') || error.code === 'EPERM') throw new Error(`Build process ${owner.pid} owns ${name}; artifact GC will not run during a build.`)
    if (error.code !== 'ESRCH') throw error
    const modified = await stat(join(lockDirectory, name)).then(value => value.mtimeMs, () => Date.now())
    if (Date.now() - modified < 60_000) throw new Error(`Stale build lock ${name} is too recent; artifact GC will not run.`)
  }
}

const plan = await createCleanupPlan({ root, policy })
if (dryRun) {
  console.log(JSON.stringify({ mode: 'dry-run', ...plan, totalBytes: plan.candidates.reduce((sum, item) => sum + item.bytes, 0) }, null, 2))
  process.exit(0)
}

const receiptPath = join(contract.verification, 'cleanup', `cleanup-${Date.now()}.json`)
const receipt = { schema: 1, applicationVersion: contract.version, mode: 'apply', status: 'in_progress', ...plan, removed: [], skipped: [] }
await mkdir(dirname(receiptPath), { recursive: true })
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' })
for (const candidate of plan.candidates) {
  try {
    await removeCandidate(candidate, candidate)
    receipt.removed.push({ path: candidate.path, bytes: candidate.bytes, sha256: candidate.sha256, reason: candidate.reason })
  } catch (error) {
    receipt.skipped.push({ path: candidate.path, reason: String(error?.message ?? error) })
  }
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
}
receipt.status = receipt.skipped.length ? 'partial' : 'complete'
receipt.finishedAt = new Date().toISOString()
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
console.log(JSON.stringify({ receipt: resolve(receiptPath), status: receipt.status, removed: receipt.removed.length, skipped: receipt.skipped.length }, null, 2))
