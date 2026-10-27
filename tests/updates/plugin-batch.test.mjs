import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import * as yaml from 'yaml'
import { c as createArchive } from 'tar'
import { signCatalog, fileDigest, downloadResource } from '../../tools/release/resource-catalog.mjs'
import { initializeProfile } from '../../tools/commands/profile.mjs'
import { createResourceManager } from '../../tools/commands/resource-manager.mjs'
import { commitPackagePaths } from '../../tools/commands/profile-package-commit.mjs'
import { pluginDependencyContract } from '../../tools/release/plugin-dependency-contract.mjs'
const target = { desktopVersion: '8.1.3', dshVersion: '0.2.0-rc.2', platform: 'win32', architecture: 'x64' }

async function fixture(run, mode) {
  const home = await mkdtemp(join(tmpdir(), 'zws-batch-'))
  try {
    const pair = generateKeyPairSync('ed25519'); const ids = ['a', 'b', 'shared', ...Array.from({ length: 9 }, (_, index) => `extra-${index}`)].map(x => `@zerowallscience/plugin-${x}`)
    await initializeProfile(home, ids.slice(0, 2))
    const resources = []
    for (const id of ids) {
      const content = mode === 'same-digest' && ids.indexOf(id) < 3 ? 'shared signed package bytes' : id
      const path = join(home, id.split('-').at(-1) + '.tgz'); await writeFile(path, content)
      resources.push({ id, kind: 'plugin', version: '0.1.0', platform: ['win32'], architecture: ['x64'], desktopRange: { min: '8.1.3' }, dshRange: { min: target.dshVersion, max: target.dshVersion }, downloadUrl: pathToFileURL(path).href, size: Buffer.byteLength(content), sha256: await fileDigest(path), dependencies: id === ids[2] ? {} : { [ids[2]]: '0.1.0' }, restartRequired: true, rollbackSupported: true })
    }
    const source = join(home, 'catalog.json'); await writeFile(source, JSON.stringify(signCatalog({ schema: 1, localOnly: true, resources }, pair.privateKey, 'test')))
    const calls = []; let starts = 0
    const downloadStats = { active: 0, maximum: 0 }
    const abort = new AbortController()
    const manager = createResourceManager({ home, target, local: true, keys: { test: pair.publicKey },
      downloadResource: async (...args) => {
        if (mode === 'cancel-in-flight') {
          downloadStats.active++
          downloadStats.maximum = Math.max(downloadStats.maximum, downloadStats.active)
          return new Promise((resolve, reject) => {
            args[2].signal.addEventListener('abort', () => {
              downloadStats.active--
              reject(new Error('injected in-flight cancellation'))
            }, { once: true })
            if (downloadStats.active === 3) setTimeout(() => abort.abort(), 10)
          })
        }
        if (mode === 'measure-concurrency' || mode === 'download-failure') {
          downloadStats.active++
          downloadStats.maximum = Math.max(downloadStats.maximum, downloadStats.active)
          try {
            await new Promise(resolve => setTimeout(resolve, 20))
            if (mode === 'download-failure' && args[0].id === ids[0]) throw new Error('injected download failure')
            return await downloadResource(...args)
          } finally { downloadStats.active-- }
        }
        return downloadResource(...args)
      },
      runPlugin: async (args, generation) => {
        calls.push(['prepare', ...args]); if (mode === 'prepare-failure') throw new Error('preparation failed')
        const path = join(home, 'profiles', generation, 'package.json'); const manifest = JSON.parse(await readFile(path)); manifest.batch = ['a','b']; await writeFile(path, JSON.stringify(manifest))
      }, stopHost: async () => { calls.push(['stop']) }, startHost: async () => { calls.push(['start']); if (mode === 'health-failure' && starts++ === 0) throw new Error('health failed') }, callHost: async () => {} })
    await run({ home, manager, ids, source, calls, abort, downloadStats })
  } finally { await rm(home, { recursive: true, force: true }) }
}
for (const failHealth of [false, true]) test(`modern batch resolves old and new bundle patches without reading history (health failure: ${failHealth})`, async t => {
  const home = await mkdtemp(join(tmpdir(), 'zws-batch-patch-'))
  t.after(() => rm(home, { recursive: true, force: true, maxRetries: 5 }))
  const id = '@zerowallscience/plugin-secrets', shared = '@zerowallscience/plugin-shared'
  await initializeProfile(home, [id, shared])
  const active = join(home, 'profiles/web'), runtimeModules = join(home, 'runtime/node_modules')
  const manifest = JSON.parse(await readFile(join(active, 'package.json')))
  manifest.zerowall = { profileLayout: 3 }
  manifest.dependencies = { [id]: '1.0.0', [shared]: '1.0.0' }
  await writeFile(join(active, 'package.json'), JSON.stringify(manifest))
  async function bundle(root, name, version, entry) {
    const path = join(root, name)
    await mkdir(path, { recursive: true })
    await writeFile(join(path, 'package.json'), JSON.stringify({ name, version, dsh: { bundle: { patch: 'dsh.bundle.patch.yml' } } }))
    await writeFile(join(path, 'dsh.bundle.patch.yml'), yaml.stringify([{ name: `${name}/service`, id: entry }]))
  }
  await bundle(join(active, 'node_modules'), id, '1.0.0', 'old-secrets')
  await bundle(runtimeModules, shared, '1.0.0', 'runtime-shared')
  const pair = generateKeyPairSync('ed25519'), resources = []
  for (const name of [id, shared]) {
    const path = join(home, name.split('/').at(-1) + '.tgz')
    await writeFile(path, name)
    resources.push({ id: name, kind: 'plugin', version: '2.0.0', dependencies: {}, platform: ['win32'], architecture: ['x64'], desktopRange: { min: target.desktopVersion }, dshRange: { min: target.dshVersion, max: target.dshVersion }, downloadUrl: pathToFileURL(path).href, size: Buffer.byteLength(name), sha256: await fileDigest(path), restartRequired: true, rollbackSupported: true })
  }
  const source = join(home, 'catalog.json')
  await writeFile(source, JSON.stringify(signCatalog({ schema: 1, localOnly: true, resources }, pair.privateKey, 'test')))
  const starts = []
  const manager = createResourceManager({ home, target, runtimeModules, yaml, local: true, keys: { test: pair.publicKey },
    runPlugin: async (_args) => {
      const activeReceipt = JSON.parse(await readFile(join(active, '.zerowall/resource-transaction.json')))
      const transactionId = activeReceipt.transactionId
      const directory = join(active, '.plugin-manager/package-transactions', transactionId)
      const transaction = JSON.parse(await readFile(join(directory, 'journal.json')))
      const candidate = transaction.candidate
      await mkdir(candidate, { recursive: true })
      await writeFile(join(candidate, 'package.json'), await readFile(join(active, 'package.json')))
      for (const name of [id, shared]) await bundle(join(candidate, 'node_modules'), name, '2.0.0', 'new-' + name.split('-').at(-1))
      await commitPackagePaths({ profile: active, candidate, directory, state: transaction, ids: [id, shared], includeDependencyRoot: true })
      await writeFile(join(directory, 'journal.json'), JSON.stringify({ ...transaction, state: 'awaiting-validation' }))
    }, stopHost: async () => {}, startHost: async options => {
      starts.push(options)
      if (failHealth && starts.length === 1) throw new Error('injected health failure')
    },
  })
  const update = manager.updatePlugins([id, shared], source)
  if (failHealth) await assert.rejects(update, /injected health failure/)
  else await update
  assert.deepEqual(new Set(starts[0].affectedEntries.map(entry => entry.id)), new Set(['old-secrets', 'runtime-shared', 'new-secrets', 'new-shared']))
  assert.equal(JSON.parse(await readFile(join(active, 'node_modules', id, 'package.json'))).version, failHealth ? '1.0.0' : '2.0.0')
  const journal = JSON.parse(await readFile(join(home, 'resources/transaction.json')))
  assert.equal(journal.direct, true)
  assert.equal(journal.backup, undefined)
  assert.equal((await readdir(join(home, 'resources/history')).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))).length, 0)
})

