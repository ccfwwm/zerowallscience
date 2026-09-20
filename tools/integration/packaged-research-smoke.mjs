import { spawn, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { chromium } from '../../desktop/node_modules/playwright/index.mjs'

const repo = resolve(import.meta.dirname, '../..')
// Verify the unpacked directory emitted by the current local 6.7.0 package
// build. The historical .build/skills-mcp-package directory can contain an
// older installer snapshot and must not be used as release evidence.
const packaged = resolve(repo, 'desktop/dist/win-unpacked')
const resources = join(packaged, 'resources')
const output = join(repo, 'test-results/skills-mcp/packaged')
await mkdir(output, { recursive: true })
const work = await mkdtemp(join(tmpdir(), 'zerowall-research-desktop-'))
const workspace = join(work, 'workspace'); await mkdir(workspace)
const sessionId = randomUUID()
const patchPath = join(resources, 'zerowall.patch.yml')
const originalPatch = await readFile(patchPath, 'utf8')
const fixturePath = join(resources, 'research-smoke-fixture.mjs')
// A fixture-only file queue avoids adding a debug endpoint to the product.
await writeFile(fixturePath, `
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
export const inject=['tools','agents','agentLoop','sessionTitle','zerowallMcp','zerowallProjects'];
export function apply(ctx) {
 let busy=false; let agent;
 const root=${JSON.stringify(work)};
 const timer=setInterval(async()=>{
  if(busy)return; busy=true;
  let request;
  try {
   request=JSON.parse(await readFile(join(root,'request.json'),'utf8')); await unlink(join(root,'request.json'));
   if(!agent) {agent=ctx.agents.get(${JSON.stringify(sessionId)}) ?? await ctx.agentLoop.create(${JSON.stringify(sessionId)},{},{cwd:${JSON.stringify(workspace)}});ctx.sessionTitle.rename(agent.session,'Research smoke');}
   let result;
   if(request.name==='connect') {
    await ctx.zerowallMcp.list();
    const row=ctx.zerowallProjects.listMcpServers().find(r=>r.serverName==='zerowall_managed_ketcher');
    if(!row)throw new Error('Missing Ketcher record');
    await ctx.zerowallMcp.update({id:row.id,changes:{enabled:true}});
    await ctx.zerowallMcp.ensureConnected(row.serverName); result={sessionId:agent.id};
   } else {
    const run=(name,args,suffix)=>ctx.tools.execute({name,arguments:args,callId:request.id+suffix,agent,signal:new AbortController().signal});
    const search=await run('tool_search',{query:request.name},'-search');
    if(search.isError)throw new Error(JSON.stringify(search));
    result=await run('tool_dispatch',{name:request.name,arguments:request.args},'-dispatch');
   }
   await writeFile(join(root,request.id+'.json'),JSON.stringify({result}));
  } catch(error) {if(request)await writeFile(join(root,request.id+'.json'),JSON.stringify({error:String(error)}));}
  finally {busy=false;}
 },100);
 ctx.effect(()=>()=>clearInterval(timer));
}
`)
let app, browser, page
try {
  await writeFile(patchPath, originalPatch + `\n- insert:\n    - id: research-smoke-fixture\n      name: ${JSON.stringify(pathToFileURL(fixturePath).href)}\n`)
  const profile = join(work, 'profile'); await mkdir(join(profile, 'zerowall-python'), { recursive: true })
  const installed = JSON.parse(await readFile(join(process.env.APPDATA, 'zerowall-science/zerowall-python/current.json'), 'utf8'))
  await writeFile(join(profile, 'zerowall-python/current.json'), JSON.stringify(installed))
  for (const name of ['appdata', 'localappdata']) await mkdir(join(work, name))
  app = spawn(join(packaged, 'ZeroWallScience.exe'), ['--remote-debugging-port=0', `--user-data-dir=${join(work,'chromium')}`], { cwd: packaged, windowsHide: true, stdio: 'pipe', env: { ...process.env, ZEROWALL_USER_DATA_DIR: profile, APPDATA: join(work,'appdata'), LOCALAPPDATA: join(work,'localappdata'), USERPROFILE: work, HOME: work, ZEROWALL_PYTHON_MANIFEST: 'http://127.0.0.1:1/no-update' } })
  let logs = ''; app.stdout.on('data', x => { logs += x }); app.stderr.on('data', x => { logs += x })
  const until = async (fn, timeout = 90000) => { const deadline=Date.now()+timeout; while(Date.now()<deadline) { const result=await fn(); if(result)return result; if(app.exitCode!==null)throw new Error('Desktop exited: '+logs.slice(-2000)); await new Promise(r=>setTimeout(r,200)) } throw new Error('Timed out: '+logs.slice(-4000)) }
  const endpoint = await until(()=>/DevTools listening on (ws:\/\/\S+)/u.exec(logs)?.[1])
  browser = await chromium.connectOverCDP(endpoint)
  page = await until(()=>browser.contexts()[0]?.pages().find(p=>p.url().startsWith('http://127.0.0.1')))
  page.on('console', msg => console.log('[renderer]', msg.type(), msg.text()))
  page.on('pageerror', error => console.log('[renderer-error]', String(error)))
  await page.getByText('ZeroWall Science', { exact: true }).first().waitFor({timeout:120000})
  const notice = page.getByRole('dialog',{name:'内测声明'})
  await notice.waitFor({timeout:30000}).catch(()=>{})
  if(await notice.isVisible())await notice.getByRole('button',{name:'继续',exact:true}).click()
  const credentials = page.getByRole('dialog',{name:'添加一个 API Key 开始使用'})
  await credentials.waitFor({timeout:10000}).catch(()=>{})
  if(await credentials.isVisible())await credentials.getByRole('button',{name:'稍后配置'}).click()
  const call=async(name,args={})=>{
    const id=randomUUID()
    await writeFile(join(work,'request.json'),JSON.stringify({id,name,args}))
    const response=await until(()=>readFile(join(work,id+'.json'),'utf8').then(JSON.parse,()=>undefined))
    assert.ok(!response.error,response.error)
    const result=response.result
    assert.ok(!result?.isError,JSON.stringify(result))
    return result.value?.protocol === 'dsh-progressive-tools/dispatch-v1'
      ? {value:result.value.value,content:result.content} : result
  }
  await page.evaluate(async ({sessionId, cwd}) => {
    const method='session/create'
    const r=await fetch('/api/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method,payload:{args:{request:{sessionId,cwd}}}})})
    if(!r.ok) throw new Error('Session create failed '+r.status)
    const created = await r.json()
    if (!created.result?.ok) throw new Error(JSON.stringify(created))
    const renamed = await fetch('/api/session/rename', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method:'session/rename',payload:{args:{request:{sessionId,title:'Research smoke'}}}})})
    const result = await renamed.json()
    if (!result.result?.ok) throw new Error(JSON.stringify(result))
  },{sessionId,cwd:workspace})
  await call('connect')
  // Exercise Harness' supported persisted session restore. Blank sessions
  // deliberately render as "New session", even after a title rename.
  await page.evaluate(id => localStorage.setItem('dsh.sessions.current', JSON.stringify({sessionId:id})), sessionId)
  await page.reload({waitUntil:'domcontentloaded', timeout:90000})
  await credentials.waitFor({timeout:30000}).catch(()=>{})
  if(await credentials.isVisible())await credentials.getByRole('button',{name:'稍后配置'}).click()
  await page.getByRole('treeitem', {selected:true}).first().waitFor({timeout:90000})
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('dsh.sessions.current')).sessionId),sessionId)
  // The editor must work with browser access to external hosts blocked.
  await page.route('**/*',route=>{
    const url=new URL(route.request().url())
    return ['127.0.0.1','localhost','[::1]'].includes(url.hostname) || !/^https?:$/.test(url.protocol)
      ? route.continue() : route.abort('internetdisconnected')
  })
  console.log('Using the created session scope; opening Ketcher')
  const opening=call('mcp__zerowall_managed_ketcher__open_sketcher',{smiles:'N[C@@H](C)C(=O)O'})
  const opened=await opening
  const value=opened.value?.structuredContent ?? opened.value
  const artifact=value.artifact_id
  assert.ok(artifact,JSON.stringify(opened))
  const frame=await until(()=>page.frames().find(f=>/127\.0\.0\.1:\d+\/#/u.test(f.url())))
  await frame.waitForFunction(()=>!!window.ketcher)
  const get=async()=>{const r=await call('mcp__zerowall_managed_ketcher__get_structure',{artifact_id:artifact,format:'smiles'});return (r.value?.structuredContent??r.value).structure}
  assert.match(await get(),/@/u)
  await page.screenshot({path:join(output,'ketcher-stereochemistry.png')})
  await call('mcp__zerowall_managed_ketcher__set_structure',{artifact_id:artifact,structure:'c1ccccc1O'})
  await call('mcp__zerowall_managed_ketcher__highlight_atoms',{artifact_id:artifact,atoms:[0],color:'#ff8800'})
  // Perform a user-style canvas edit with Ketcher's own toolbar and pointer.
  await frame.getByRole('button',{name:'Clear Canvas (Ctrl+Del)',exact:true}).click()
  await frame.locator('body').press('Escape')
  await frame.locator('body').press('1')
  const canvas=frame.locator('[data-testid="canvas"]:visible')
  const box=await canvas.boundingBox()
  assert.ok(box,'Ketcher drawing canvas must be visible')
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2)
  const manuallyEdited=await get()
  assert.match(manuallyEdited,/C/u)
  assert.ok(!manuallyEdited.includes('O'),'Pointer edit must replace the phenol structure')
  const exported=await call('mcp__zerowall_managed_ketcher__export_structure',{artifact_id:artifact,format:'mol',filename:'desktop.mol'})
  const mol=await readFile(join(workspace,'desktop.mol'),'utf8')
  assert.ok(mol.includes('V3000'))
  await writeFile(join(output,'desktop.mol'),mol)
  await page.screenshot({path:join(output,'ketcher-desktop.png')})
  await call('mcp__zerowall_managed_ketcher__close_sketcher',{artifact_id:artifact})
  await call('mcp__zerowall_managed_ketcher__open_sketcher',{artifact_id:artifact})
  assert.equal(await get(),manuallyEdited)
  const bio=await call('bio_local',{action:'run',operation:'seq_translate',arguments:{sequence:'ATGGCCATTGTA'}})
  assert.equal(bio.value?.result?.protein,'MAIV')
  const python=await call('python_environment',{action:'info'})
  assert.equal(python.value?.version,'3.12.10')
  await writeFile(join(output,'result.json'),JSON.stringify({ok:true,offlineEditor:true,manualStructure:manuallyEdited,reopenVerified:true,artifact,exported:exported.value,bio:bio.value,pythonVersion:python.value.version},null,2))
  console.log(JSON.stringify({ok:true,output}))
} catch(error) {
  await page?.screenshot({path:join(output,'failure.png')}).catch(()=>{})
  await writeFile(join(output,'failure-dom.html'),await page?.content().catch(()=>'') ?? '')
  const editorFrame=page?.frames().find(f=>/127\.0\.0\.1:\d+\/#/u.test(f.url()))
  if(editorFrame)await writeFile(join(output,'failure-editor.html'),await editorFrame.content().catch(()=>''))
  await writeFile(join(output,'host.log'),await readFile(join(work,'profile/logs/harness.log'),'utf8').catch(()=>''))
  throw error
} finally {
  if(app?.pid)spawnSync('taskkill',['/pid',String(app.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'})
  await browser?.close().catch(()=>{})
  await writeFile(patchPath,originalPatch);await rm(fixturePath,{force:true})
  await rm(work,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{})
}
