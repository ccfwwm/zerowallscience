import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { expect, it } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import Projects from '../../projects/src/host/index.js'
import Mcp from '../../mcp/src/host/index.js'
import * as Research from '../src/host/index.js'

/** Opt-in, real public receptor + ethanol test. Leaves its own project/run evidence. */
it.runIf(process.env.ZEROWALL_LIVE_DOCKING === '1')('executes public receptor/ethanol through UI, authenticated Host workflow and r_files, then restores a verified pose', async () => {
  assert.ok(process.env.R_PLATFORM_MCP_AUTHORIZATION, 'Configure Host rmcp credentials before running.')
  const repo=resolve('../..');const root=join(repo,'.build/molecule-docking-live',new Date().toISOString().replaceAll(':','-'));await mkdir(root,{recursive:true})
  const sourceUrl='https://api.github.com/repos/ccsb-scripps/AutoDock-Vina/git/blobs/aa63f0da2ab4ca2772dc011241e451ded256d2d2'
  const response=await fetch(sourceUrl);assert.equal(response.status,200)
  const blob=await response.json() as any;assert.equal(blob.encoding,'base64')
  const receptorBytes=Buffer.from(blob.content,'base64');const receptorSha256=createHash('sha256').update(receptorBytes).digest('hex')
  const receptorPath=join(root,'public-1iep-receptor.pdbqt');const ligandPath=join(root,'ethanol.json');await writeFile(receptorPath,receptorBytes);await writeFile(ligandPath,JSON.stringify([{id:'ethanol',smiles:'CCO',source:'Benign ethanol SMILES; synthetic software acceptance ligand, not a target-binding claim'}],null,2))
  const prior={db:process.env.ZEROWALL_RESEARCH_DB,home:process.env.DSH_HOME};process.env.ZEROWALL_RESEARCH_DB=join(root,'research.sqlite');process.env.DSH_HOME=join(root,'harness')
  const store=new ResearchStore(process.env.ZEROWALL_RESEARCH_DB);const project=store.createProject({name:'Public receptor plus ethanol software validation',rootPath:root})
  const receptor=store.createDataAsset({projectId:project.id,name:'Public prepared 1iep receptor',uri:pathToFileURL(receptorPath).href,location:'local',mediaType:'chemical/x-pdbqt',checksum:receptorSha256,checksumAlgorithm:'sha256'})
  const ligand=store.createDataAsset({projectId:project.id,name:'Ethanol software fixture',uri:pathToFileURL(ligandPath).href,location:'local',mediaType:'application/json'})
  const session={id:'live-docking',header:{cwd:root},snapshotEvents:()=>[],append:()=>undefined,requestHeader:()=>undefined};const ctx=new Context();ctx.provide('sessions',{get:(id:string)=>id===session.id?session:undefined} as any)
  const execute=(name:string,args:object)=>ctx.tools.execute({name,arguments:args,callId:ToolCallId('live-docking-'+Date.now()),signal:AbortSignal.timeout(180000),agent:{session} as any})
  const require=createRequire(join(repo,'plugins/research/package.json'));const viteRequire=createRequire(require.resolve('vitest/package.json'))
  const {createServer}=await import(pathToFileURL(viteRequire.resolve('vite')).href);const {chromium}=createRequire(join(repo,'desktop/package.json'))('playwright') as typeof import('playwright')
  const report:any={status:'running',scope:'Real source React + Host ToolRuntime/research_workflow/r_files + remote Biomni/Vina + local Molstar; public receptor with ethanol, no affinity or biological validation',source:{url:sourceUrl,gitBlob:blob.sha,sha256:receptorSha256,bytes:receptorBytes.length},requests:[],errors:[]}
  const app="import React from 'react';import{createRoot}from'react-dom/client';import{MoleculeViewer}from'/plugins/research/src/client/molecule-viewer.tsx';const request=(kind,input)=>fetch('/fixture-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,input})}).then(r=>r.json());const remote={scienceViewer:input=>request('viewer',input),moleculeDocking:input=>request('docking',input)};createRoot(document.getElementById('root')).render(React.createElement(MoleculeViewer,{remote,sessionId:'live-docking'}));"
  const server=await createServer({configFile:false,root:repo,cacheDir:join(root,'vite-cache'),optimizeDeps:{noDiscovery:true,entries:[],include:['react','react/jsx-runtime','react/jsx-dev-runtime','react-dom/client']},server:{host:'127.0.0.1',port:0,watch:null},esbuild:{jsx:'automatic'},resolve:{alias:[{find:/^react$/u,replacement:require.resolve('react')},{find:/^react\/jsx-runtime$/u,replacement:require.resolve('react/jsx-runtime')},{find:/^react\/jsx-dev-runtime$/u,replacement:require.resolve('react/jsx-dev-runtime')},{find:/^react-dom\/client$/u,replacement:require.resolve('react-dom/client')}]},plugins:[{name:'live-vina',configureServer(server:any){server.middlewares.use(async(req:any,res:any,next:()=>void)=>{
    if(req.url==='/fixture-api'&&req.method==='POST'){res.setHeader('Content-Type','application/json');try{let raw='';for await(const bytes of req){raw+=bytes;if(raw.length>16*1024**2)throw new Error('Request too large')};const {kind,input}=JSON.parse(raw);const start=performance.now();const value=kind==='docking'?await ctx.zerowallResearch.moleculeDocking(input):await ctx.zerowallResearch.scienceViewer(input);report.requests.push({kind,action:input.action,milliseconds:performance.now()-start,status:value.run?.status,analysisComplete:value.analysisComplete});res.end(JSON.stringify({ok:true,value}))}catch(error){report.errors.push(String(error));res.end(JSON.stringify({ok:false,error:{message:String(error)}}))}return}
    if(req.url==='/fixture'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await server.transformIndexHtml('/fixture','<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>:root{--dsw-alias-border-l1:#ddd;font-family:system-ui;color:#17243b}body{max-width:1200px;margin:20px auto}button,input,select{margin:4px;padding:6px}</style><div id="root"></div><script type="module" src="/fixture-entry.js"></script></html>'));return}next()
  })},resolveId(id:string){if(id==='/fixture-entry.js')return '\0vina-live'},load(id:string){if(id==='\0vina-live')return app}}]})
  let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined
  try{
    await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);await ctx.plugin(Projects);await ctx.plugin(Mcp);await ctx.plugin(Research)
    const configured=(await ctx.zerowallMcp.list()).find(item=>item.serverName==='rmcp');if(configured&&!configured.enabled)await ctx.zerowallMcp.update({id:configured.id,changes:{enabled:true}})
    expect((await execute('mcp_connect',{server:'rmcp'})).isError).toBe(false)
    await expect.poll(async()=>(await ctx.zerowallMcp.list()).find(item=>item.serverName==='rmcp')?.runtimeState,{timeout:20000}).toBe('active')
    const catalog=await ctx.get('researchWorkflow')!.get().query('biomni',{operation:'biomni.search.tools',arguments:{q:'docking_autodock_vina',limit:10}},{agent:{session},callId:'live-vina-preflight',signal:AbortSignal.timeout(30000)} as any);await writeFile(join(root,'catalog.json'),JSON.stringify(catalog,null,2));
    await server.listen();browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:1440,height:1250}});page.setDefaultTimeout(180000);page.on('pageerror',error=>report.errors.push(error.message))
    await page.goto(new URL('/fixture',server.resolvedUrls!.local[0]).href);await page.getByText('Vina 分子对接 · 远程 CPU',{exact:true}).click()
    await page.getByLabel('对接受体',{exact:true}).selectOption(receptor.id);await page.getByLabel('对接配体列表',{exact:true}).selectOption(ligand.id)
    await page.getByLabel('受体准备来源',{exact:true}).fill('Public AutoDock-Vina basic_docking solution PDBQT; pinned git blob aa63f0da2ab4ca2772dc011241e451ded256d2d2. Original example preparation retained, protonation not independently validated; software acceptance only.')
    await page.getByLabel('对接盒中心',{exact:true}).fill('15.190,53.903,16.917');await page.getByLabel('对接盒尺寸',{exact:true}).fill('16,16,16')
    await page.getByRole('button',{name:'上传受体并提交 Vina',exact:true}).click();await page.waitForFunction(()=>!document.body.innerText.includes('正在核验或同步远程任务'));if(report.errors.length)throw new Error(report.errors.join('\n'));await page.getByText(/任务：/).waitFor({timeout:5000})
    const run=store.listRuns(project.id).find(r=>r.command==='research_workflow')!;assert.ok(run);report.runId=run.id
    await page.screenshot({path:join(root,'submitted.png'),fullPage:true})
    await page.reload();await page.getByText('Vina 分子对接 · 远程 CPU',{exact:true}).click();await page.getByLabel('对接历史任务',{exact:true}).selectOption(run.id)
    const deadline=Date.now()+600000;while(true){await page.getByRole('button',{name:'刷新对接任务与取回产物',exact:true}).click();await page.waitForFunction(()=>!document.body.innerText.includes('正在核验或同步远程任务'));const current=store.getRun(run.id)!;report.run=current;await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));if(['failed','cancelled','timed_out'].includes(current.status))throw new Error(current.error??current.status);if(report.errors.length)throw new Error(report.errors.join('\n'));if(await page.getByRole('button',{name:'查看首个构象',exact:true}).count())break;if(Date.now()>deadline)throw new Error('Docking timed out during artifact acceptance');await new Promise(resolve=>setTimeout(resolve,5000))}
    await page.getByRole('button',{name:'查看首个构象',exact:true}).click();await page.locator('[data-testid="molecule-canvas"][data-ready="true"]').waitFor();await page.screenshot({path:join(root,'verified-pose.png'),fullPage:true})
    const artifacts=store.listArtifacts(project.id).filter(a=>a.runId===run.id);for(const artifact of artifacts)assert.equal(createHash('sha256').update(await readFile(fileURLToPath(artifact.uri))).digest('hex'),artifact.checksum)
    assert.ok(artifacts.some(a=>a.name.endsWith('.sdf')));assert.deepEqual(report.errors,[])
    report.status='passed';report.run=store.getRun(run.id);report.artifacts=artifacts;report.scores=await page.locator('table').innerText();console.log(JSON.stringify({status:report.status,output:root,runId:run.id,artifacts:artifacts.length}))
  }catch(error){report.status='failed';report.failure=String(error);throw error}
  finally{await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));await browser?.close();await server.close();await ctx.fiber.dispose();store.close();if(prior.db===undefined)delete process.env.ZEROWALL_RESEARCH_DB;else process.env.ZEROWALL_RESEARCH_DB=prior.db;if(prior.home===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=prior.home}
},720000)
