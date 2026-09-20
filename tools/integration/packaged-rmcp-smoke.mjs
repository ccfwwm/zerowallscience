import assert from 'node:assert/strict'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, open, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { randomUUID, createHash } from 'node:crypto'

const repo = resolve(import.meta.dirname, '../..')
const packaged = join(repo, 'desktop/dist/win-unpacked')
const resources = join(packaged, 'resources')
const output = join(repo, 'test-results/rmcp')
await mkdir(output, { recursive: true })
const work = await mkdtemp(join(tmpdir(), 'zerowall-rmcp-'))
const workspace = join(work, 'workspace'); await mkdir(workspace)
const profile = join(work, 'profile')
for (const name of ['harness', 'credentials', 'zerowall-python']) await mkdir(join(profile, name), { recursive: true })
const originalProfile = join(process.env.APPDATA, 'zerowall-science')
for (const name of ['Local State', 'harness/settings.yaml', 'credentials/vault.json', 'zerowall-python/current.json']) await copyFile(join(originalProfile, name), join(profile, name))
const yaml = createRequire(join(repo, '.build/runtime/package.json'))('yaml')
const settings = yaml.parse(await readFile(join(profile, 'harness/settings.yaml'), 'utf8'))
const model = settings['agent-default-model']
assert.ok(model?.provider && model?.model, 'Current model route required')
const token = execFileSync('ssh', ['rdatalinux', 'python3', '-'], { encoding: 'utf8', input: 'from pathlib import Path\nx=dict(line.split("=",1) for line in Path("/etc/rdatalinux-r-platform/platform.env").read_text().splitlines() if "=" in line and not line.startswith("#"))\nprint(x["R_PLATFORM_MCP_KEY"].strip("\\\"\'"))\n' }).trim()
const patchPath = join(resources, 'zerowall.patch.yml')
const originalPatch = await readFile(patchPath, 'utf8')
const fixture = join(resources, 'rmcp-acceptance-fixture.mjs')
const sessionId = randomUUID()
const project = `omicverse-host-${Date.now()}`
await writeFile(fixture, `
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
export const inject=['tools','agents','sessionController','zerowallMcp','zerowallProjects','settings','agentDefaultModel'];
export function apply(ctx) {
 const root=${JSON.stringify(work)}; let busy=false,agent;
 const timer=setInterval(async()=>{
  if(busy)return;busy=true;let request;
  try {
   request=JSON.parse(await readFile(join(root,'request.json'),'utf8'));await unlink(join(root,'request.json'));
   if(!agent){
    const selected=ctx.agentDefaultModel.currentSelection();
    if(selected.provider!==${JSON.stringify(model.provider)}||selected.model!==${JSON.stringify(model.model)})throw new Error('Default model differs: '+JSON.stringify({selected,path:ctx.settings.documentPath}));
    await ctx.sessionController.create({sessionId:${JSON.stringify(sessionId)},cwd:${JSON.stringify(workspace)}});agent=ctx.agents.get(${JSON.stringify(sessionId)});
    await writeFile(join(root,'route.json'),JSON.stringify({selected,options:agent.options}));
   }
   const run=(name,args,suffix)=>ctx.tools.execute({name,arguments:args,callId:request.id+suffix,agent,signal:new AbortController().signal});
   let result;
   if(request.name==='skill')result=await run(request.name,request.args,'-direct');
   else {const found=await run('tool_search',{query:request.name},'-search');if(found.isError)throw new Error(JSON.stringify(found));result=await run('tool_dispatch',{name:request.name,arguments:request.args},'-dispatch');}
   await writeFile(join(root,request.id+'.json'),JSON.stringify({result}));
  } catch(error) {if(request)await writeFile(join(root,request.id+'.json'),JSON.stringify({error:String(error)}));}
  finally {busy=false;}
 },100);
 ctx.effect(()=>()=>clearInterval(timer));
 writeFile(join(root,'ready'),'ready');
}
`)
let app, logs = ''
const report = { project, model, checks: [] }
const wait = async (fn, timeout=240000) => {
  const deadline=Date.now()+timeout
  while(Date.now()<deadline){const result=await fn();if(result)return result;if(app?.exitCode!==null&&app?.exitCode!==undefined)throw new Error('Desktop exited');await new Promise(r=>setTimeout(r,300))}
  throw new Error('Timed out waiting for packaged Host')
}
try {
  await writeFile(patchPath, originalPatch + `\n- insert:\n    - id: rmcp-acceptance-fixture\n      name: ${JSON.stringify(pathToFileURL(fixture).href)}\n`)
  app=spawn(join(packaged,'ZeroWallScience.exe'),[`--user-data-dir=${join(work,'chromium')}`],{cwd:packaged,windowsHide:true,stdio:'pipe',env:{...process.env,ZEROWALL_USER_DATA_DIR:profile,R_PLATFORM_MCP_AUTHORIZATION:`Bearer ${token}`,ZEROWALL_DEFER_DEFAULT_MCP:'1',ZEROWALL_PYTHON_MANIFEST:'http://127.0.0.1:1/no-update'}})
  app.stdout.on('data',x=>{logs+=x});app.stderr.on('data',x=>{logs+=x})
  await wait(()=>readFile(join(work,'ready'),'utf8').catch(()=>undefined))
  const call=async(name,args={})=>{
    const id=randomUUID();await writeFile(join(work,'request.json'),JSON.stringify({id,name,args}))
    const response=await wait(()=>readFile(join(work,id+'.json'),'utf8').then(JSON.parse,()=>undefined),600000)
    assert.ok(!response.error,response.error)
    assert.ok(!response.result?.isError,JSON.stringify(response.result))
    const value=response.result.value?.protocol==='dsh-progressive-tools/dispatch-v1'?response.result.value.value:response.result.value
    return value?.structuredContent??value
  }
  const flow=(action,workflow_id,parameters)=>call('research_workflow',{action,workflow_id,parameters})
  const finish=async(run)=>{
    const result=await wait(async()=>{const state=await call('research_workflow',{action:'status',run_id:run.run_id});return ['succeeded','failed','cancelled','timed_out'].includes(state.status)?state:undefined},1800000)
    assert.equal(result.status,'succeeded',JSON.stringify(result));return result
  }
  for(const name of ['zerowall-rmcp','zerowall-rplatform','zerowall-r-files','zerowall-r-packages','zerowall-geo','zerowall-nhanes','zerowall-rbioagent','zerowall-rplotfigure','sc-tenifold-knockout','zerowall-omicverse']){
    const skill=await call('skill',{name});assert.equal(skill.resourceBase.kind,'directory')
    const reference=await call('read',{file_path:join(skill.resourceBase.path,name==='zerowall-rmcp'?'references/conventions.md':'references/operations.md'),limit:15})
    assert.ok(reference);report.checks.push({skill:name,resourceBase:skill.resourceBase.path})
  }
  await call('mcp_connect',{server:'rmcp'})
  const status=await flow('query','omicverse',{operation:'omicverse.status',arguments:{}})
  assert.equal(status.gpu,false);report.environment=status
  const query=await call('research_workflow',{action:'search',workflow_id:'omicverse',query:'ov.utils.read',limit:3})
  assert.ok(JSON.stringify(query).includes('omicverse.native.ov.utils.read'))
  const run=await flow('run','r.compute',{operation:'r.submit.script',arguments:{project_id:project,code:'write.csv(data.frame(value=1:3),file.path(Sys.getenv("R_PLATFORM_RESULT_DIR"),"result.csv"),row.names=FALSE)',confirm:true},request_id:'host-r-script'})
  const completed=await finish(run);report.r=completed
  const again=await flow('run','r.compute',{operation:'r.submit.script',arguments:{project_id:project,code:'write.csv(data.frame(value=1:3),file.path(Sys.getenv("R_PLATFORM_RESULT_DIR"),"result.csv"),row.names=FALSE)',confirm:true},request_id:'host-r-script'})
  assert.equal(again.run_id,run.run_id)
  const remotePath=`.zerowall/jobs/${completed.remote_id}/result/result.csv`
  await call('r_files',{action:'download_workspace',project_id:project,remote_path:remotePath,local_path:'result.csv'})
  assert.match(await readFile(join(workspace,'result.csv'),'utf8'),/value/)
  if(process.env.RMCP_SKIP_LARGE!=='1'){
  const large=await open(join(workspace,'large.bin'),'w');const block=Buffer.alloc(1024*1024,37)
  for(let i=0;i<101;i++)await large.write(block)
  await large.close()
  const upload=await call('r_files',{action:'upload_workspace',project_id:project,local_path:'large.bin',remote_path:'acceptance/large.bin',confirm:true})
  const repeat=await call('r_files',{action:'upload_workspace',project_id:project,local_path:'large.bin',remote_path:'acceptance/large.bin',confirm:true})
  assert.equal(repeat.transferId,upload.transferId)
  const download=await call('r_files',{action:'download_workspace',project_id:project,remote_path:'acceptance/large.bin',local_path:'large-return.bin'})
  assert.equal(download.sha256,upload.sha256)
  assert.equal(createHash('sha256').update(await readFile(join(workspace,'large-return.bin'))).digest('hex'),upload.sha256)
  report.largeFile={bytes:upload.bytes,sha256:upload.sha256,resume:repeat.transferId===upload.transferId}
  }
  const native=await flow('run','omicverse',{operation:'omicverse.native.ov.utils.read',arguments:{project_id:project,session_id:'host',tool_arguments:{path:'data:OmicVerse/pbmc3k_raw.h5ad'},confirm:true},request_id:'native-read'})
  report.native=await finish(native)
  await flow('run','omicverse',{operation:'omicverse.close.session',arguments:{project_id:project,session_id:'host',confirm:true},request_id:'close-native'})
  const agent=await flow('run','omicverse',{operation:'omicverse.run.agent',arguments:{project_id:project,prompt:'Run Python to write a text file named model-check.txt containing the exact text OMICVERSE_AGENT_OK. Do not access other files or download data. Report the filename.',confirm:true},request_id:'agent-check'})
  report.agent=await finish(agent)
  const marker=report.agent.artifacts.find(x=>x.name.endsWith('/model-check.txt'))
  assert.ok(marker,'Agent must produce the requested file')
  await call('r_files',{action:'download_workspace',project_id:project,remote_path:marker.name,local_path:'model-check.txt'})
  assert.equal((await readFile(join(workspace,'model-check.txt'),'utf8')).trim(),'OMICVERSE_AGENT_OK')
  report.packages=await flow('query','r.packages',{operation:'r.list.packages',arguments:{}})
  report.nhanes=await finish(await flow('run','r.nhanes',{operation:'r.nhanes.survey.summary',arguments:{project_id:project,datasets:[{cycle:'2017-2018',domain:'Demographics',dataset:'DEMO_J',ensure_available:false}],variable:'RIDAGEYR',weight:'WTINT2YR',strata:'SDMVSTRA',psu:'SDMVPSU'},request_id:'nhanes-weighted-summary'}))
  const plan=await flow('run','figureya',{operation:'figureya.create.plan',arguments:{project_id:project,action:'plan',mode:'custom_r',code:'png("plot.png"); plot(1:3,c(2,4,7)); dev.off()',confirm:true},request_id:'figureya-plan'})
  report.figureyaPlan=plan
  const planId=plan.result.plan_id??plan.result.plan?.plan_id??plan.result.id
  assert.ok(planId,'FigureYa plan id')
  report.figureya=await finish(await flow('run','figureya',{operation:'figureya.run.plan',arguments:{project_id:project,plan_id:planId,confirm:true},request_id:'figureya-render'}))
  const plot=report.figureya.artifacts.find(x=>x.uri.endsWith('/plot.png'))
  assert.ok(plot,'FigureYa image artifact')
  await call('r_files',{action:'download_workspace',project_id:project,remote_path:decodeURIComponent(new URL(plot.uri).pathname.slice(1)),local_path:'figureya.png'})
  assert.equal((await readFile(join(workspace,'figureya.png'))).subarray(1,4).toString(),'PNG')
  const bio=await call('research_workflow',{action:'search',workflow_id:'biomni',query:'find_n_glycosylation_motifs',limit:5})
  assert.ok(JSON.stringify(bio).includes('biomni.tool.glycoengineering.find_n_glycosylation_motifs'))
  report.biomni=await finish(await flow('run','biomni',{operation:'biomni.tool.glycoengineering.find_n_glycosylation_motifs',arguments:{project_id:project,tool_arguments:{sequence:'NATNPSNVT'},confirm:true},request_id:'biomni-dynamic'}))
  assert.ok(report.biomni.artifacts.some(x=>x.uri.endsWith('/tool-result.json')),'Biomni artifact collected')
  report.geo=await finish(await flow('run','r.geo',{operation:'r.geo.download',arguments:{project_id:project,accession:'GSE1000',profile:'expression',include_suppl:false,dry_run:false},request_id:'geo-expression'}))
  report.conversion=await finish(await flow('run','r.compute',{operation:'r.convert.anndata',arguments:{project_id:project,input_path:report.native.artifacts.find(x=>x.name.endsWith('.h5ad')).name,direction:'h5ad_to_rds',confirm:true},request_id:'native-h5ad-to-rds'}))
  const countPrep=await finish(await flow('run','omicverse',{operation:'omicverse.run.python',arguments:{project_id:project,code:'import scanpy as sc\na=sc.read_h5ad(DATA_ROOT+"/OmicVerse/pbmc3k_raw.h5ad")\nsc.pp.filter_genes(a,min_cells=30)\na=a[:100,:120].copy()\na.var_names_make_unique()\na.to_df().T.to_csv("counts.csv")\nfrom pathlib import Path\nPath("target.txt").write_text(str(a.var_names[0]))',confirm:true},request_id:'knockout-real-input'}))
  const targetFile=countPrep.artifacts.find(x=>x.name.endsWith('/target.txt'))
  await call('r_files',{action:'download_workspace',project_id:project,remote_path:targetFile.name,local_path:'target.txt'})
  report.knockout=await finish(await flow('run','sc.knockout',{operation:'r.submit.sc.tenifold.knockout',arguments:{project_id:project,input_path:countPrep.artifacts.find(x=>x.name.endsWith('/counts.csv')).name,output_path:'knockout-acceptance',target:(await readFile(join(workspace,'target.txt'),'utf8')).trim(),parameters:{nc_nNet:2,nc_nCells:100,td_K:2,qc_minLSize:0,qc_mtThreshold:1},confirm:true},request_id:'knockout-real-subset'}))
  const knockoutTable=report.knockout.artifacts.find(x=>x.uri.endsWith('/diff-regulation.tsv'))
  assert.ok(knockoutTable,'scTenifold artifact collected')
  await call('r_files',{action:'download_workspace',project_id:project,remote_path:decodeURIComponent(new URL(knockoutTable.uri).pathname.slice(1)),local_path:'diff-regulation.tsv'})
  report.ok=true
  console.log(JSON.stringify({ok:true,project,output}))
} catch(error) {
  report.error=String(error)
  throw error
} finally {
  await writeFile(join(output,'packaged-host.json'),JSON.stringify(report,null,2))
  await writeFile(join(output,'launcher.log'),logs.replaceAll(token,'[REDACTED]'))
  if(app?.pid)spawnSync('taskkill',['/pid',String(app.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'})
  await writeFile(patchPath,originalPatch)
  await rm(fixture,{force:true})
  await rm(work,{recursive:true,force:true,maxRetries:5,retryDelay:300})
}