test('two plugins with shared closure prepare once and activate with one Host restart', () => fixture(async f => {
  const progress = []
  const result = await f.manager.updatePlugins([f.ids[0], f.ids[1], f.ids[0]], f.source, { report: value => progress.push(value) })
  assert.equal(result.updated, 2)
  assert.equal(progress.filter(x => x.phase === 'preparing').length, 3)
  assert.deepEqual(f.calls.map(x => x[0]), ['prepare', 'stop', 'start'])
  assert.equal(f.calls[0].length, 4)
}))
test('plugin batch downloads the signed dependency closure concurrently within its worker limit', () => fixture(async f => {
  const requested = f.ids.filter((_, index) => index !== 2)
  const result = await f.manager.updatePlugins(requested, f.source)
  assert.equal(result.updated, requested.length)
  assert.equal(f.downloadStats.maximum, 8)
  assert.deepEqual(f.calls.map(x => x[0]), ['prepare', 'stop', 'start'])
}, 'measure-concurrency'))
test('missing legacy archive sources use the same bounded concurrent download queue', () => fixture(async f => {
  const file = join(f.home, 'profiles/web/package.json')
  const manifest = JSON.parse(await readFile(file))
  const missing = f.ids.slice(3)
  manifest.dependencies = Object.fromEntries(missing.map(id => [id, 'file:' + join(f.home, 'missing', id.split('/').at(-1) + '.tgz').replaceAll('\\', '/')]))
  await writeFile(file, JSON.stringify(manifest))
  const result = await f.manager.updatePlugins([f.ids[0]], f.source)
  assert.equal(result.updated, 1)
  assert.deepEqual(new Set(result.repairedIds), new Set(missing))
  assert.equal(f.downloadStats.maximum, 8)
  assert.deepEqual(f.calls.map(x => x[0]), ['prepare', 'stop', 'start'])
}, 'measure-concurrency'))
test('a failed concurrent download aborts the rest of preparation before Host activation', () => fixture(async f => {
  await assert.rejects(f.manager.updatePlugins(f.ids.slice(0, 2), f.source), /injected download failure/)
  assert.deepEqual(f.calls, [])
  const state = JSON.parse(await readFile(join(f.home, 'resources/transaction.json')))
  assert.equal(state.state, 'preparation-failed')
  assert.equal(f.downloadStats.active, 0)
}, 'download-failure'))
test('same-digest plugins get distinct pnpm tarball paths during concurrent preparation', () => fixture(async f => {
  const result = await f.manager.updatePlugins(f.ids.slice(0, 2), f.source)
  assert.equal(result.updated, 2)
  const archives = f.calls[0].slice(2)
  assert.equal(archives.length, 2)
  assert.equal(new Set(archives).size, archives.length)
  assert.ok(archives.every(path => path.endsWith('.tgz')))
}, 'same-digest'))
test('cancelling in-flight downloads drains all workers before archiving the candidate', () => fixture(async f => {
  const progress = []
  await assert.rejects(f.manager.updatePlugins(f.ids.slice(0, 2), f.source, { signal: f.abort.signal, report: event => progress.push(event) }), /CANCELLED/)
  assert.equal(f.downloadStats.maximum, 3)
  assert.equal(f.downloadStats.active, 0)
  assert.deepEqual(progress, [])
  assert.deepEqual(f.calls, [])
  const state = JSON.parse(await readFile(join(f.home, 'resources/transaction.json')))
  assert.equal(state.state, 'cancelled')
  // Cancellation can happen while the signed downloads are still in flight,
  // before candidate materialization creates profiles/zerowall. In that case
  // the journal keeps the reserved candidate path; once materialized it is
  // moved to history/cancelled-* by the same rollback path.
  assert.ok(/profiles[\\/]zerowall$/u.test(state.candidate) || /history[\\/]cancelled-/u.test(state.candidate))
}, 'cancel-in-flight'))
test('same-digest downloads share one transfer and finish with an intact package', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'zws-download-dedupe-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const payload = Buffer.from('one signed package shared by two entries')
  const sha256 = createHash('sha256').update(payload).digest('hex')
  const entry = { id: '@zerowallscience/plugin-one', version: '0.1.0', size: payload.length, sha256, downloadUrl: 'https://example.test/shared.tgz' }
  let calls = 0
  const fetcher = async () => {
    calls++
    await new Promise(resolve => setTimeout(resolve, 15))
    return { ok: true, body: Readable.from([payload]) }
  }
  const [first, second] = await Promise.all([
    downloadResource(entry, directory, { fetcher }),
    downloadResource({ ...entry, id: '@zerowallscience/plugin-two' }, directory, { fetcher }),
  ])
  assert.equal(first, second)
  assert.equal(calls, 1)
  assert.deepEqual(await readFile(first), payload)
})
test('downloads keep a transfer deadline when the caller provides a cancellation signal', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'zws-download-deadline-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const cancellation = new AbortController()
  const entry = { size: 1, sha256: '0'.repeat(64), downloadUrl: 'https://example.test/stalled.tgz' }
  // Timers created by AbortSignal.timeout are unreferenced; keep this fixture
  // alive while the intentionally stalled fetch waits for the deadline.
  const keepAlive = setTimeout(() => {}, 1000)
  t.after(() => clearTimeout(keepAlive))
  const fetcher = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
  await assert.rejects(downloadResource(entry, directory, { fetcher, signal: cancellation.signal, timeoutMs: 25 }), { name: 'TimeoutError' })
  assert.equal(cancellation.signal.aborted, false)
  assert.deepEqual(await readdir(directory), [])
})
for (const mode of ['prepare-failure', 'health-failure']) test(`batch ${mode} keeps or restores the complete old profile`, () => fixture(async f => {
  const path = join(f.home, 'profiles/web/package.json'); const before = await readFile(path, 'utf8')
  await assert.rejects(f.manager.updatePlugins(f.ids.slice(0,2), f.source), /failed/)
  assert.equal(await readFile(path, 'utf8'), before)
  if (mode === 'prepare-failure') assert.equal(f.calls.some(x => x[0] === 'stop'), false)
}, mode))
test('cancellation during downloads preserves the active Host and profile', () => fixture(async f => {
  const path = join(f.home, 'profiles/web/package.json'); const before = await readFile(path, 'utf8')
  await assert.rejects(f.manager.updatePlugins(f.ids.slice(0,2), f.source, { signal: f.abort.signal, report: () => f.abort.abort() }), /CANCELLED/)
  assert.deepEqual(f.calls, [])
  assert.equal(await readFile(path, 'utf8'), before)
}))

