import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { contract, root } from './paths.mjs'
import { createCleanupPlan, freeArtifactSpace, removeCandidate } from './artifacts-gc-lib.mjs'
import { readStableConfig } from './stable-config.mjs'

const apply = process.argv.includes('--apply')
const requestedDryRun = process.argv.includes('--dry-run')
const pruneIncomplete = process.argv.includes('--prune-incomplete')
const pruneUnpacked = process.argv.includes('--prune-unpacked')
if (apply && requestedDryRun) throw new Error('Choose either --dry-run or --apply.')
const dryRun = requestedDryRun || !apply
const policy = JSON.parse(await readFile(join(root, 'config/layout/cleanup-policy.json'), 'utf8'))
const { retention } = await readStableConfig(root)
Object.assign(policy.defaults, retention)
policy.version = contract.version
const planArg = process.argv.indexOf('--plan')
const outputArg = process.argv.indexOf('--output')
const plan = planArg >= 0 ? JSON.parse(await readFile(resolve(process.argv[planArg + 1]), 'utf8')) : await createCleanupPlan({ root, policy, pruneIncomplete, pruneUnpacked,
  onCandidate: item => console.error(`Checking ${item.reason}: ${item.path}`),
})
for (const candidate of plan.candidates) if (resolve(candidate.repositoryRoot ?? '') !== root) throw new Error('Cleanup plan belongs to a different repository')
if (dryRun) {
  if (outputArg >= 0) await writeFile(resolve(process.argv[outputArg + 1]), JSON.stringify(plan, null, 2) + '\n')
  console.log(JSON.stringify({ mode: 'dry-run', ...plan, totalBytes: plan.candidates.reduce((sum, item) => sum + item.bytes, 0) }, null, 2))
  process.exit(0)
}

const receiptPath = join(contract.verification, 'cleanup', `cleanup-${Date.now()}.json`)
const receipt = { schema: 2, applicationVersion: contract.version, mode: 'apply', status: 'in_progress', ...plan, freeBytesBefore: await freeArtifactSpace(root), removed: [], skipped: plan.exclusions.filter(item => item.reason === 'unreadable-directory') }
await mkdir(dirname(receiptPath), { recursive: true })
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' })
for (const candidate of plan.candidates) {
  console.error(`Removing ${candidate.reason}: ${candidate.path}`)
  try {
    const evidence = await removeCandidate(candidate, candidate)
    receipt.removed.push({ path: candidate.path, files: candidate.files, bytes: candidate.bytes, uniqueBytes: candidate.uniqueBytes, sha256: candidate.sha256, reason: candidate.reason, ...(evidence ? { evidence } : {}) })
  } catch (error) {
    receipt.skipped.push({ path: candidate.path, reason: String(error?.message ?? error) })
  }
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
}
receipt.status = receipt.skipped.length ? 'partial' : 'complete'
receipt.finishedAt = new Date().toISOString()
receipt.freeBytesAfter = await freeArtifactSpace(root)
receipt.freeBytesDelta = receipt.freeBytesAfter - receipt.freeBytesBefore
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
console.log(JSON.stringify({ receipt: resolve(receiptPath), status: receipt.status, removed: receipt.removed.length, skipped: receipt.skipped.length, space: receipt.space, freeBytesDelta: receipt.freeBytesDelta }, null, 2))
if (receipt.skipped.length) process.exitCode = 1
