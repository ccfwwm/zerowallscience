import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { pluginSnapshotId } from '../plugins/snapshot.mjs'

const execute = promisify(execFile)
const archive = Buffer.from('verified plugin archive')
const record = { id: '@fixture/plugin', version: '1.0.0', kind: 'plugin', size: archive.length, sha256: createHash('sha256').update(archive).digest('hex') }
const snapshotId = pluginSnapshotId([record], 'dsh')
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zws-stage-consumer-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'tools/build'), { recursive: true })
  await mkdir(join(root, 'tools/packaging'), { recursive: true })
  await mkdir(join(root, 'tools/plugins'), { recursive: true })
  await mkdir(join(root, 'config/deepseek-harness'), { recursive: true })
  await mkdir(join(root, 'config/catalogs'), { recursive: true })
  await writeFile(join(root, 'config/catalogs/retired-plugins.json'), JSON.stringify({schema:1,plugins:[]}))
  await writeFile(join(root, 'config/catalogs/retired-resources.json'), JSON.stringify({schema:1,plugin:[],skill:[]}))
  await copyFile(new URL('../plugins/snapshot.mjs', import.meta.url), join(root, 'tools/plugins/snapshot.mjs'))
  await writeFile(join(root, 'config/deepseek-harness/upstream.json'), JSON.stringify({ commit: 'dsh' }))
  const store = join(root, 'artifacts/release/plugins/plugin/1.0.0')
  await mkdir(store, { recursive: true })
  await writeFile(join(store, 'plugin.tgz'), archive)
  await writeFile(join(root, 'artifacts/release/plugins/plugin-packages.json'), JSON.stringify([{ ...record, path: join(store, 'plugin.tgz') }]))
  await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module', version: '8.3.0' }))
  for (const file of ['incremental-build.mjs', 'clone-current-stage.mjs', 'materialize-tree.mjs', 'package-windows.mjs']) await copyFile(new URL(file, import.meta.url), join(root, 'tools/build', file))
  await writeFile(join(root, 'tools/build/build-lock.mjs'), 'export async function acquireBuildLock() { return async () => {} }')
  await writeFile(join(root, 'tools/build/assembly-cache.mjs'), 'export async function assembleRuntime() {}')
  await writeFile(join(root, 'tools/build/paths.mjs'), "import { join } from 'node:path'; export const root = join(import.meta.dirname, '../..'); export const contract = { cache: join(root, 'artifacts/cache') }")
  await writeFile(join(root, 'tools/packaging/verify-runtime-freshness.mjs'), `
    import { appendFile, readFile } from 'node:fs/promises'; import { join } from 'node:path';
    export async function verifyRuntimeFreshness(root) {
      const pointer = JSON.parse(await readFile(join(root, 'artifacts/stage/8.3.0/current.json')));
      if (!process.env.PACKAGE_FLOW && pointer.buildId !== 'old-build') throw new Error('Candidate activated before freshness');
      await appendFile(join(root, 'calls.jsonl'), JSON.stringify(['freshness']) + '\\n');
      if (process.env.FAKE_FAIL === 'freshness') throw new Error('Injected freshness failure');
    }
  `)
  await writeFile(join(root, 'tools/packaging/verify-bundled-resources.mjs'), `
    import { appendFile } from 'node:fs/promises'; import { join } from 'node:path';
    export async function verifyBundledResources({ root }) {
      await appendFile(join(root, 'calls.jsonl'), JSON.stringify(['bundled-resources']) + '\\n');
      return { plugins: [], skills: [] };
    }
  `)
  const command = `
    import { appendFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'; import { join } from 'node:path';
    import { pathToFileURL } from 'node:url';
    import { createHash } from 'node:crypto';
    const args = process.argv.slice(2), root = process.cwd();
    const { pluginSnapshotId } = await import(pathToFileURL(join(root, 'tools/plugins/snapshot.mjs')));
    appendFileSync(join(root, 'calls.jsonl'), JSON.stringify(args) + '\\n');
    if (process.env.PACKAGE_GATE_ONLY) process.exit(args.includes('--consumer-only') ? 23 : 22);
    if (process.env.PACKAGE_FLOW) {
      if (args[0] === 'build') {
        const versionRoot = join(root, 'artifacts/stage/8.3.0');
        const feed = JSON.parse(readFileSync(join(root, 'artifacts/release/plugins/plugin-packages.json')));
        const id = args.includes('--consumer-only') ? 'consumer-build' : 'assembled-build';
        const stage = join(versionRoot, id);
        cpSync(join(versionRoot, 'old-build'), stage, { recursive: true });
        const snapshotId = pluginSnapshotId(feed, 'dsh');
        writeFileSync(join(stage, 'plugin-snapshot.json'), JSON.stringify({ applicationVersion: '8.3.0', snapshotId, plugins: feed }));
        writeFileSync(join(stage, 'build-receipt.json'), JSON.stringify({ status: 'success', applicationVersion: '8.3.0', buildId: id, pluginSnapshotId: snapshotId }));
        const signedFiles = [];
        for (const record of feed) {
          const path = join(stage, 'offline-profile/modules', record.id);
          mkdirSync(path, { recursive: true });
          const bytes = JSON.stringify({ name: record.id, version: record.version });
          writeFileSync(join(path, 'package.json'), bytes);
          signedFiles.push({ path: 'modules/' + record.id + '/package.json', sha256: createHash('sha256').update(bytes).digest('hex') });
        }
        writeFileSync(join(stage, 'offline-profile/receipt.json'), JSON.stringify({ schema: 2, files: signedFiles }));
        writeFileSync(join(versionRoot, 'current.json'), JSON.stringify({ applicationVersion: '8.3.0', buildId: id }));
        if (process.env.PACKAGE_FLOW === 'race' && args.includes('--consumer-only')) {
          writeFileSync(join(root, 'artifacts/release/plugins/plugin-packages.json'), JSON.stringify([...feed, { ...feed[0], id: '@fixture/another', path: feed[0].path }]));
        }
      }
      process.exit(0);
    }
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
  await writeFile(join(source, 'plugin-snapshot.json'), JSON.stringify({ applicationVersion: '8.3.0', snapshotId, plugins: [record] }))
  await mkdir(join(source, 'offline-profile/modules', record.id), { recursive: true })
  await writeFile(join(source, 'offline-profile/modules', record.id, 'package.json'), JSON.stringify({ name: record.id, version: record.version }))
  await writeFile(join(source, 'offline-profile/receipt.json'), JSON.stringify({ schema: 2, files: [{ path: `modules/${record.id}/package.json`, sha256: createHash('sha256').update(JSON.stringify({ name: record.id, version: record.version })).digest('hex') }] }))
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

for (const change of ['new-version', 'new-plugin', 'missing-module', 'old-carrier']) test(`Windows packaging refreshes the assembly for ${change}`, async t => {
  const f = await fixture(t)
  if (change === 'missing-module') await rm(join(f.source, 'offline-profile/modules', record.id, 'package.json'))
  else if (change === 'old-carrier') await writeFile(join(f.source, 'offline-profile/receipt.json'), JSON.stringify({ schema: 2, files: [] }))
  else {
    const path = join(f.root, 'artifacts/release/plugins/plugin-packages.json')
    const feed = JSON.parse(await readFile(path))
    const next = { ...feed[0], ...(change === 'new-version' ? { version: '1.1.0' } : { id: '@fixture/new-plugin' }) }
    const folder = join(f.root, 'artifacts/release/plugins', next.id.split('/').at(-1), next.version)
    await mkdir(folder, { recursive: true })
    next.path = join(folder, 'plugin.tgz')
    await writeFile(next.path, archive)
    await writeFile(path, JSON.stringify(change === 'new-version' ? [next] : [...feed, next]))
  }
  await assert.rejects(f.run('package-windows.mjs', [], { PACKAGE_GATE_ONLY: '1' }))
  assert.deepEqual(await f.calls(), [['build']])
})

test('Windows packaging rejects corrupt latest archives without rebuilding or repacking', async t => {
  const f = await fixture(t)
  await writeFile(join(f.root, 'artifacts/release/plugins/plugin/1.0.0/plugin.tgz'), 'corrupt')
  await assert.rejects(f.run('package-windows.mjs', [], { PACKAGE_GATE_ONLY: '1' }), /missing or changed plugin artifact/u)
  await assert.rejects(f.calls(), { code: 'ENOENT' })
})

test('Windows packaging refreshes an outdated closure and consumes the latest set without changing original archives', async t => {
  const f = await fixture(t)
  const path = join(f.root, 'artifacts/release/plugins/plugin-packages.json')
  const feed = JSON.parse(await readFile(path))
  const next = { ...feed[0], id: '@fixture/added' }
  const folder = join(f.root, 'artifacts/release/plugins/added/1.0.0')
  await mkdir(folder, { recursive: true })
  next.path = join(folder, 'added.tgz')
  await writeFile(next.path, archive)
  await writeFile(path, JSON.stringify([...feed, next]))
  await f.run('package-windows.mjs', [], { PACKAGE_FLOW: 'success' })
  assert.deepEqual(await f.calls(), [['build'], ['build', '--consumer-only'], ['bundled-resources'], ['freshness'], ['--filter', '@zerowallscience/desktop', 'run', 'package:stable:win']])
  assert.deepEqual(await readFile(feed[0].path), archive)
  assert.deepEqual(await readFile(next.path), archive)
  const installed = JSON.parse(await readFile(join(f.versionRoot, 'consumer-build/offline-profile/modules', next.id, 'package.json')))
  assert.equal(installed.version, next.version)
})

test('a plugin feed change during consumer assembly prevents invoking Electron packaging', async t => {
  const f = await fixture(t)
  await assert.rejects(f.run('package-windows.mjs', [], { PACKAGE_FLOW: 'race' }))
  assert.deepEqual(await f.calls(), [['build', '--consumer-only']])
})