test('repeated failed updates discard the disposable candidate without growing history', () => fixture(async f => {
  for (let i = 0; i < 3; i++) {
    await assert.rejects(f.manager.updatePlugins(f.ids.slice(0, 2), f.source), /preparation failed/)
    assert.deepEqual(await readdir(join(f.home, 'profiles')), ['web'])
    const state = JSON.parse(await readFile(join(f.home, 'resources/transaction.json')))
    assert.equal(state.state, 'preparation-failed')
    assert.equal(state.candidate.endsWith('profiles\\zerowall') || state.candidate.endsWith('profiles/zerowall'), true)
    await assert.rejects(readFile(join(state.candidate, 'package.json')), { code: 'ENOENT' })
  }
  assert.equal((await readdir(join(f.home, 'resources/history')).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))).length, 0)
}, 'prepare-failure'))

for (const modern of [false, true]) test(`a signed closure installs with real pnpm offline and keeps unrelated selections (layout ${modern ? 3 : 'legacy'})`, async()=>{
 const home=await mkdtemp(join(tmpdir(),'zws-local-closure-'))
 try {
  const account='@zerowallscience/plugin-closure-fixture',sidebar='dsh-sidebar-closure-fixture',peer='dsh-peer-closure-fixture'
  const version='0.26.1-zws.1',pair=generateKeyPairSync('ed25519'),resources=[]
  await initializeProfile(home,[account,peer])
  for(const [id,dependencies,peerDependencies] of [[account,{[sidebar]:version},{}],[sidebar,{},{}],[peer,{}, {[sidebar]:version}]]){
   const source=join(home,id.split('/').at(-1));await mkdir(join(source,'package'),{recursive:true})
   await writeFile(join(source,'package/package.json'),JSON.stringify({name:id,version,dependencies,peerDependencies}))
   const path=source+'.tgz';await createArchive({file:path,cwd:source,gzip:true},['package'])
   if(id===peer){
    const file=join(home,'profiles/web/package.json'),manifest=JSON.parse(await readFile(file))
    manifest.dependencies={[peer]:'file:'+path};await writeFile(file,JSON.stringify(manifest))
   }else resources.push({id,kind:'plugin',version,dependencies,platform:['win32'],architecture:['x64'],desktopRange:{min:'8.1.3'},dshRange:{min:target.dshVersion,max:target.dshVersion},downloadUrl:pathToFileURL(path).href,size:(await readFile(path)).length,sha256:await fileDigest(path),restartRequired:true,rollbackSupported:true})
  }
  if (modern) {
   const file=join(home,'profiles/web/package.json'),manifest=JSON.parse(await readFile(file))
   manifest.zerowall={profileLayout:3};await writeFile(file,JSON.stringify(manifest))
   await mkdir(join(home,'profiles/web/node_modules',peer),{recursive:true})
   await writeFile(join(home,'profiles/web/node_modules',peer,'package.json'),JSON.stringify({name:peer,version,peerDependencies:{[sidebar]:version}}))
  }
  await writeFile(join(home,'profiles/web/pnpm-workspace.yaml'),yaml.stringify({packages:['.'],autoInstallPeers:false,nodeLinker:'hoisted',overrides:{'dsh-auto-review':'file:retired.tgz',custom:'1.2.3'}}))
  const source=join(home,'catalog.json');await writeFile(source,JSON.stringify(signCatalog({schema:1,localOnly:true,resources},pair.privateKey,'test')))
  const before=JSON.parse(await readFile(join(home,'profiles/web/package.json')))
  const manager=createResourceManager({home,target,local:true,yaml,keys:{test:pair.publicKey},stopHost:async()=>{},startHost:async()=>{},runPlugin:async(args,generation,{resourceCandidateId}={})=>{
   const candidate=join(home,'profiles',generation),manifest=JSON.parse(await readFile(join(candidate,'package.json'))),workspace=yaml.parse(await readFile(join(candidate,'pnpm-workspace.yaml'),'utf8'))
   assert.match(manifest.dependencies[sidebar],/^file:.*\.tgz$/)
   assert.equal(manifest.dependencies[peer],before.dependencies[peer])
   assert.equal(workspace.overrides['dsh-auto-review'],undefined)
   assert.equal(workspace.overrides.custom,'1.2.3')
   assert.equal(args.length,2)
   const pnpm=new URL('../../deepseek-harness/apps/desktop/node_modules/pnpm/bin/pnpm.cjs',import.meta.url)
   const executor=fileURLToPath(new URL('../../tools/commands/pnpm-executor.mjs',import.meta.url))
   const result=spawnSync(process.execPath,[...(modern?[executor]:['--expose-internals']),fileURLToPath(pnpm),...args,'--offline','--ignore-scripts'],{cwd:candidate,env:{...process.env,...(modern?{ZEROWALL_RESOURCE_CANDIDATE_ID:resourceCandidateId}: {})},encoding:'utf8',timeout:60000})
   assert.equal(result.status,0,result.stdout+'\n'+result.stderr)
   assert.equal(JSON.parse(await readFile(join(candidate,'node_modules',sidebar,'package.json'))).version,version)
  }})
  await manager.updatePlugins([account],source)
  const after=JSON.parse(await readFile(join(home,'profiles/web/package.json')))
  assert.deepEqual(after.dsh.profile.bundles,before.dsh.profile.bundles)
  for (const id of [account,sidebar]) assert.equal(JSON.parse(await readFile(join(home,'profiles/web/node_modules',id,'package.json'))).version,version)
 }finally{await rm(home,{recursive:true,force:true})}
})

