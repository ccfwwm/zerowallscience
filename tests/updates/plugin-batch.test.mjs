import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import * as yaml from 'yaml'
import { c as createArchive } from 'tar'
import { signCatalog, fileDigest } from '../../tools/release/resource-catalog.mjs'
import { initializeProfile } from '../../tools/commands/profile.mjs'
import { createResourceManager } from '../../tools/commands/resource-manager.mjs'
const target = { desktopVersion: '8.1.3', dshVersion: '0.2.0-rc.2', platform: 'win32', architecture: 'x64' }

async function fixture(run, mode) {
  const home = await mkdtemp(join(tmpdir(), 'zws-batch-'))
  try {
    const pair = generateKeyPairSync('ed25519'); const ids = ['a', 'b', 'shared'].map(x => `@zerowallscience/plugin-${x}`)
    await initializeProfile(home, ids.slice(0, 2))
    const resources = []
    for (const id of ids) {
      const path = join(home, id.split('-').at(-1) + '.tgz'); await writeFile(path, id)
      resources.push({ id, kind: 'plugin', version: '0.1.0', platform: ['win32'], architecture: ['x64'], desktopRange: { min: '8.1.3' }, dshRange: { min: target.dshVersion, max: target.dshVersion }, downloadUrl: pathToFileURL(path).href, size: Buffer.byteLength(id), sha256: await fileDigest(path), dependencies: id === ids[2] ? {} : { [ids[2]]: '0.1.0' }, restartRequired: true, rollbackSupported: true })
    }
    const source = join(home, 'catalog.json'); await writeFile(source, JSON.stringify(signCatalog({ schema: 1, localOnly: true, resources }, pair.privateKey, 'test')))
    const calls = []; let starts = 0
    const abort = new AbortController()
    const manager = createResourceManager({ home, target, local: true, keys: { test: pair.publicKey },
      runPlugin: async (args, generation) => {
        calls.push(['prepare', ...args]); if (mode === 'prepare-failure') throw new Error('preparation failed')
        const path = join(home, 'profiles', generation, 'package.json'); const manifest = JSON.parse(await readFile(path)); manifest.batch = ['a','b']; await writeFile(path, JSON.stringify(manifest))
      }, stopHost: async () => { calls.push(['stop']) }, startHost: async () => { calls.push(['start']); if (mode === 'health-failure' && starts++ === 0) throw new Error('health failed') }, callHost: async () => {} })
    await run({ home, manager, ids, source, calls, abort })
  } finally { await rm(home, { recursive: true, force: true }) }
}
test('two plugins with shared closure prepare once and activate with one Host restart', () => fixture(async f => {
  const progress = []
  const result = await f.manager.updatePlugins([f.ids[0], f.ids[1], f.ids[0]], f.source, { report: value => progress.push(value) })
  assert.equal(result.updated, 2)
  assert.equal(progress.filter(x => x.phase === 'preparing').length, 3)
  assert.deepEqual(f.calls.map(x => x[0]), ['prepare', 'stop', 'start'])
  assert.equal(f.calls[0].length, 4)
}))
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

test('a signed closure absent from the old profile installs with real pnpm offline and keeps unrelated selections', async()=>{
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
  await writeFile(join(home,'profiles/web/pnpm-workspace.yaml'),yaml.stringify({packages:['.'],autoInstallPeers:false,nodeLinker:'hoisted',overrides:{'dsh-auto-review':'file:retired.tgz',custom:'1.2.3'}}))
  const source=join(home,'catalog.json');await writeFile(source,JSON.stringify(signCatalog({schema:1,localOnly:true,resources},pair.privateKey,'test')))
  const before=JSON.parse(await readFile(join(home,'profiles/web/package.json')))
  const manager=createResourceManager({home,target,local:true,yaml,keys:{test:pair.publicKey},stopHost:async()=>{},startHost:async()=>{},runPlugin:async(args,generation)=>{
   const candidate=join(home,'profiles',generation),manifest=JSON.parse(await readFile(join(candidate,'package.json'))),workspace=yaml.parse(await readFile(join(candidate,'pnpm-workspace.yaml'),'utf8'))
   assert.match(manifest.dependencies[sidebar],/^file:.*\.tgz$/)
   assert.equal(manifest.dependencies[peer],before.dependencies[peer])
   assert.equal(workspace.overrides['dsh-auto-review'],undefined)
   assert.equal(workspace.overrides.custom,'1.2.3')
   assert.equal(args.length,2)
   const pnpm=new URL('../../deepseek-harness/apps/desktop/node_modules/pnpm/bin/pnpm.cjs',import.meta.url)
   const result=spawnSync(process.execPath,['--expose-internals',pnpm.pathname.replace(/^\/(?:([A-Za-z]:))/,'$1'),...args,'--offline','--ignore-scripts'],{cwd:candidate,encoding:'utf8',timeout:60000})
   assert.equal(result.status,0,result.stdout+'\n'+result.stderr)
   assert.equal(JSON.parse(await readFile(join(candidate,'node_modules',sidebar,'package.json'))).version,version)
  }})
  await manager.updatePlugins([account],source)
  const after=JSON.parse(await readFile(join(home,'profiles/web/package.json')))
  assert.deepEqual(after.dsh.profile.bundles,before.dsh.profile.bundles)
 }finally{await rm(home,{recursive:true,force:true})}
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
