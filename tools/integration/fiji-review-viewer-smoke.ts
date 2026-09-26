/** Real source React -> Host -> local OpenSlide -> ROI Artifact; no packaged-Electron claim. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ResearchStore } from '../../store/src/index.js'
import { FijiExperimentService } from '../../plugins/research/src/host/fiji-experiments.js'
import { hePythonPath } from '../../plugins/research/src/host/he.js'
import { createHash } from 'node:crypto'


if (!process.argv.includes('--run')) throw new Error('Pass --run to run the isolated HE visual reference.')
const require = createRequire(resolve('plugins/research/package.json'))
const sharp=require('sharp') as typeof import('sharp')
const viteRequire = createRequire(require.resolve('vitest/package.json'))
const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href)
const { chromium } = createRequire(resolve('desktop/package.json'))('playwright') as typeof import('playwright')
const root = resolve('.build','fiji-review-viewer-smoke',new Date().toISOString().replaceAll(':','-'))
await mkdir(root,{ recursive:true })
const path=join(root,'colonies.png');const pixels=Buffer.alloc(40*24)
for(const [x,y,w,h,value] of [[4,4,3,3,200],[12,4,3,3,200],[20,4,3,3,255],[4,13,3,3,200],[8,13,3,3,200],[7,14,1,1,200],[0,19,2,2,200],[30,19,1,1,200]])for(let yy=y!;yy<y!+h!;yy++)for(let xx=x!;xx<x!+w!;xx++)pixels[yy*40+xx]=value!
await sharp(pixels,{raw:{width:40,height:24,channels:1}}).png().toFile(path)
// Preserve actual 8-bit grayscale rather than an RGB PNG encoding.
const python=hePythonPath()
await promisify(execFile)(python,['-I','-c',"from PIL import Image;import sys;image=Image.open(sys.argv[1]);image.convert('L').save(sys.argv[1])",path])
const store=new ResearchStore(join(root,'store.sqlite'));const project=store.createProject({name:'Fiji actual UI review',rootPath:root});const asset=store.createDataAsset({projectId:project.id,name:'Independent colony fixture',uri:pathToFileURL(path).href,location:'local',mediaType:'image/png'});const service=new FijiExperimentService(store)
const sha256=createHash('sha256').update(await readFile(path)).digest('hex')
const rois=[{id:'reflection',x:20,y:4,width:3,height:3},{id:'edge',x:0,y:19,width:2,height:2},...[[4,4],[12,4],[4,13],[8,13]].map(([x,y],i)=>({id:`colony-${i}`,x:x!,y:y!,width:3,height:3}))].map(roi=>({...roi,kind:'rectangle' as const,name:roi.id,page:0}))
const annotation=store.createAnnotationRevision({projectId:project.id,assetId:asset.id,sourceSha256:sha256,expectedRevisionId:null,origin:'workbench',payload:{coordinates:{convention:'pixel-edge-top-left',width:40,height:24,pages:1,calibration:null},rois}}).head
const requests: unknown[] = []
const app = "import React from 'react';import {createRoot} from 'react-dom/client';import {FijiExperimentPanel} from '/plugins/research/src/client/fiji-experiment-panel.tsx';const call=(method,input)=>fetch('/fixture-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,input})}).then(r=>r.json());const remote={scienceViewer:input=>call('scienceViewer',input),fijiExperiment:input=>call('fijiExperiment',input),preview:input=>call('preview',input)};createRoot(document.getElementById('root')).render(React.createElement(FijiExperimentPanel,{remote,sessionId:'fixture'}));"
const server = await createServer({ configFile:false,root:resolve('.'),cacheDir:join(root,'vite-cache'),optimizeDeps:{ noDiscovery:true,entries:[],include:['react','react/jsx-runtime','react/jsx-dev-runtime','react-dom/client'] },server:{ host:'127.0.0.1',port:0,watch:null },esbuild:{ jsx:'automatic' },resolve:{ alias:[{ find:/^react$/u,replacement:require.resolve('react') },{ find:/^react\/jsx-runtime$/u,replacement:require.resolve('react/jsx-runtime') },{ find:/^react\/jsx-dev-runtime$/u,replacement:require.resolve('react/jsx-dev-runtime') },{ find:/^react-dom\/client$/u,replacement:require.resolve('react-dom/client') }] },plugins:[{
  name:'he-viewer-reference',configureServer(server:any) { server.middlewares.use(async (req:any,res:any,next:()=>void) => {
    if (req.url==='/fixture-api' && req.method==='POST') {
      res.setHeader('Content-Type','application/json')
      try {
        let body=''; for await (const chunk of req) { body+=chunk; if (body.length>1024*1024) throw new Error('Request too large') }
        const wrapper=JSON.parse(body);const request=wrapper.input; requests.push(wrapper)
        const value=wrapper.method==='scienceViewer'?{assets:store.listDataAssets(project.id)}:wrapper.method==='preview'?{base64:(await readFile(fileURLToPath(request.uri))).toString('base64')}:await service.execute(project,request)
        res.end(JSON.stringify({ ok:true,value }))
      } catch (error) { res.end(JSON.stringify({ ok:false,error:{ message:String(error) } })) }
      return
    }
    if (req.url==='/fixture') { res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await server.transformIndexHtml('/fixture','<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>ZeroWall HE QA</title><style>:root{--dsw-alias-border-l1:#d5dbe5;color:#16213b;background:#f4f7fb;font-family:system-ui}body{max-width:1150px;margin:20px auto;background:white;padding:20px}button,select,input{padding:5px;margin:3px}input{width:100px}</style><div id="root"></div><script type="module" src="/fixture-entry.js"></script></html>'));return }
    next()
  }) },resolveId(id:string) { if (id==='/fixture-entry.js') return '\0he-entry' },load(id:string) { if (id==='\0he-entry') return app },
}] })
let browser: Awaited<ReturnType<typeof chromium.launch>>|undefined
try {
  await server.listen(); browser=await chromium.launch({ headless:true,timeout:30000 })
  const page=await browser.newPage({ viewport:{ width:1360,height:1200 } }); page.setDefaultTimeout(20000)
  const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message))
  await page.goto(new URL('/fixture',server.resolvedUrls!.local[0]).href)
  await page.getByLabel('Fiji 实验',{exact:true}).selectOption('colony-formation')
  await page.getByLabel('实验输入',{exact:true}).selectOption('image')
  await page.getByLabel('实验图像',{exact:true}).selectOption(asset.id)
  await page.getByLabel('Fiji 实验测量 JSON',{exact:true}).fill(JSON.stringify({kind:'colony-formation',wellId:'A1',plateId:'P1',threshold:150,polarity:'bright',minArea:2,maxArea:100,stainUnit:'pixel',roi:{x:0,y:0,width:40,height:24}}))
  await page.getByLabel('Fiji 接受修订',{exact:true}).selectOption(annotation.id)
  await page.getByLabel('排除 reflection',{exact:true}).check();await page.getByLabel('排除 edge',{exact:true}).check()
  await page.getByLabel('使用人工前景掩膜',{exact:true}).check()
  for(let i=0;i<4;i++)await page.getByLabel('前景 colony-'+i,{exact:true}).check()
  await page.getByLabel('Fiji seededCells',{exact:true}).fill('100')
  await page.getByRole('button',{name:'分析图像',exact:true}).click()
  await page.getByAltText('接受的分割掩膜',{exact:true}).waitFor({timeout:90000})
  const resultText=await page.getByLabel('实验结果',{exact:true}).innerText();assert.ok(resultText.includes('"independentCount": 4'));assert.ok(resultText.includes('"stainedArea": 36'));assert.ok(resultText.includes('0.04'))
  await page.screenshot({path:join(root,'manual-mask-result.png'),fullPage:true})
  const runId=store.listRuns(project.id)[0]!.id
  await page.reload();await page.getByRole('button',{name:'刷新实验任务',exact:true}).click();await page.getByLabel('Fiji 历史任务',{exact:true}).selectOption(runId);await page.getByRole('button',{name:'恢复实验结果',exact:true}).click();await page.getByAltText('接受的分割掩膜',{exact:true}).waitFor()
  assert.equal(store.listRuns(project.id).length,1);await page.screenshot({path:join(root,'restored-result.png'),fullPage:true})
  assert.deepEqual(errors,[]);await writeFile(join(root,'report.json'),JSON.stringify({passed:true,scope:'Real source React/Host/ImageJ accepted annotation mask and restored artifacts, synthetic geometry only',runId,requests,screenshots:['manual-mask-result.png','restored-result.png']},null,2));console.log(root)
} finally { await browser?.close();await server.close();service.dispose();store.close() }
