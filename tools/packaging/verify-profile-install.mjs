import { mkdtemp, rm, mkdir, readFile, writeFile, readdir, lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { copyProfileTree } from '../commands/profile-copy.mjs'
import { repairProfileLayout } from '../commands/profile-layout.mjs'
import { runProfilePnpmTransaction, beginProfilePackageChange } from '../commands/profile-pnpm-transaction.mjs'

const original = resolve(process.argv[2])
const root = await mkdtemp(join(tmpdir(), 'zws-profile-install-'))
try {
const profile = join(root, 'profiles/web'), addition = join(root, 'probe')
await copyProfileTree(original, profile, { filter: local => !local.startsWith('.plugin-manager') && !local.endsWith('package.json.lock') })
await repairProfileLayout(profile, { from: original })
await mkdir(addition)
await writeFile(join(addition, 'package.json'), JSON.stringify({ name: 'zws-install-verification', version: '1.0.0' }))
const before = JSON.parse(await readFile(join(profile, 'package.json')))
async function fingerprint(directory) {
  const hash = createHash('sha256')
  async function walk(path, prefix = '') {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'node_modules') continue
      const child = join(path, entry.name), local = prefix + entry.name
      if (entry.isDirectory()) await walk(child, local + '/')
      else if (entry.isFile()) { hash.update(local); hash.update(await readFile(child)) }
    }
  }
  await walk(directory)
  return hash.digest('hex')
}
const retained = {}
for (const id of Object.keys(before.dependencies ?? {})) retained[id] = {
  version: JSON.parse(await readFile(join(profile, 'node_modules', id, 'package.json'))).version,
  sha256: await fingerprint(join(profile, 'node_modules', id)),
}
const pnpm = resolve('deepseek-harness/apps/desktop/node_modules/pnpm/bin/pnpm.cjs')
const execute = promisify(execFile)
const run = async (args, cwd) => {
  const output = await execute(process.execPath, [pnpm, ...args], { cwd, windowsHide: true, env: { ...process.env, CI: 'false' }, maxBuffer: 4 * 1024 ** 2 })
  return { code: 0, tail: output.stdout.slice(-2000) }
}
await runProfilePnpmTransaction({ profile, args: ['add', 'file:' + addition, '--offline', '--ignore-scripts'], run })
for (const [id, expected] of Object.entries(retained)) {
  if (JSON.parse(await readFile(join(profile, 'node_modules', id, 'package.json'))).version !== expected.version || await fingerprint(join(profile, 'node_modules', id)) !== expected.sha256) throw new Error('Retained plugin changed: ' + id)
}
const images = join(profile, 'node_modules/@zerowallscience/plugin-images/package.json')
const yaml = createRequire(images)('yaml')
if (yaml.parse('verified: true').verified !== true) throw new Error('Actual image plugin yaml resolution failed')
await runProfilePnpmTransaction({ profile, args: ['remove', 'zws-install-verification'], run })
await lstat(join(profile, 'node_modules/zws-install-verification')).then(() => { throw new Error('Explicit removal failed') }, error => { if (error.code !== 'ENOENT') throw error })
const lifecycle = await beginProfilePackageChange(profile)
await runProfilePnpmTransaction({ profile, args: ['add', 'file:' + addition, '--offline', '--ignore-scripts'], run,
  lifecycleId: lifecycle.env.ZEROWALL_PROFILE_TRANSACTION_ID, ownerPid: process.pid, ownerToken: lifecycle.env.ZEROWALL_PROFILE_TRANSACTION_OWNER_TOKEN })
await lifecycle.finish(false)
await lstat(join(profile, 'node_modules/zws-install-verification')).then(() => { throw new Error('Rollback failed') }, error => { if (error.code !== 'ENOENT') throw error })
const receipt = { passed: true, retained, addedAndRemoved: true, runtimeRollback: true, actualPluginImagesYaml: true }
const report = resolve(process.argv[3])
await mkdir(join(report, '..'), { recursive: true })
await writeFile(report, JSON.stringify(receipt, null, 2))
console.log(JSON.stringify({ passed: true, retainedCount: Object.keys(retained).length, actualPluginImagesYaml: true, report }))

} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 3 })
}
