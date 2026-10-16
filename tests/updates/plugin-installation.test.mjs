import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { packageRuntime, resolveCommandDshHome, resolveCommandUserData } from '../../tools/commands/package-runtime.mjs'
import { importLegacyCliPlugins } from '../../tools/commands/legacy-cli-profile.mjs'
const execute = promisify(execFile)
const anchor = resolve('deepseek-harness/apps/cli/package.json')
const require = createRequire(anchor)
const boot = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-app-boot')).href)

test('CLI home matches existing Roaming/new Local desktop policy and preserves explicit overrides', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-home-policy-'))
  try {
    const env = { APPDATA: join(root, 'roaming'), LOCALAPPDATA: join(root, 'local') }
    assert.equal(resolveCommandDshHome(env), join(root, 'local/zerowall-science/harness'))
    await mkdir(join(root, 'roaming/zerowall-science'), { recursive: true })
    assert.equal(resolveCommandDshHome(env), join(root, 'roaming/zerowall-science/harness'))
    assert.equal(resolveCommandDshHome({ ...env, ZEROWALL_USER_DATA_DIR: join(root, 'isolated') }), join(root, 'isolated/harness'))
    assert.equal(resolveCommandDshHome({ ...env, DSH_HOME: join(root, 'explicit') }), join(root, 'explicit'))
    assert.equal(resolveCommandUserData({ ...env, ZEROWALL_RELEASE_CHANNEL: 'preview' }), join(root, 'local/zerowall-science-preview'))
    const runtime = packageRuntime()
    assert.equal(runtime.command, process.execPath)
    assert.match(runtime.args[1], /pnpm-executor\.mjs$/u)
    const result = await execute(runtime.command, [...runtime.args, '--version'], { env: { ...process.env, ...runtime.env }, windowsHide: true })
    assert.equal(result.stdout.trim(), '11.7.0')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('legacy import uses official bundle admission, respects choices and does not resurrect removed imports', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-cli-import-'))
  const home = join(root, 'desktop'), legacyHome = join(root, 'legacy')
  try {
    const source = join(legacyHome, 'profiles/web'), target = join(home, 'profiles/web')
    await mkdir(source, { recursive: true }); await mkdir(target, { recursive: true }); await mkdir(join(home, 'resources/plugins'), { recursive: true })
    const ids = ['enabled-plugin', 'disabled-plugin', 'removed-plugin', 'pinned-plugin', 'plain-dependency', 'unselected-plugin', 'incompatible-plugin', 'patch-disabled-plugin']
    for (const id of ids) {
      const dir = join(source, 'node_modules', id)
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'package.json'), JSON.stringify({ name: id, version: '1.0.0', ...(id === 'incompatible-plugin' ? { peerDependencies: { '@deepseek-ai/dsh-app-boot': '^99.0.0' } } : {}), ...(id === 'plain-dependency' ? {} : { dsh: { bundle: { patch: './cordis.patch.yml' } } }) }))
      await writeFile(join(dir, 'cordis.patch.yml'), `- id: ${id}\n  name: ${id}\n`)
    }
    await writeFile(join(source, 'package.json'), JSON.stringify({ dependencies: Object.fromEntries(ids.map(id => [id, '1.0.0'])), dsh: { profile: { bundles: ids.filter(id => id !== 'unselected-plugin') } } }))
    await writeFile(join(source, 'cordis.patch.yml'), '- id: patch-disabled-plugin\n  disabled: true\n')
    const manifest = { dependencies: { retained: '2.3.4' }, dsh: { profile: { bundles: [] } }, zerowall: { pluginArchitecture: 7 }, account: { untouched: true } }
    await writeFile(join(target, 'package.json'), JSON.stringify(manifest))
    const selection = { disabled: ['disabled-plugin'], removed: ['removed-plugin'], pinned: { 'pinned-plugin': '1.0.0' } }
    await writeFile(join(home, 'resources/plugins/selection.json'), JSON.stringify(selection))
    const result = await importLegacyCliPlugins(home, { installAnchor: anchor, legacyHome })
    assert.deepEqual(result.imported, ['enabled-plugin'])
    assert.equal(await realpath(join(target, 'node_modules/enabled-plugin')), await realpath(join(source, 'node_modules/enabled-plugin')))
    const loaded = boot.loadProfileDirectory('dsh', target, anchor)
    assert.deepEqual(loaded.layers.map(layer => layer.packageName), ['enabled-plugin'])
    const imported = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'))
    assert.equal(imported.dependencies.retained, '2.3.4'); assert.deepEqual(imported.account, manifest.account)
    assert.deepEqual(JSON.parse(await readFile(join(home, 'resources/plugins/selection.json'), 'utf8')), selection)
    imported.dsh.profile.bundles = []; delete imported.dependencies['enabled-plugin']
    await writeFile(join(target, 'package.json'), JSON.stringify(imported))
    await rm(join(target, 'node_modules/enabled-plugin'))
    assert.deepEqual((await importLegacyCliPlugins(home, { installAnchor: anchor, legacyHome })).imported, [])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('explicit store mismatch relinks using official install, journals success and retains manifests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-store-migrate-'))
  const pnpm = join(root, 'pnpm.mjs')
  try {
    await writeFile(join(root, 'package.json'), '{"dependencies":{"retained":"1.2.3"},"dsh":{"profile":{"bundles":[]}}}')
    await writeFile(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
    await writeFile(pnpm, `import assert from 'node:assert/strict'; import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'; const args=process.argv.slice(2); appendFileSync('calls.jsonl', JSON.stringify(args)+'\\n'); if(args[0]==='install' && args.includes('--force')) {assert.equal(JSON.parse(readFileSync('package.json','utf8')).dependencies.retained,'1.2.3'); assert.equal(readFileSync('pnpm-lock.yaml','utf8'),'lockfileVersion: 9.0\\n'); writeFileSync('relinked','yes');} else if(!existsSync('relinked')) {writeFileSync('package.json','{}'); writeFileSync('pnpm-lock.yaml','partial-mutation'); console.error('ERR_PNPM_UNEXPECTED_STORE'); process.exitCode=1}`)
    const before = await readFile(join(root, 'package.json'), 'utf8')
    await execute(process.execPath, [resolve('tools/commands/pnpm-executor.mjs'), pnpm, 'add', 'new-plugin'], { cwd: root, windowsHide: true })
    const calls = (await readFile(join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
    assert.deepEqual(calls, [['add', 'new-plugin'], ['install', '--force', '--config.optimistic-repeat-install=false', '--frozen-lockfile'], ['add', 'new-plugin']])
    assert.equal(await readFile(join(root, 'package.json'), 'utf8'), before)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('read-only pnpm errors never relink the store; failed repair restores exact manifest and lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-store-fail-'))
  try {
    const pnpm = join(root, 'pnpm.mjs')
    await writeFile(pnpm, `import { appendFileSync, writeFileSync } from 'node:fs'; const args=process.argv.slice(2); appendFileSync('calls.jsonl', JSON.stringify(args)+'\\n'); if(args.includes('--force')) {writeFileSync('package.json','{}'); writeFileSync('pnpm-lock.yaml','changed');} console.error('ERR_PNPM_UNEXPECTED_STORE'); process.exitCode=1`)
    await writeFile(join(root, 'package.json'), '{"dependencies":{"retained":"1.2.3"}}')
    await writeFile(join(root, 'pnpm-lock.yaml'), 'original-lock')
    await assert.rejects(execute(process.execPath, [resolve('tools/commands/pnpm-executor.mjs'), pnpm, 'list'], { cwd: root, windowsHide: true }))
    assert.equal((await readFile(join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').length, 1)
    await assert.rejects(execute(process.execPath, [resolve('tools/commands/pnpm-executor.mjs'), pnpm, 'add', 'new-plugin'], { cwd: root, windowsHide: true }))
    assert.equal(await readFile(join(root, 'package.json'), 'utf8'), '{"dependencies":{"retained":"1.2.3"}}')
    assert.equal(await readFile(join(root, 'pnpm-lock.yaml'), 'utf8'), 'original-lock')
  } finally { await rm(root, { recursive: true, force: true }) }
})
