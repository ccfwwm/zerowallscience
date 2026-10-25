import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

const execute = promisify(execFile)

/** Run the actual packaged command graph outside every workspace node_modules.
 * The isolated copy contains only distributed resources, never source imports. */
export async function verifyCommandRuntime({ resourcesRoot, executablePath, report }) {
  const isolated = await mkdtemp(join(tmpdir(), 'zws-packaged-commands-'))
  try {
    const resources = join(isolated, 'resources')
    await mkdir(resources)
    await cp(join(resourcesRoot, 'commands'), join(resources, 'commands'), { recursive: true })
    await copyFile(join(resourcesRoot, 'app.asar'), join(resources, 'app.asar'))
    await mkdir(join(resources, 'app.asar.unpacked'))
    await copyFile(join(resourcesRoot, 'app.asar.unpacked/package.json'), join(resources, 'app.asar.unpacked/package.json'))
    const script = join(isolated, 'probe.mjs')
    await writeFile(script, probe)
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', CI: 'false' }
    for (const key of ['NODE_PATH', 'NODE_OPTIONS', 'DSH_HOME', 'ZEROWALL_RUNTIME_ANCHOR', 'ZEROWALL_PROFILE_ANCHOR', 'ZEROWALL_DEPENDENCIES_ANCHOR', 'ZEROWALL_PROFILE_TRANSACTION_ID', 'ZEROWALL_PROFILE_TRANSACTION_OWNER', 'ZEROWALL_PROFILE_TRANSACTION_OWNER_TOKEN']) delete env[key]
    const output = await execute(executablePath, [script], { cwd: isolated, env, windowsHide: true, timeout: 120_000, maxBuffer: 4 * 1024 ** 2 })
    const result = JSON.parse(output.stdout.trim())
    assert.equal(result.passed, true)
    const receipt = { ...result, packagedResources: resourcesRoot, executablePath }
    if (report) {
      await mkdir(dirname(report), { recursive: true })
      await writeFile(report, JSON.stringify(receipt, null, 2) + '\n')
    }
    return receipt
  } finally {
    await rm(isolated, { recursive: true, force: true, maxRetries: 3 })
  }
}

