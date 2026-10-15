import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join, resolve, delimiter } from 'node:path'
import { pathToFileURL } from 'node:url'
const installation=resolve(process.argv[2]), output=resolve(process.argv[3]), source=process.argv[4]
const selectedPlugins=process.argv[5]?.split(',')??['@zerowallscience/plugin-account','@zerowallscience/plugin-ai-cloud']
const expectedVersion=process.argv[6]
const expectedVersions=expectedVersion?.trim().startsWith('{')?JSON.parse(expectedVersion):Object.fromEntries(selectedPlugins.map(id=>[id,expectedVersion]))
assert(expectedVersions&&typeof expectedVersions==='object'&&!Array.isArray(expectedVersions),'Expected plugin versions must be a version string or an ID-to-version JSON object')
if(expectedVersion)for(const id of selectedPlugins)assert(typeof expectedVersions[id]==='string'&&expectedVersions[id].length>0,'Missing expected version for '+id)
const commands=join(installation,'resources/commands'), executable=join(installation,'ZeroWallScience.exe'), asar=join(installation,'resources/app.asar')
const core=createRequire(join(asar,'package.json')), json=async path=>JSON.parse(await readFile(path,'utf8'))
const {initializeProfile}=await import(pathToFileURL(join(commands,'profile.mjs')))
const {prepareOfflineCandidate}=await import(pathToFileURL(join(commands,'offline-profile.mjs')))
const {createResourceManager}=await import(pathToFileURL(join(commands,'resource-manager.mjs')))
const home=join(output,'harness'), defaults=await json(join(commands,'default-plugins.json')), bundled=await json(join(commands,'bundled-plugins.json')), keys=await json(join(commands,'trusted-keys.json'))
const pin=await json(join(installation,'resources/licenses/deepseek-harness.version.json'))
const appPackage=await json(join(asar,'package.json'))
assert.equal(typeof appPackage.version,'string','Packaged desktop version is missing')
const target={desktopVersion:appPackage.version,dshVersion:pin.version,dshCommit:pin.commit,platform:process.platform,architecture:process.arch}
await mkdir(output,{recursive:true});await initializeProfile(home,defaults,bundled)
const prepared=await prepareOfflineCandidate({home,source:join(installation,'resources/offline-profile'),keys,target,defaults,bundledPlugins:bundled,yaml:core('yaml')})
assert.equal(prepared.blocked.length,0)
await rename(join(home,'profiles/web'),join(home,'profiles/initial'));await rename(prepared.candidate,join(home,'profiles/web'))
let child,starts=0,stops=0,failHealth=false
const receipt={complete:false,checks:[]}
const wait=ms=>new Promise(r=>setTimeout(r,ms))
const env={...process.env,ELECTRON_RUN_AS_NODE:'1',DSH_HOME:home,ZEROWALL_USER_DATA_DIR:output,NODE_PATH:[join(asar,'node_modules'),join(home,'profiles/web/node_modules')].join(delimiter),ZEROWALL_RUNTIME_ANCHOR:pathToFileURL(join(asar,'package.json')).href,ZEROWALL_PROFILE_ANCHOR:pathToFileURL(join(home,'profiles/web/package.json')).href,ZEROWALL_DEFER_DEFAULT_MCP:'1',DSH_TELEMETRY_DISABLED:'1',NO_COLOR:'1'}
const stopHost=async()=>{if(child?.pid&&child.exitCode===null){stops++;spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await wait(200)}}
const startHost=async()=>{
  starts++
  const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r))
  let diagnostic='', cookie=''
  child=spawn(executable,['--import',pathToFileURL(join(asar,'runtime/runtime-esm-register.mjs')).href,'--expose-internals',join(asar,'runtime/harness-node-entry.mjs'),join(asar,'node_modules/@deepseek-ai/dsh/lib/bin.js'),'web','--patch',join(installation,'resources/zerowall.patch.yml'),'--host','127.0.0.1','--port',String(port),'--no-open'],{env,cwd:output,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']})
  child.stdout.on('data',x=>diagnostic=(diagnostic+x).slice(-80000));child.stderr.on('data',x=>diagnostic=(diagnostic+x).slice(-80000))
  child.on('message',message=>{if(message?.kind==='zerowall-secret-request')child.send({kind:'zerowall-secret-response',requestId:message.requestId,ok:message.operation==='get'})})
  const until=Date.now()+120000;let last=''
  while(Date.now()<until&&child.exitCode===null){
    const token=/https?:\/\/127\.0\.0\.1:\d+\/?\?token=([A-Za-z0-9_-]+)/u.exec(diagnostic)?.[1]
    if(token)try{
      if(!cookie){const exchange=await fetch(`http://127.0.0.1:${port}/?token=${token}`,{redirect:'manual',signal:AbortSignal.timeout(5000)});cookie=exchange.headers.getSetCookie().map(value=>value.split(';')[0]).filter(value=>value.startsWith('dsh-auth-')).join('; ')}
      const response=await fetch(`http://127.0.0.1:${port}/api/pluginInventory/list`,{method:'POST',headers:{'content-type':'application/json',Cookie:cookie,Origin:`http://127.0.0.1:${port}`},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method:'pluginInventory/list',payload:{args:{}}}),signal:AbortSignal.timeout(3000)})
      const value=await response.json(), entries=value.result?.value?.entries??value.result?.value
      if(Array.isArray(entries)&&selectedPlugins.every(id=>entries.some(e=>e.moduleName===id&&e.fiberPhase==='active'))){if(failHealth){failHealth=false;throw new Error('Injected health failure after actual Host activation')}return}
    }catch(error){if(error.message.startsWith('Injected'))throw error;last=error.message}
    await wait(300)
  }
  throw new Error('Actual candidate Host health failed: '+last+'\n'+diagnostic.replace(/([?&]token=)[^\s&]+/gu,'$1[redacted]'))
}
const manager=createResourceManager({home,keys,target,defaultPlugins:defaults,bundledPlugins:bundled,runtimeModules:join(asar,'node_modules'),yaml:core('yaml'),stopHost,startHost,callHost:async()=>{},
  runPlugin:async(args,profile)=>{
    const result=spawnSync(executable,['--expose-internals',join(commands,'dsh.mjs'),'plugin','--profile',profile,...args],{env,cwd:output,windowsHide:true,encoding:'utf8',timeout:300000,maxBuffer:4*1024**2})
    if(result.status!==0)throw new Error('Real pnpm candidate preparation failed: '+result.stderr+'\n'+result.stdout)
  }})
