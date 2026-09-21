/** Local synthetic fixture; tests the real React viewer against its real Host service. */
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ResearchStore } from '../../store/src/index.js'
import { ImageViewerService } from '../../plugins/research/src/host/image-viewer.js'
import { ScienceViewerService } from '../../plugins/research/src/host/science-viewer.js'

if (!process.argv.includes('--run')) throw new Error('Pass --run to serve an isolated synthetic image viewer on loopback.')
const require = createRequire(resolve('plugins/research/package.json'))
const viteRequire = createRequire(require.resolve('vitest/package.json'))
const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href)
const sharp = (await import(pathToFileURL(require.resolve('sharp')).href)).default
const root = resolve('.build','image-viewer-ui-smoke',new Date().toISOString().replaceAll(':','-'))
await mkdir(root,{recursive:true})
const store = new ResearchStore(join(root,'store.sqlite'))
const project = store.createProject({name:'Image UI fixture',rootPath:root})
const pixels = Buffer.alloc(600*400*3)
for (let y=0;y<400;y++) for(let x=0;x<600;x++) {
  const offset=(y*600+x)*3; pixels[offset]=Math.round(x*255/600);pixels[offset+1]=Math.round(y*255/400);pixels[offset+2]=80
  if ((x-300)**2+(y-200)**2<60**2) { pixels[offset]=220;pixels[offset+1]=220;pixels[offset+2]=230 }
}
const imagePath=join(root,'synthetic-image.png')
await sharp(pixels,{raw:{width:600,height:400,channels:3}}).png().toFile(imagePath)
const asset=store.createDataAsset({projectId:project.id,name:'合成图像 600×400',uri:pathToFileURL(imagePath).href,mediaType:'image/png',location:'local'})
const images=new ImageViewerService(store); const sequences=new ScienceViewerService(store)
await images.execute(project,{sessionId:'fixture',action:'image_open',assetId:asset.id})
const app = `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ImageViewer} from '/plugins/research/src/client/image-viewer.tsx'; const remote={scienceViewer:async input=>fetch('/fixture-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}).then(r=>r.json())}; createRoot(document.getElementById('root')).render(React.createElement(ImageViewer,{remote,sessionId:'fixture'}));`
const server=await createServer({configFile:false,root:resolve('.'),server:{host:'127.0.0.1',port:4317,strictPort:true},esbuild:{jsx:'automatic'},resolve:{alias:[{find:/^react$/,replacement:require.resolve('react')},{find:/^react\/jsx-runtime$/,replacement:require.resolve('react/jsx-runtime')},{find:/^react-dom\/client$/,replacement:require.resolve('react-dom/client')}]},plugins:[{
  name:'science-image-smoke',configureServer(server) {
    server.middlewares.use(async(req,res,next)=>{
      if(req.url==='/fixture-api' && req.method==='POST') {
        res.setHeader('Content-Type','application/json')
        try {
          let body='';for await(const chunk of req) {body+=chunk; if(body.length>1024*1024) throw new Error('Fixture request too large.')}
          const input=JSON.parse(body)
          const value=input.action==='list'?await sequences.execute(project,input):await images.execute(project,input)
          res.end(JSON.stringify({ok:true,value}))
        } catch(error) {res.end(JSON.stringify({ok:false,error:{code:'VALIDATION',message:String(error)}}))}
        return
      }
      if(req.url==='/fixture') {
        res.setHeader('Content-Type','text/html; charset=utf-8')
        res.end(await server.transformIndexHtml('/fixture','<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>ZeroWall 图像与 ROI 验收</title><style>:root{--dsw-alias-border-l1:#d5dbe5;color:#16213b;background:#f4f7fb;font-family:system-ui}body{max-width:1100px;margin:24px auto;background:white;padding:24px}button,select,input{padding:6px;margin:4px}svg{margin-top:12px}</style><div id="root"></div><script type="module" src="/fixture-entry.js"></script></html>'))
        return
      }
      next()
    })
  },resolveId(id){if(id==='/fixture-entry.js')return '\0fixture-entry'},load(id){if(id==='\0fixture-entry')return app}
}]})
await server.listen();console.log(`Open http://127.0.0.1:4317/fixture ; fixture artifacts: ${root}`)
await new Promise<void>(done=>{process.stdin.once('data',()=>done());process.once('SIGINT',()=>done());process.stdin.resume()})
await server.close();store.close();process.stdin.pause()