const probe = String.raw`
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, readlink, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { packageRuntime } from './resources/commands/package-runtime.mjs'
import { parse, stringify } from './resources/commands/command-yaml.mjs'
const execute = promisify(execFile)
const root = import.meta.dirname, profile = join(root, 'profiles/web')
const retained = join(profile, 'node_modules/retained')
const leaf = join(profile, 'node_modules/.zerowall-dependencies/node_modules/leaf')
const addition = join(root, 'addition')
for (const directory of [retained, leaf, addition, join(retained, 'node_modules')]) await mkdir(directory, { recursive: true })
await writeFile(join(profile, 'package.json'), JSON.stringify({ dependencies: { retained: 'file:./node_modules/retained' }, zerowall: { profileLayout: 3 }, selections: { disabled: ['retained'], pinned: { retained: '1.0.0' }, model: 'preserved' } }))
await writeFile(join(profile, 'pnpm-workspace.yaml'), 'autoInstallPeers: false\nlinkWorkspacePackages: false\noverrides:\n  retained: file:./node_modules/retained\n')
await writeFile(join(retained, 'package.json'), JSON.stringify({ name: 'retained', version: '1.0.0', main: 'index.cjs', dependencies: { leaf: '1.0.0' } }))
await writeFile(join(retained, 'index.cjs'), "module.exports = require('leaf')")
await writeFile(join(leaf, 'package.json'), JSON.stringify({ name: 'leaf', version: '1.0.0', main: 'index.cjs' }))
await writeFile(join(leaf, 'index.cjs'), 'module.exports = { preserved: true }')
await symlink(leaf, join(retained, 'node_modules/leaf'), process.platform === 'win32' ? 'junction' : 'dir')
await writeFile(join(addition, 'package.json'), JSON.stringify({ name: 'zws-command-probe', version: '1.0.0' }))
assert.equal(parse(stringify({ runtime: { verified: true } })).runtime.verified, true)
const runtime = packageRuntime()
const run = async (args, env = {}) => execute(runtime.command, [...runtime.args, ...args], { cwd: profile, windowsHide: true, env: { ...process.env, ...runtime.env, ...env }, timeout: 30_000, maxBuffer: 2 * 1024 ** 2 })
async function fingerprint(directory) {
  const entries = []
  async function visit(path, prefix = '') {
    for (const name of (await readdir(path)).sort()) {
      const child = join(path, name), local = prefix + name, info = await lstat(child)
      if (info.isSymbolicLink()) entries.push([local, await readlink(child)])
      else if (info.isDirectory()) await visit(child, local + '/')
      else entries.push([local, createHash('sha256').update(await readFile(child)).digest('hex')])
    }
  }
  await visit(directory)
  return entries
}
const original = await readFile(join(profile, 'package.json'), 'utf8')
const before = await fingerprint(profile), requests = []
const server = createServer((request, response) => {
  requests.push(request.url)
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify({ name: 'dsh-ops', 'dist-tags': { latest: '0.3.0' }, versions: { '0.3.0': { name: 'dsh-ops', version: '0.3.0', description: 'packaged metadata probe', dsh: { bundle: { patch: 'cordis.patch.yml' } } } } }))
})
await new Promise(accept => server.listen(0, '127.0.0.1', accept))
try {
  const result = await run(['view', 'dsh-ops', 'name', 'version', 'description', 'dsh', '--json', '--registry=http://127.0.0.1:' + server.address().port])
  const metadata = JSON.parse(result.stdout)
  assert.equal(metadata.name, 'dsh-ops')
  assert.equal(metadata.version, '0.3.0')
  assert.ok(requests.length > 0)
} finally { await new Promise(accept => server.close(accept)) }
assert.deepEqual(await fingerprint(profile), before, 'metadata query must remain read-only')
const retainedBefore = await fingerprint(retained)
await run(['add', 'link:' + addition, '--offline', '--ignore-scripts'])
assert.deepEqual(await fingerprint(retained), retainedBefore)
assert.equal(createRequire(join(retained, 'package.json'))('./index.cjs').preserved, true)
assert.equal(JSON.parse(await readFile(join(profile, 'node_modules/zws-command-probe/package.json'))).version, '1.0.0')
await run(['remove', 'zws-command-probe'])
await assert.rejects(lstat(join(profile, 'node_modules/zws-command-probe')), { code: 'ENOENT' })
const afterRemoval = await readFile(join(profile, 'package.json'), 'utf8')
await assert.rejects(run(['add', 'file:' + join(root, 'missing-package.tgz'), '--offline', '--ignore-scripts']))
assert.equal(await readFile(join(profile, 'package.json'), 'utf8'), afterRemoval)
const lifecycle = await runtime.beginTransaction(profile)
await run(['add', 'link:' + addition, '--offline', '--ignore-scripts'], lifecycle.env)
await lifecycle.finish(false)
await assert.rejects(lstat(join(profile, 'node_modules/zws-command-probe')), { code: 'ENOENT' })
assert.equal(await readFile(join(profile, 'package.json'), 'utf8'), afterRemoval)
assert.deepEqual(JSON.parse(afterRemoval).selections, JSON.parse(original).selections)
console.log(JSON.stringify({ passed: true, yamlRoundTrip: true, metadataQuery: 'dsh-ops', metadataReadOnly: true, retainedClosure: true, addRemove: true, failedInstallRollback: true, lifecycleRollback: true, registryRequests: requests.length, sourceDependencyFallback: false }))
`

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(process.argv[2])
  console.log(JSON.stringify(await verifyCommandRuntime({ resourcesRoot: join(root, 'resources'), executablePath: join(root, process.platform === 'win32' ? 'ZeroWallScience.exe' : 'ZeroWallScience'), report: process.argv[3] && resolve(process.argv[3]) })))
}