try{
  await startHost();const before=await readFile(join(home,'profiles/web/package.json'),'utf8'), initialStarts=starts,initialStops=stops
  const updated=await manager.updatePlugins(selectedPlugins,source)
  assert.equal(updated.updated,selectedPlugins.length);assert.equal(starts-initialStarts,1);assert.equal(stops-initialStops,1)
  for(const id of selectedPlugins)if(expectedVersion)assert.equal((await json(join(home,'profiles/web/node_modules',id,'package.json'))).version,expectedVersions[id])
  receipt.checks.push({name:'real signed plugin update, actual pnpm, one Host activation',desktopVersion:target.desktopVersion,plugins:selectedPlugins,expectedVersion,expectedVersions,updated,starts:starts-initialStarts,stops:stops-initialStops})
  await manager.rollback();assert.equal(await readFile(join(home,'profiles/web/package.json'),'utf8'),before)
  receipt.checks.push({name:'real complete-profile rollback',complete:true})
  failHealth=true
  await assert.rejects(manager.updatePlugins(selectedPlugins,source),/Injected health failure/u)
  assert.equal(await readFile(join(home,'profiles/web/package.json'),'utf8'),before)
  receipt.checks.push({name:'candidate health failure restores old profile and live Host',complete:true});receipt.complete=true
}catch(error){receipt.error=error.stack??String(error);throw error}
finally{await stopHost();await writeFile(join(output,'batch-receipt.json'),JSON.stringify(receipt,null,2))}