for (const modern of [false, true]) test(`immutable exact archive dependencies resolve newer compatible signed feed packages offline (layout ${modern ? 3 : 'legacy'})`, async t => {
  const home = await mkdtemp(join(tmpdir(), 'zws-feed-contract-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const consumer = '@zerowallscience/plugin-feed-consumer-fixture'
  const account = '@zerowallscience/plugin-feed-account-fixture'
  const base = '@zerowallscience/plugin-feed-base-fixture'
  const versions = { [consumer]: '0.1.35', [account]: '0.1.20', [base]: '0.1.27' }
  const pair = generateKeyPairSync('ed25519'), resources = [], original = new Map()
  await initializeProfile(home, [consumer])
  const active = join(home, 'profiles/web')
  if (modern) {
    const manifest = JSON.parse(await readFile(join(active, 'package.json')))
    manifest.zerowall = { profileLayout: 3 }
    await writeFile(join(active, 'package.json'), JSON.stringify(manifest))
  }
  for (const [id, dependencies, sourceDependencies] of [
    [consumer, { [account]: '0.1.19', [base]: '0.1.25' }, { [account]: 'workspace:^', [base]: 'workspace:^' }],
    [account, { [base]: '0.1.27' }, { [base]: 'workspace:^' }],
    [base, {}, {}],
  ]) {
    const directory = join(home, id.split('/').at(-1))
    await mkdir(join(directory, 'package'), { recursive: true })
    await writeFile(join(directory, 'package/package.json'), JSON.stringify({ name: id, version: versions[id], dependencies }))
    const path = directory + '.tgz'
    await createArchive({ file: path, cwd: directory, gzip: true }, ['package'])
    const sha256 = await fileDigest(path)
    original.set(path, sha256)
    resources.push({ id, kind: 'plugin', version: versions[id], ...pluginDependencyContract({ dependencies }, { dependencies: sourceDependencies }), platform: ['win32'], architecture: ['x64'], desktopRange: { min: target.desktopVersion }, dshRange: { min: target.dshVersion, max: target.dshVersion }, downloadUrl: pathToFileURL(path).href, size: (await readFile(path)).length, sha256, restartRequired: true, rollbackSupported: true })
  }
  const source = join(home, 'catalog.json')
  await writeFile(source, JSON.stringify(signCatalog({ schema: 1, localOnly: true, resources }, pair.privateKey, 'test')))
  let preparations = 0
  const manager = createResourceManager({ home, target, local: true, yaml, keys: { test: pair.publicKey }, stopHost: async () => {}, startHost: async () => {}, runPlugin: async (args, generation, { resourceCandidateId } = {}) => {
    preparations++
    const candidate = join(home, 'profiles', generation)
    const pnpm = fileURLToPath(new URL('../../deepseek-harness/apps/desktop/node_modules/pnpm/bin/pnpm.cjs', import.meta.url))
    const executor = fileURLToPath(new URL('../../tools/commands/pnpm-executor.mjs', import.meta.url))
    const result = spawnSync(process.execPath, [...(modern ? [executor] : ['--expose-internals']), pnpm, ...args, '--offline', '--ignore-scripts'], { cwd: candidate, env: { ...process.env, ...(modern ? { ZEROWALL_RESOURCE_CANDIDATE_ID: resourceCandidateId } : {}) }, encoding: 'utf8', timeout: 60000 })
    assert.equal(result.status, 0, result.stdout + '\n' + result.stderr)
    for (const [id, version] of Object.entries(versions)) assert.equal(JSON.parse(await readFile(join(candidate, 'node_modules', id, 'package.json'))).version, version)
  } })
  await manager.updatePlugins([consumer], source)
  assert.equal(preparations, 1)
  for (const [path, sha256] of original) assert.equal(await fileDigest(path), sha256)
  const installedConsumer = JSON.parse(await readFile(join(active, 'node_modules', consumer, 'package.json')))
  assert.deepEqual(installedConsumer.dependencies, { [account]: '0.1.19', [base]: '0.1.25' })
})

test('real pnpm repairs deleted legacy tarballs and their closure while removing retired lock and override entries', async () => {
  const home = await mkdtemp(join(tmpdir(), 'zws-stale-lock-'))
  const selected = '@zerowallscience/plugin-update-fixture'
  const legacy = 'dsh-legacy-fixture'
  const child = 'dsh-legacy-child-fixture'
  const retired = '@everclear077/dsh-progressive-tools'
  const pnpm = fileURLToPath(new URL('../../deepseek-harness/apps/desktop/node_modules/pnpm/bin/pnpm.cjs', import.meta.url))
  const runPnpm = (directory, args) => {
    const result = spawnSync(process.execPath, ['--expose-internals', pnpm, ...args, '--offline', '--ignore-scripts'], { cwd: directory, encoding: 'utf8', timeout: 60000 })
    assert.equal(result.status, 0, result.stdout + '\n' + result.stderr)
  }
  try {
    const pair = generateKeyPairSync('ed25519')
    const resources = []
    const archives = {}
    async function archive(id, version, dependencies = {}) {
      const directory = join(home, id.split('/').at(-1) + '-' + version)
      await mkdir(join(directory, 'package'), { recursive: true })
      await writeFile(join(directory, 'package/package.json'), JSON.stringify({ name: id, version, dependencies }))
      const path = directory + '.tgz'
      await createArchive({ file: path, cwd: directory, gzip: true }, ['package'])
      return path
    }
    for (const [id, dependencies] of [[selected, {}], [legacy, { [child]: '0.2.0' }], [child, {}]]) {
      const path = await archive(id, '0.2.0', dependencies)
      resources.push({ id, kind: 'plugin', version: '0.2.0', dependencies, platform: ['win32'], architecture: ['x64'], desktopRange: { min: '8.1.3' }, dshRange: { min: target.dshVersion, max: target.dshVersion }, downloadUrl: pathToFileURL(path).href, size: (await readFile(path)).length, sha256: await fileDigest(path), restartRequired: true, rollbackSupported: true })
    }
    for (const [id, dependencies] of [[legacy, { [child]: '0.1.0' }], [child, {}], [retired, {}]]) archives[id] = await archive(id, '0.1.0', dependencies)
    await initializeProfile(home, [selected, legacy, retired])
    const active = join(home, 'profiles/web')
    const file = join(active, 'package.json')
    const manifest = JSON.parse(await readFile(file))
    manifest.dependencies = { [legacy]: 'file:' + archives[legacy], [retired]: 'file:' + archives[retired] }
    await writeFile(file, JSON.stringify(manifest))
    await writeFile(join(active, 'pnpm-workspace.yaml'), yaml.stringify({ packages: ['.'], autoInstallPeers: false, overrides: { [child]: 'file:' + archives[child], [retired]: 'file:' + archives[retired] } }))
    runPnpm(active, ['install', '--no-frozen-lockfile'])
    for (const path of Object.values(archives)) await rm(path)
    const source = join(home, 'catalog.json')
    await writeFile(source, JSON.stringify(signCatalog({ schema: 1, localOnly: true, resources }, pair.privateKey, 'test')))
    const manager = createResourceManager({ home, target, local: true, yaml, keys: { test: pair.publicKey }, stopHost: async () => {}, startHost: async () => {}, runPlugin: async (args, generation) => {
      const candidate = join(home, 'profiles', generation)
      runPnpm(candidate, args)
      const lock = await readFile(join(candidate, 'pnpm-lock.yaml'), 'utf8')
      assert(!lock.includes('dsh-progressive-tools'))
      for (const path of Object.values(archives)) assert(!lock.includes(path.replaceAll('\\', '/')))
      for (const id of [selected, legacy, child]) assert.equal(JSON.parse(await readFile(join(candidate, 'node_modules', id, 'package.json'))).version, '0.2.0')
    } })
    const result = await manager.updatePlugins([selected], source)
    assert.deepEqual(new Set(result.packageIds), new Set([selected, legacy, child]))
    const installed = JSON.parse(await readFile(file))
    assert.equal(installed.dependencies[retired], undefined)
    assert(!installed.dsh.profile.bundles.includes(retired))
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('a historical tarball lock cannot re-resolve unchanged offline packages through the registry', async () => {
  const home = await mkdtemp(join(tmpdir(), 'zws-mixed-offline-'))
  const selected = '@zerowallscience/plugin-update-fixture'
  const legacy = '@zerowallscience/legacy-bundle-fixture'
  const child = '@zerowallscience/private-child-fixture'
  const pnpm = fileURLToPath(new URL('../../deepseek-harness/apps/desktop/node_modules/pnpm/bin/pnpm.cjs', import.meta.url))
  const runPnpm = (directory, args) => {
    const result = spawnSync(process.execPath, ['--expose-internals', pnpm, ...args, '--offline', '--ignore-scripts'], { cwd: directory, encoding: 'utf8', timeout: 60000 })
    assert.equal(result.status, 0, result.stdout + '\n' + result.stderr)
  }
  try {
    const pair = generateKeyPairSync('ed25519')
    const archives = {}
    for (const [id, dependencies] of [[legacy, { [child]: '^0.1.0' }], [child, {}], [selected, {}]]) {
      const directory = join(home, 'archives', id.split('/').at(-1))
      await mkdir(join(directory, 'package'), { recursive: true })
      await writeFile(join(directory, 'package/package.json'), JSON.stringify({ name: id, version: '0.1.0', dependencies }))
      const path = directory + '.tgz'
      await createArchive({ file: path, cwd: directory, gzip: true }, ['package'])
      archives[id] = path
    }
    await initializeProfile(home, [selected, legacy])
    const active = join(home, 'profiles/web')
    const file = join(active, 'package.json')
    const manifest = JSON.parse(await readFile(file))
    manifest.dependencies = { [legacy]: 'file:' + archives[legacy], [child]: 'file:' + archives[child] }
    await writeFile(file, JSON.stringify(manifest))
    await writeFile(join(active, 'pnpm-workspace.yaml'), yaml.stringify({ packages: ['.'], autoInstallPeers: false, overrides: { [legacy]: manifest.dependencies[legacy], [child]: manifest.dependencies[child] } }))
    runPnpm(active, ['install', '--no-frozen-lockfile'])
    // Desktop migration switched direct dependencies to the verified offline
    // runtime, but retained historical tarball overrides and resolver records.
    for (const [id, dependencies] of [[legacy, { [child]: 'workspace:^' }], [child, {}]]) {
      const directory = join(home, 'resources/offline/verified-generation/node_modules', id)
      await mkdir(directory, { recursive: true })
      await writeFile(join(directory, 'package.json'), JSON.stringify({ name: id, version: '0.1.1', dependencies }))
      manifest.dependencies[id] = 'file:' + directory.replaceAll('\\', '/')
    }
    manifest.zerowall = { disabledPlugins: [legacy] }
    await writeFile(file, JSON.stringify(manifest))
    const path = archives[selected]
    const resources = [{ id: selected, kind: 'plugin', version: '0.1.0', dependencies: {}, platform: ['win32'], architecture: ['x64'], desktopRange: { min: '8.1.3' }, dshRange: { min: target.dshVersion, max: target.dshVersion }, downloadUrl: pathToFileURL(path).href, size: (await readFile(path)).length, sha256: await fileDigest(path), restartRequired: true, rollbackSupported: true }]
    const source = join(home, 'catalog.json')
    await writeFile(source, JSON.stringify(signCatalog({ schema: 1, localOnly: true, resources }, pair.privateKey, 'test')))
    const manager = createResourceManager({ home, target, local: true, yaml, keys: { test: pair.publicKey }, stopHost: async () => {}, startHost: async () => {}, runPlugin: async (args, generation) => {
      const candidate = join(home, 'profiles', generation)
      runPnpm(candidate, args)
      for (const id of [legacy, child]) assert.equal(JSON.parse(await readFile(join(candidate, 'node_modules', id, 'package.json'))).version, '0.1.1')
      const lock = await readFile(join(candidate, 'pnpm-lock.yaml'), 'utf8')
      for (const id of [legacy, child]) assert(!lock.includes(archives[id].replaceAll('\\', '/')))
    } })
    await manager.updatePlugins([selected], source)
    const installed = JSON.parse(await readFile(file))
    assert.deepEqual(installed.dsh.profile.bundles, manifest.dsh.profile.bundles.filter(id => id !== legacy))
    assert.deepEqual(installed.zerowall, manifest.zerowall)
  } finally { await rm(home, { recursive: true, force: true }) }
})
