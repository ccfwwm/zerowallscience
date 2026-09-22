/** Synthetic NiftyReg fields + real Host + real React panel in Chromium. */
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {ResearchStore} from '../../store/src/index.js'
import {BrainTransformService,createBrainTransformContract} from '../../plugins/research/src/host/brain-transform.js'
if(!process.argv.includes('--run'))throw new Error('Pass --run for synthetic transform UI acceptance.')
const require=createRequire(resolve('plugins/research/package.json'));const viteRequire=createRequire(require.resolve('vitest/package.json'))
const {createServer}=await import(pathToFileURL(viteRequire.resolve('vite')).href)
const {chromium}=createRequire(resolve('desktop/package.json'))('playwright') as typeof import('playwright')
const root=resolve('.build/brain-transform-ui-smoke',new Date().toISOString().replaceAll(':','-'));await mkdir(root,{recursive:true})
const python=process.env.ZEROWALL_BRAINGLOBE_PYTHON||'python'
process.env.ZEROWALL_BRAINGLOBE_DIR||=resolve('.zerowall/brainglobe-managed')
const reference=JSON.parse((await promisify(execFile)(python,['-E','-P',resolve('tools/integration/brain-transform-reference.py'),root],{windowsHide:true,timeout:120000})).stdout)
const directory=reference.cases.find((c:any)=>c.name==='translation').directory
const contract=await createBrainTransformContract(directory)
const store=new ResearchStore(join(root,'store.sqlite'));const project=store.createProject({name:'Synthetic Brain Transform QA',rootPath:root});const service=new BrainTransformService(store)
const manifest=JSON.stringify({transform:contract,outputDirectory:directory,scope:'Synthetic affine fixture; not anatomical registration'})
const path=join(directory,'registration.json');await writeFile(path,manifest)
const artifact=store.createArtifact({projectId:project.id,name:'BrainGlobe brainreg registration',uri:pathToFileURL(path).href,mediaType:'application/json',checksum:createHash('sha256').update(manifest).digest('hex')})
const requests:string[]=[]
const app=`import React from 'react';import{createRoot}from'react-dom/client';import{BrainTransformPanel}from'/plugins/research/src/client/brain-transform-panel.tsx';const rpc=async(method,input)=>fetch('/fixture-api',{method:'POST',body:JSON.stringify({method,input})}).then(r=>r.json());const remote={listArtifacts:id=>rpc('list',id),brainTransform:input=>rpc('transform',input)};createRoot(document.getElementById('root')).render(React.createElement(BrainTransformPanel,{remote,sessionId:'fixture',projectId:${JSON.stringify(project.id)},onMapped:points=>document.getElementById('mapped').textContent=JSON.stringify(points)}));`
const server=await createServer({configFile:false,root:resolve('.'),cacheDir:join(root,'vite-cache'),optimizeDeps:{noDiscovery:true,entries:[],include:['react','react/jsx-runtime','react/jsx-dev-runtime','react-dom/client']},server:{host:'127.0.0.1',port:0,watch:null},esbuild:{jsx:'automatic'},resolve:{alias:[{find:/^react$/u,replacement:require.resolve('react')},{find:/^react\/jsx-runtime$/u,replacement:require.resolve('react/jsx-runtime')},{find:/^react\/jsx-dev-runtime$/u,replacement:require.resolve('react/jsx-dev-runtime')},{find:/^react-dom\/client$/u,replacement:require.resolve('react-dom/client')}]},plugins:[{name:'brain-transform-smoke',configureServer(server:any){server.middlewares.use(async(req:any,res:any,next:()=>void)=>{
 if(req.url==='/fixture-api'){res.setHeader('Content-Type','application/json');try{let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);requests.push(body.method+':'+(body.input.action||''));const value=body.method==='list'?store.listArtifacts(project.id):await service.execute(project,body.input);res.end(JSON.stringify({ok:true,value}))}catch(e){res.end(JSON.stringify({ok:false,error:{message:String(e)}}))}return}
 if(req.url==='/fixture'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(await server.transformIndexHtml('/fixture','<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Brain transform QA</title><style>body{font:16px system-ui;max-width:1080px;margin:30px auto;color:#17253d}button,select,textarea{padding:8px;margin:6px}fieldset{border:1px solid #ccd6e2;border-radius:10px}</style><h1>BrainGlobe 配准坐标变换 · 合成几何验收</h1><div id="root"></div><pre id="mapped"></pre><script type="module" src="/fixture-entry.js"></script></html>'));return}next()
 })},resolveId(id:string){if(id==='/fixture-entry.js')return'\0fixture-entry'},load(id:string){if(id==='\0fixture-entry')return app}}]})
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined
try{
 await server.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(30000)
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
 await page.goto(`http://127.0.0.1:${(server.httpServer!.address() as any).port}/fixture`)
 await page.getByRole('button',{name:'刷新配准产物'}).click();await page.getByLabel('配准变换产物').selectOption(artifact.id)
 await page.getByRole('button',{name:'核验变换契约'}).click();await page.getByText('变形场、几何契约及文件 SHA-256 已核验。').waitFor()
 await page.getByLabel('配准样本网格坐标').fill('[[3.2,4.6,5.3],[-1,0,0],[16,0,0]]');await page.getByRole('button',{name:'变换并登记坐标产物'}).click()
 await page.getByText(/已变换 1 点；样本网格外 2 点/).waitFor()
 const points=JSON.parse((await page.locator('#mapped').textContent())!);const expected=[130,305,630];points[0].forEach((v:number,i:number)=>assert.ok(Math.abs(v-expected[i]!)<.001))
 const exported=store.listArtifacts(project.id).find(a=>a.name==='BrainGlobe transformed atlas coordinates');assert.ok(exported);const contents=await readFile(new URL(exported.uri),'utf8');assert.equal(createHash('sha256').update(contents).digest('hex'),exported.checksum);assert.equal(JSON.parse(contents).scientificReview,'pending');assert.deepEqual(errors,[])
 await page.screenshot({path:join(root,'transform-ui.png'),fullPage:true});await writeFile(join(root,'report.json'),JSON.stringify({status:'passed',scope:'Synthetic NiftyReg translation field, real React/Host/atlas metadata/hash/export. Anatomical accuracy remains untested.',contract,requests,points,artifact:exported,browserErrors:errors},null,2));console.log(JSON.stringify({status:'passed',output:root}))
}finally{await browser?.close();await server.close();store.close()}
