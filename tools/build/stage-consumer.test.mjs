import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const execute = promisify(execFile)
const snapshotId = 'a'.repeat(64)
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zws-stage-consumer-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'tools/build'), { recursive: true })
  await mkdir(join(root, 'tools/packaging'), { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module', version: '8.3.0' }))
  for (const file of ['incremental-build.mjs', 'clone-current-stage.mjs', 'materialize-tree.mjs', 'package-windows.mjs']) await copyFile(new URL(file, import.meta.url), join(root, 'tools/build', file))
  await writeFile(join(root, 'tools/build/build-lock.mjs'), 'export async function acquireBuildLock() { return async () => {} }')
  await writeFile(join(root, 'tools/build/assembly-cache.mjs'), 'export async function assembleRuntime() {}')
  await writeFile(join(root, 'tools/build/paths.mjs'), "import { join } from 'node:path'; export const contract = { cache: join(import.meta.dirname, '../../artifacts/cache') }")
  await writeFile(join(root, 'tools/packaging/verify-runtime-freshness.mjs'), `
    import { appendFile, readFile } from 'node:fs/promises'; import { join } from 'node:path';
    export async function verifyRuntimeFreshness(root) {
      const pointer = JSON.parse(await readFile(join(root, 'artifacts/stage/8.3.0/current.json')));
      if (pointer.buildId !== 'old-build') throw new Error('Candidate activated before freshness');
      await appendFile(join(root, 'calls.jsonl'), JSON.stringify(['freshness']) + '\\n');
      if (process.env.FAKE_FAIL === 'freshness') throw new Error('Injected freshness failure');
    }
  `)
  const command = `
    import { appendFileSync, cpSync, readFileSync, writeFileSync } from 'node:fs'; import { join } from 'node:path';
    const args = process.argv.slice(2), root = process.cwd();
    appendFileSync(join(root, 'calls.jsonl'), JSON.stringify(args) + '\\n');
    if (process.env.PACKAGE_GATE_ONLY) process.exit(args.includes('--consumer-only') ? 23 : 22);
    if (process.env.FAKE_FAIL === args[0]) throw new Error('Injected ' + args[0] + ' failure');
    const versionRoot = join(root, 'artifacts/stage/8.3.0');
    if (JSON.parse(readFileSync(join(versionRoot, 'current.json'))).buildId !== 'old-build') throw new Error('Build candidate activated too early');
    if (args[0] === 'artifacts:init') {
      if (args.includes('--new')) throw new Error('Build must initialize without activating');
      cpSync(join(versionRoot, 'old-build'), join(versionRoot, process.env.ZEROWALL_BUILD_ID), { recursive: true });
    }
    if (args[0] === 'plugins:pack') {
      const stage = join(versionRoot, process.env.ZEROWALL_BUILD_ID);
      writeFileSync(join(stage, 'plugin-snapshot.json'), JSON.stringify({ applicationVersion: '8.3.0', snapshotId: '${snapshotId}' }));
    }
  `
  await writeFile(join(root, 'fake-pnpm.mjs'), command)
  await writeFile(join(root, 'tools/build/build-graph.mjs'), command)
  await writeFile(join(root, 'tools/build/prepare-native.mjs'), '')
  await writeFile(join(root, 'tools/packaging/write-runtime-integrity.mjs'), '')
  const versionRoot = join(root, 'artifacts/stage/8.3.0'), source = join(versionRoot, 'old-build')
  for (const folder of ['runtime', 'dsh', 'offline-profile']) await mkdir(join(source, folder), { recursive: true })
  for (const file of ['dsh/build-receipt.json', 'offline-profile/receipt.json', 'runtime/integrity-receipt.json']) await writeFile(join(source, file), '{}')
  await writeFile(join(source, 'runtime/build-receipt.json'), JSON.stringify({ applicationVersion: '8.3.0', commit: 'dsh', version: '0.2.0-rc.2' }))
  await writeFile(join(source, 'plugin-snapshot.json'), JSON.stringify({ applicationVersion: '8.3.0', snapshotId }))
  const receipt = { schema: 2, status: 'success', applicationVersion: '8.3.0', buildId: 'old-build', pluginSnapshotId: snapshotId }
  await writeFile(join(source, 'build-receipt.json'), JSON.stringify(receipt))
  const pointer = JSON.stringify({ applicationVersion: '8.3.0', buildId: 'old-build' })
  await writeFile(join(versionRoot, 'current.json'), pointer)
  const env = { ...process.env, npm_execpath: join(root, 'fake-pnpm.mjs') }
  delete env.ZEROWALL_ARTIFACT_ROOT
  delete env.ZEROWALL_BUILD_ID
  return { root, env, source, versionRoot, pointer, receipt,
    run: (file, args = [], overrides = {}) => execute(process.execPath, [join(root, 'tools/build', file), ...args], { cwd: root, env: { ...env, ...overrides }, windowsHide: true }),
    calls: async () => (await readFile(join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse),
  }
}

test('consumer verifies freshness before activation and binds the final receipt to the plugin snapshot', async t => {
  const f = await fixture(t)
  await f.run('incremental-build.mjs', ['--consumer-only'])
  const pointer = JSON.parse(await readFile(join(f.versionRoot, 'current.json')))
  assert.notEqual(pointer.buildId, 'old-build')
  const receipt = JSON.parse(await readFile(join(f.versionRoot, pointer.buildId, 'build-receipt.json')))
  assert.equal(receipt.status, 'success')
  assert.equal(receipt.pluginSnapshotId, snapshotId)
  assert.equal(receipt.buildId, pointer.buildId)
  assert.deepEqual(await f.calls(), [['version:check'], ['dsh:verify'], ['plugins:pack', '--consumer-only'], ['desktop'], ['freshness']])
})

for (const failure of ['plugins:pack', 'desktop', 'freshness']) test(`consumer ${failure} failure retains diagnostics and the previous active stage`, async t => {
  const f = await fixture(t)
  await assert.rejects(f.run('incremental-build.mjs', ['--consumer-only'], { FAKE_FAIL: failure }), /Injected/u)
  assert.equal(await readFile(join(f.versionRoot, 'current.json'), 'utf8'), f.pointer)
  const candidate = (await readdir(f.versionRoot)).find(name => !['old-build', 'current.json'].includes(name))
  const receipt = JSON.parse(await readFile(join(f.versionRoot, candidate, 'build-receipt.json')))
  assert.equal(receipt.status, 'failed')
  assert.equal(receipt.buildId, candidate)
  assert.match((await readFile(join(f.versionRoot, candidate, 'build-failure.json'), 'utf8')), new RegExp(failure, 'u'))
  assert.deepEqual(JSON.parse(await readFile(join(f.source, 'build-receipt.json'))), f.receipt)
})

test('component build writes pluginSnapshotId only after successful orchestration', async t => {
  const f = await fixture(t)
  await f.run('incremental-build.mjs')
  const active = JSON.parse(await readFile(join(f.versionRoot, 'current.json')))
  assert.notEqual(active.buildId, 'old-build')
  const receipt = JSON.parse(await readFile(join(f.versionRoot, active.buildId, 'build-receipt.json')))
  assert.equal(receipt.status, 'success')
  assert.equal(receipt.applicationVersion, '8.3.0')
  assert.equal(receipt.buildId, active.buildId)
  assert.equal(receipt.pluginSnapshotId, snapshotId)
})

test('component pack failure leaves a failed final receipt, never a reusable runtime-only stage', async t => {
  const f = await fixture(t)
  await assert.rejects(f.run('incremental-build.mjs', [], { FAKE_FAIL: 'plugins:pack' }), /Injected/u)
  assert.equal(await readFile(join(f.versionRoot, 'current.json'), 'utf8'), f.pointer)
  const candidate = (await readdir(f.versionRoot)).find(name => !['old-build', 'current.json'].includes(name))
  const receipt = JSON.parse(await readFile(join(f.versionRoot, candidate, 'build-receipt.json')))
  assert.equal(receipt.status, 'failed')
  assert.match(await readFile(join(f.versionRoot, candidate, 'build-failure.json'), 'utf8'), /plugins:pack/u)
})

test('real artifact initialization honors an explicit candidate ID without switching the active pointer', async t => {
  const f = await fixture(t)
  for (const file of ['init-artifacts.mjs', 'paths.mjs', 'paths.cjs']) await copyFile(new URL(file, import.meta.url), join(f.root, 'tools/build', file))
  await f.run('init-artifacts.mjs', [], { ZEROWALL_BUILD_ID: 'inactive-candidate' })
  assert.equal(await readFile(join(f.versionRoot, 'current.json'), 'utf8'), f.pointer)
  assert.ok((await readdir(f.versionRoot)).includes('inactive-candidate'))
  assert.deepEqual(JSON.parse(await readFile(join(f.source, 'build-receipt.json'))), f.receipt)
})

for (const state of ['success', 'missing', 'failed', 'wrong-version', 'wrong-build', 'wrong-snapshot']) test(`Windows packaging ${state} final receipt selects the correct build gate`, async t => {
  const f = await fixture(t)
  const file = join(f.source, 'build-receipt.json')
  if (state === 'missing') await rm(file)
  else {
    const changes = { failed: { status: 'failed' }, 'wrong-version': { applicationVersion: '8.2.1' }, 'wrong-build': { buildId: 'another-build' }, 'wrong-snapshot': { pluginSnapshotId: 'b'.repeat(64) } }
    await writeFile(file, JSON.stringify({ ...f.receipt, ...changes[state] }))
  }
  await assert.rejects(f.run('package-windows.mjs', [], { PACKAGE_GATE_ONLY: '1' }))
  assert.deepEqual(await f.calls(), [state === 'success' ? ['build', '--consumer-only'] : ['build']])
})
