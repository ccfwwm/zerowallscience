/** Actual React/Host/Molstar WebGL reference. Does not claim packaged Electron acceptance. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir,readFile,writeFile } from 'node:fs/promises'
import { join,resolve } from 'node:path'
import { fileURLToPath,pathToFileURL } from 'node:url'
import { ResearchStore } from '../../store/src/index.js'
import { MoleculeService } from '../../plugins/research/src/host/molecule.js'
import { moleculeCif,moleculePdb } from '../../plugins/research/test/molecule-fixture.js'
import { moleculeSdf,moleculeSdfV3000 } from '../../plugins/research/test/molecule-sdf-fixture.js'
import { parseMolecule,measureMolecule } from '../../plugins/research/src/host/molecule.js'
import { spawn } from 'node:child_process'
if(!process.argv.includes('--run'))throw new Error('Pass --run for the isolated molecular reference.')
const require=createRequire(resolve('plugins/research/package.json'))
const viteRequire=createRequire(require.resolve('vitest/package.json'))
const {createServer}=await import(pathToFileURL(viteRequire.resolve('vite')).href)
const {chromium}=createRequire(resolve('desktop/package.json'))('playwright') as typeof import('playwright')
const root=resolve('.build/molecule-viewer-smoke',new Date().toISOString().replaceAll(':','-'));await mkdir(root,{recursive:true})
const store=new ResearchStore(join(root,'store.sqlite'));const project=store.createProject({name:'Synthetic molecule reference',rootPath:root});const service=new MoleculeService(store)
const assets=[]
for(const [name,text] of [['reference.cif',moleculeCif],['reference.pdb',moleculePdb]]){const path=join(root,name!);await writeFile(path,text!);assets.push(store.createDataAsset({projectId:project.id,name:name!,uri:pathToFileURL(path).href,location:'local',mediaType:'chemical/x-mmcif'}))}
const sdfAssets=[]
for(const [name,text] of [['ethanol-v2000.sdf',moleculeSdf],['ethanol-v3000.sdf',moleculeSdfV3000]]){const path=join(root,name!);await writeFile(path,text!);sdfAssets.push(store.createDataAsset({projectId:project.id,name:name!,uri:pathToFileURL(path).href,location:'local',mediaType:'chemical/x-mdl-sdfile'}))}
const requests:string[]=[]
const app="import React from 'react';import{createRoot}from'react-dom/client';import{MoleculeViewer}from'/plugins/research/src/client/molecule-viewer.tsx';const remote={scienceViewer:async input=>fetch('/fixture-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}).then(r=>r.json())};createRoot(document.getElementById('root')).render(React.createElement(MoleculeViewer,{remote,sessionId:'fixture'}));"
const server=await createServer({configFile:false,root:resolve('.'),cacheDir:join(root,'vite-cache'),optimizeDeps:{noDiscovery:true,entries:[],include:['react','react/jsx-runtime','react/jsx-dev-runtime','react-dom/client']},server:{host:'127.0.0.1',port:0,watch:null},esbuild:{jsx:'automatic'},resolve:{alias:[{find:/^react$/u,replacement:require.resolve('react')},{find:/^react\/jsx-runtime$/u,replacement:require.resolve('react/jsx-runtime')},{find:/^react\/jsx-dev-runtime$/u,replacement:require.resolve('react/jsx-dev-runtime')},{find:/^react-dom\/client$/u,replacement:require.resolve('react-dom/client')}]},plugins:[{
  name:'molecule-reference',configureServer(server:any){server.middlewares.use(async(req:any,res:any,next:()=>void)=>{
    if(req.url==='/fixture-api'&&req.method==='POST'){
      res.setHeader('Content-Type','application/json')
      try{let body='';for await(const chunk of req){body+=chunk;if(body.length>16*1024**2)throw new Error('Request too large')};const request=JSON.parse(body);requests.push(request.action)
        const value=request.action==='list'?{assets:store.listDataAssets(project.id),viewers:store.listViewerSessions(project.id)}:{molecule:await service.execute(project,{...request.molecule,sessionId:'fixture',action:request.action.slice(9)})};res.end(JSON.stringify({ok:true,value}))
      }catch(error){res.end(JSON.stringify({ok:false,error:{message:String(error)}}))};return
    }
    if(req.url==='/fixture'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await server.transformIndexHtml('/fixture','<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>ZeroWall molecule QA</title><style>:root{--dsw-alias-border-l1:#d5dbe5;color:#16213b;background:#f4f7fb;font-family:system-ui}body{max-width:1200px;margin:20px auto;background:white;padding:20px}button,select{padding:6px;margin:4px}select{max-width:320px}</style><div id="root"></div><script type="module" src="/fixture-entry.js"></script></html>'));return}next()
  })},resolveId(id:string){if(id==='/fixture-entry.js')return '\0molecule-entry'},load(id:string){if(id==='\0molecule-entry')return app},
}]})
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined
try{
  await server.listen();browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader'],timeout:30000})
  const page=await browser.newPage({viewport:{width:1440,height:1150}});page.setDefaultTimeout(30000)
  const errors:string[]=[];const external:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/u.test(request.url())&&!request.url().includes('127.0.0.1'))external.push(request.url())})
  await page.goto(new URL('/fixture',server.resolvedUrls!.local[0]).href)
  for(const asset of assets){await page.getByLabel('分子资产',{exact:true}).selectOption(asset.id);await page.getByRole('button',{name:'打开结构',exact:true}).click();await page.locator('[data-testid="molecule-canvas"][data-ready="true"]').waitFor();await page.getByRole('button',{name:'保存视角与选择',exact:true}).waitFor();await page.screenshot({path:join(root,asset.name+'.png'),fullPage:true})}
  await page.getByLabel('测距原子 1',{exact:true}).selectOption('0');await page.getByLabel('测距原子 2',{exact:true}).selectOption('8');await page.getByRole('button',{name:'计算原子距离',exact:true}).click();await page.getByLabel('原子距离',{exact:true}).filter({hasText:'5.0000 Å'}).waitFor()
  await page.getByLabel('分子残基',{exact:true}).selectOption(JSON.stringify(['A','1','','GLY']))
  await page.getByLabel('分子表示',{exact:true}).selectOption('molecular-surface')
  await page.getByRole('button',{name:'保存视角与选择',exact:true}).click();await page.getByRole('status').filter({hasText:'视角与选择已保存'}).waitFor()
  await page.screenshot({path:join(root,'residue-surface.png'),fullPage:true})
  await page.getByLabel('分子残基',{exact:true}).selectOption('')
  await page.getByLabel('分子表示',{exact:true}).selectOption('ball-and-stick')
  await page.getByLabel('分子链',{exact:true}).selectOption('B');await page.getByRole('button',{name:'保存视角与选择',exact:true}).click();await page.getByRole('status').filter({hasText:'视角与选择已保存'}).waitFor()
  const saved=store.listViewerSessions(project.id).find(view=>view.assetId===assets[1]!.id)!;assert.equal(saved.state.chain,'B');assert.ok(saved.state.camera)
  await page.reload();await page.getByRole('tab').filter({hasText:'reference.pdb'}).click();await page.locator('[data-testid="molecule-canvas"][data-ready="true"]').waitFor();assert.equal(await page.getByLabel('分子链',{exact:true}).inputValue(),'B')
  await page.getByRole('button',{name:'导出图像与结构并登记',exact:true}).click();await page.getByRole('status').filter({hasText:'已登记分子产物'}).waitFor()
  await page.screenshot({path:join(root,'restored-export.png'),fullPage:true})
  const artifact=store.listArtifacts(project.id)[0]!;const result=JSON.parse(await readFile(fileURLToPath(artifact.uri),'utf8'));assert.equal(result.measurement.distanceAngstrom,5);assert.equal(result.state.chain,'B');assert.ok(result.screenshot.sha256)
  const png=await readFile(fileURLToPath(String(artifact.metadata.imageUri)));assert.ok(png.length>5000);assert.deepEqual(errors,[]);assert.deepEqual(external,[])
  const sdfExports=[]
  for(const sdfAsset of sdfAssets){
    await page.getByLabel('分子资产',{exact:true}).selectOption(sdfAsset.id);await page.getByRole('button',{name:'打开结构',exact:true}).click();await page.locator('[data-testid="molecule-canvas"][data-ready="true"]').waitFor()
    await page.getByLabel('分子链',{exact:true}).selectOption('A');await page.getByLabel('分子残基',{exact:true}).selectOption(JSON.stringify(['A','1','','MOL']))
    await page.getByLabel('测距原子 1',{exact:true}).selectOption('0');await page.getByLabel('测距原子 2',{exact:true}).selectOption('1');await page.getByRole('button',{name:'计算原子距离',exact:true}).click();await page.getByLabel('原子距离',{exact:true}).filter({hasText:'1.5000 Å'}).waitFor()
    await page.getByRole('button',{name:'导出图像与结构并登记',exact:true}).click();await page.getByRole('status').filter({hasText:'已登记分子产物'}).waitFor();await page.screenshot({path:join(root,sdfAsset.name+'.png'),fullPage:true})
    const exported=store.listArtifacts(project.id).find(a=>a.metadata.sourceAssetId===sdfAsset.id)!;const output=JSON.parse(await readFile(fileURLToPath(exported.uri),'utf8'));assert.equal(output.summary.format,'sdf');assert.equal(output.measurement.distanceAngstrom,1.5);assert.deepEqual(await readFile(fileURLToPath(String(exported.metadata.structureUri))),await readFile(fileURLToPath(sdfAsset.uri)));sdfExports.push(exported)
  }
  await page.reload();await page.getByRole('tab').filter({hasText:'ethanol-v3000.sdf'}).click();await page.locator('[data-testid="molecule-canvas"][data-ready="true"]').waitFor();assert.equal(await page.getByLabel('分子链',{exact:true}).inputValue(),'A');await page.getByLabel('原子距离',{exact:true}).filter({hasText:'1.5000 Å'}).waitFor()
  const cases=[];for(const source of [moleculeSdf,moleculeSdfV3000,moleculeSdf.replace('M  END','M  CHG  1   3  -1\nM  END')]){const summary=await parseMolecule(source,'sdf');cases.push({source,summary,distance:measureMolecule(summary,0,1).distanceAngstrom})}
  const referenceCode=(await readFile(resolve('tools/integration/molecule-sdf-reference.py'))).toString('base64')
  const reference=await new Promise<string>((yes,no)=>{const child=spawn('ssh',['rdatalinux',`/opt/rdatalinux-biomni/venv/bin/python -c 'import base64;exec(base64.b64decode("${referenceCode}"))'`],{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='';let err='';const timer=setTimeout(()=>child.kill(),60000);child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>err+=chunk);child.on('error',no);child.on('close',code=>{clearTimeout(timer);if(code===0)yes(out);else no(new Error(err||'RDKit reference failed'))});child.stdin.end(JSON.stringify(cases))})
  const rdkit=JSON.parse(reference);assert.equal(rdkit.status,'passed');assert.deepEqual(errors,[]);assert.deepEqual(external,[])
  await writeFile(join(root,'report.json'),JSON.stringify({status:'passed',scope:'Actual source React/Host/Chromium/Molstar using synthetic PDB, mmCIF and single-record SDF; not packaged Electron or docking',requests,errors,external,artifact,result,screenshotBytes:png.length,sdfExports,rdkit},null,2))
  console.log(JSON.stringify({status:'passed',output:root,artifactId:artifact.id,screenshotBytes:png.length}))
}finally{await browser?.close();await server.close();store.close()}
