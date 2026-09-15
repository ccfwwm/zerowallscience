// Exercise the packaged web profile, capability policy and workspace file
// bridge together. Only the external R MCP transport is replaced by a local
// fixture; the test never calls a model or uploads user data.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:net'
import { locatePackagedApp } from './packaged-app.mjs'

const desktop = resolve(import.meta.dirname, '..')
const packaged = await locatePackagedApp(desktop)
const root = await mkdtemp(join(tmpdir(), 'zerowall-soak-'))
const artifact = resolve(desktop, 'dist/verification-6.0.0/host-soak.json')
await mkdir(resolve(desktop, 'dist/verification-6.0.0'), { recursive: true })
const duration = Number(process.env.ZEROWALL_SOAK_MS ?? 20 * 60_000)
const asar = join(packaged.resourcesRoot, 'app.asar')
const entry = join(asar, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
const fixture = join(root, 'fixture.mjs')
const metrics = join(root, 'metrics.jsonl')
await writeFile(join(root, 'sample.txt'), 'gene\tvalue\nSTAT1\t4\n')
const moduleUrl = name => pathToFileURL(join(asar, 'node_modules/@deepseek-ai', name, 'lib/index.js')).href
await writeFile(fixture, `
import { appendFile } from 'node:fs/promises';
import { defineTool } from ${JSON.stringify(moduleUrl('dsh-tools'))};
import { SessionId } from ${JSON.stringify(moduleUrl('dsh-session'))};
import { ToolCallId } from ${JSON.stringify(moduleUrl('dsh-llm'))};
export const inject = ['tools','sessions','systemPrompt','zerowallMcp'];
export function apply(ctx) {
 let checks=0, forwards=0, ticks=0, running=false, disposed=false;
 const ensure=ctx.zerowallMcp.ensureConnected;
 ctx.zerowallMcp.ensureConnected=async()=>{if(++checks>8)throw new Error('recursive file dispatch');};
 ctx.tools.register(defineTool({name:'mcp__rmcp__r_files',description:'local soak transport',
 parameters:{action:{type:'string',required:true},arguments:{type:'json',required:true}},
 output:{schema:{type:'object',additionalProperties:true},render:()=>[{type:'text',text:'ok'}]},
 execute:async args=>{forwards++;if(args.action!=='r.upload.file')throw new Error('unexpected transport action');return {ok:true};}}));
 const session=ctx.sessions.create(SessionId('soak-files'),{meta:{cwd:process.cwd()}});
 const owner={ctx,id:'soak-agent',session};
 const tick=async()=>{
  if(running||disposed)return;running=true;
  try {
   await ctx.systemPrompt.assemble({scope:owner});
   for(let n=0;n<10;n++){
    checks=0;const before=forwards;
    const result=await ctx.tools.execute({agent:owner,name:'r_files',
     callId:ToolCallId('soak-'+ticks+'-'+n),signal:AbortSignal.timeout(10000),
     arguments:{action:'upload_workspace',project_id:'fixture',local_path:'sample.txt',remote_path:'sample.txt',confirm:true}});
    if(result.isError||checks!==1||forwards!==before+1)throw new Error('bridge did not forward exactly once: '+JSON.stringify(result));
   }
   ticks++;
   await appendFile(${JSON.stringify(metrics)},JSON.stringify({at:Date.now(),ticks,uploads:forwards,...process.memoryUsage(),listeners:process.listenerCount('message')})+'\\n');
  }catch(error){await appendFile(${JSON.stringify(metrics)},JSON.stringify({error:String(error)})+'\\n');}
  finally{running=false;}
 };
 const timer=setInterval(()=>void tick(),30000);void tick();
 ctx.effect(()=>()=>{disposed=true;clearInterval(timer);ctx.zerowallMcp.ensureConnected=ensure;});
}
`)
const patch = join(root, 'soak.patch.yml')
await writeFile(patch, JSON.stringify([{ id: 'soak-file-bridge', name: pathToFileURL(fixture).href }]))
const socket = createServer()
await new Promise(r => socket.listen(0, '127.0.0.1', r))
const port = socket.address().port
await new Promise(r => socket.close(r))
const child = spawn(packaged.executablePath, [
 '--import', pathToFileURL(join(asar, 'runtime/runtime-esm-register.mjs')).href,
 '--expose-internals', join(asar, 'runtime/harness-node-entry.mjs'), entry,
 'web', '--patch', join(packaged.resourcesRoot, 'zerowall.patch.yml'), '--patch', patch,
 '--host', '127.0.0.1', '--port', String(port), '--no-open',
], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: {
 ...process.env, ELECTRON_RUN_AS_NODE:'1', NODE_PATH:join(asar,'node_modules'),
 ZEROWALL_RUNTIME_ANCHOR:pathToFileURL(entry).href, DSH_HOME:join(root,'harness'),
 USERPROFILE:root, HOME:root, DSH_AGENTS_HOME:join(root,'.agents'),
 ZEROWALL_USER_DATA_DIR:root, ZEROWALL_USER_SKILLS:join(root,'skills'),
 ZEROWALL_BUNDLED_SKILLS:join(packaged.resourcesRoot,'skills'),
 DSH_BUNDLED_SKILL_DIR:join(packaged.resourcesRoot,'skills'),
 ZEROWALL_RESEARCH_DB:join(root,'research.sqlite'), ZEROWALL_DISABLE_DEFAULT_MCP:'1',
 DSH_TELEMETRY_DISABLED:'1',
} })
let output=''
const capture=chunk=>{output=(output+chunk.toString()).slice(-30000)}
child.stdout.on('data',capture);child.stderr.on('data',capture)
child.on('message', msg=>{
 if(msg?.kind==='zerowall-secret-request')child.send({kind:'zerowall-secret-response',requestId:msg.requestId,ok:true})
})
const started=Date.now(); const rpcSamples=[]
try {
 let cookie; let readyAt
 while(Date.now()-started < duration+(readyAt===undefined?120000:readyAt-started)) {
  assert.equal(child.exitCode,null,'Host exited during soak')
  const text=await readFile(metrics,'utf8').catch(()=>'')
  const samples=text.trim().split('\n').filter(Boolean).map(JSON.parse)
  assert(!samples.some(x=>x.error), samples.find(x=>x.error)?.error)
  if(samples.length>0 && readyAt===undefined)readyAt=Date.now()
  const token=/\?token=([A-Za-z0-9_-]+)/.exec(output)?.[1]
  if(token && !cookie){const r=await fetch('http://127.0.0.1:'+port+'/?token='+token,{redirect:'manual'});cookie=r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ')}
  if(cookie && readyAt){
   for(const method of ['zerowallCapabilities/listSkills','zerowallMcp/list']){
    const at=Date.now();const r=await fetch('http://127.0.0.1:'+port+'/api/'+method,{method:'POST',headers:{'content-type':'application/json',cookie,origin:'http://127.0.0.1:'+port},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method,payload:{args:{}}}),signal:AbortSignal.timeout(10000)});
    const envelope=await r.json();assert.equal(envelope.result?.ok,true,method);assert(Array.isArray(envelope.result.value),method);
    if(method!=='zerowallMcp/list')assert(envelope.result.value.length>0,method+' empty');
    rpcSamples.push({method,ms:Date.now()-at,count:envelope.result.value.length});
   }
  }
  await writeFile(artifact,JSON.stringify({complete:false,elapsedMs:Date.now()-started,pid:child.pid,root,samples,rpcSamples},null,2))
  if(!readyAt && Date.now()-started>120000)throw new Error('Soak fixture did not mount: '+output.replace(/token=\S+/g,'token=[redacted]'))
  await new Promise(r=>setTimeout(r,10000))
 }
 const samples=(await readFile(metrics,'utf8')).trim().split('\n').map(JSON.parse)
 const stable=samples.filter((_,i)=>i>=Math.min(4, samples.length-1))
 assert(stable.length>0,'missing settled samples')
 const first=stable[0],last=stable.at(-1)
 assert(last.heapUsed-first.heapUsed<128*1024*1024,'heap retained over 128 MiB after warmup')
 assert(Math.max(...samples.map(s=>s.heapUsed))<768*1024*1024,'Host heap exceeded 768 MiB')
 assert.equal(last.listeners,first.listeners,'process listeners grew')
 await writeFile(artifact,JSON.stringify({complete:true,elapsedMs:Date.now()-started,samples,rpcSamples},null,2))
 console.log(JSON.stringify({artifact,uploads:last.uploads,seconds:(Date.now()-started)/1000,heapMiB:Math.round(last.heapUsed/1048576)}))
} finally {
 if(child.exitCode===null)spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})
 await writeFile(join(root,'host.log'),output.replace(/token=\S+/g,'token=[redacted]'))
}
