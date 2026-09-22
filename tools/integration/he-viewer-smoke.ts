/** Real source React -> Host -> local OpenSlide -> ROI Artifact; no packaged-Electron claim. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ResearchStore } from '../../store/src/index.js'
import { HeService, hePythonPath } from '../../plugins/research/src/host/he.js'

if (!process.argv.includes('--run')) throw new Error('Pass --run to run the isolated HE visual reference.')
const require = createRequire(resolve('plugins/research/package.json'))
const viteRequire = createRequire(require.resolve('vitest/package.json'))
const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href)
const { chromium } = createRequire(resolve('desktop/package.json'))('playwright') as typeof import('playwright')
const root = resolve('.build','he-viewer-smoke',new Date().toISOString().replaceAll(':','-'))
await mkdir(root,{ recursive:true })
const path = join(root,'pyramid.tif')
await promisify(execFile)(hePythonPath(),[resolve('tools/science/create-he-reference.py'),path])
const store = new ResearchStore(join(root,'store.sqlite'))
const project = store.createProject({ name:'Synthetic HE reference',rootPath:root })
const asset = store.createDataAsset({ projectId:project.id,name:'三层合成校准 TIFF',uri:pathToFileURL(path).href,location:'local',mediaType:'image/tiff' })
const service = new HeService(store)
const requests: unknown[] = []
const app = "import React from 'react';import {createRoot} from 'react-dom/client';import {HeViewer} from '/plugins/research/src/client/he-viewer.tsx';const remote={scienceViewer:async input=>fetch('/fixture-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}).then(r=>r.json())};createRoot(document.getElementById('root')).render(React.createElement(HeViewer,{remote,sessionId:'fixture'}));"
const server = await createServer({ configFile:false,root:resolve('.'),cacheDir:join(root,'vite-cache'),optimizeDeps:{ noDiscovery:true,entries:[],include:['react','react/jsx-runtime','react/jsx-dev-runtime','react-dom/client'] },server:{ host:'127.0.0.1',port:0,watch:null },esbuild:{ jsx:'automatic' },resolve:{ alias:[{ find:/^react$/u,replacement:require.resolve('react') },{ find:/^react\/jsx-runtime$/u,replacement:require.resolve('react/jsx-runtime') },{ find:/^react\/jsx-dev-runtime$/u,replacement:require.resolve('react/jsx-dev-runtime') },{ find:/^react-dom\/client$/u,replacement:require.resolve('react-dom/client') }] },plugins:[{
  name:'he-viewer-reference',configureServer(server:any) { server.middlewares.use(async (req:any,res:any,next:()=>void) => {
    if (req.url==='/fixture-api' && req.method==='POST') {
      res.setHeader('Content-Type','application/json')
      try {
        let body=''; for await (const chunk of req) { body+=chunk; if (body.length>1024*1024) throw new Error('Request too large') }
        const request=JSON.parse(body); requests.push(request)
        const value=request.action==='list' ? { assets:store.listDataAssets(project.id),viewers:store.listViewerSessions(project.id) } : { he:await service.execute(project,{ ...request,action:request.action.slice(3) }) }
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
  await page.getByLabel('HE 资产',{ exact:true }).selectOption(asset.id)
  await page.getByRole('button',{ name:'打开切片',exact:true }).click()
  await page.getByRole('img',{ name:'HE 瓦片与 ROI 选择' }).waitFor()
  assert.equal(await page.getByLabel('HE page',{ exact:true }).inputValue(),'2')
  await page.screenshot({ path:join(root,'pyramid-overview.png'),fullPage:true })
  for (const [key,value] of Object.entries({ x:128,y:64,width:128,height:64 })) await page.getByLabel('HE '+key,{ exact:true }).fill(String(value))
  await page.getByLabel('HE page',{ exact:true }).selectOption('1')
  await page.getByRole('button',{ name:'读取区域',exact:true }).click()
  await page.getByText('当前瓦片：L1，64×32 像素，原始起点 128,64',{ exact:true }).waitFor()
  await page.reload(); await page.getByRole('tab').first().click()
  await page.getByText('当前瓦片：L1，64×32 像素，原始起点 128,64',{ exact:true }).waitFor()
  assert.equal(await page.getByLabel('HE x',{ exact:true }).inputValue(),'128')
  await page.getByRole('button',{ name:'导出并登记',exact:true }).click()
  await page.getByRole('status').filter({ hasText:'已登记产物' }).waitFor()
  await page.getByText('平均 RGB：80.0, 60.0, 120.0',{ exact:true }).waitFor()
  await page.screenshot({ path:join(root,'roi-restored-export.png'),fullPage:true })
  const artifact=store.listArtifacts(project.id)[0]!
  const result=JSON.parse(await readFile(fileURLToPath(artifact.uri),'utf8'))
  assert.equal(result.slide.engine,'openslide'); assert.equal(result.physical.roiAreaUm2,1024)
  assert.deepEqual(result.meanRgb,{ r:80,g:60,b:120 }); assert.deepEqual(errors,[])
  await writeFile(join(root,'report.json'),JSON.stringify({ scope:'Actual source React/Host/Chromium/OpenSlide using synthetic pyramidal TIFF; not packaged Electron or StarDist acceptance',requests,artifact,result,screenshots:['pyramid-overview.png','roi-restored-export.png'] },null,2))
  console.log(JSON.stringify({ status:'passed',output:root,engine:result.slide.engine,library:result.slide.engineVersion,artifactId:artifact.id }))
} finally { await browser?.close();await server.close();store.close() }
