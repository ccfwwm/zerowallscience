/** Synthetic 100k-cell fixture. Real React component -> real CellViewerService. */
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cpus, totalmem } from 'node:os'
import { ResearchStore } from '../../store/src/index.js'
import { CellViewerService } from '../../plugins/research/src/host/cell-viewer.js'

if (!process.argv.includes('--run')) throw new Error('Pass --run to serve the synthetic 100k-cell fixture on loopback.')
const require = createRequire(resolve('plugins/research/package.json'))
const viteRequire = createRequire(require.resolve('vitest/package.json'))
const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href)
const root = resolve('.build','cell-viewer-ui-smoke',new Date().toISOString().replaceAll(':','-'))
await mkdir(root,{recursive:true})
const path=join(root,'synthetic-100k.h5ad')
await promisify(execFile)(process.env.ZEROWALL_CELL_PYTHON || process.env.ZEROWALL_PYTHON || 'python',['-c',`import h5py, numpy as np, sys
n=100000; p=256
with h5py.File(sys.argv[1],'w') as f:
 f.attrs['encoding-type']='anndata'
 x=f.create_dataset('X',shape=(n,p),dtype='float32',chunks=(1000,p),compression='gzip')
 o=f.create_group('obs'); o.create_dataset('_index',data=['cell_'+str(i) for i in range(n)])
 o.create_dataset('group',data=['group_'+str(i%4) for i in range(n)])
 f.create_group('var').create_dataset('_index',data=['G'+str(i) for i in range(p)])
 e=f.create_group('obsm').create_dataset('X_umap',shape=(n,2),dtype='float32',chunks=(1000,2))
 for start in range(0,n,1000):
  stop=min(n,start+1000); rows=np.arange(start,stop); b=np.zeros((len(rows),p),dtype='float32')
  b[np.arange(len(rows)),rows%p]=1; b[np.arange(len(rows)),(rows+1)%p]=2; x[start:stop]=b
  angle=rows*2.39996323; radius=np.sqrt((rows//4+1)/25000)
  e[start:stop]=np.column_stack([np.cos(angle)*radius+(rows%4)*3, np.sin(angle)*radius])
`,path])
const store=new ResearchStore(join(root,'store.sqlite'))
const project=store.createProject({name:'Synthetic 100k cells',rootPath:root})
store.createDataAsset({projectId:project.id,name:'合成 100,000 cells × 256 features',uri:pathToFileURL(path).href,location:'local',mediaType:'application/x-h5ad'})
const service=new CellViewerService(store)
const report={scope:'Synthetic local browser fixture, not packaged Electron acceptance',hardware:{platform:process.platform,cpu:cpus()[0]?.model,logicalCpu:cpus().length,totalMemoryBytes:totalmem()},requests:[] as object[]}
const app=`import React from 'react';import {createRoot} from 'react-dom/client';import {CellViewer} from '/plugins/research/src/client/cell-viewer.tsx';const remote={scienceViewer:async input=>fetch('/fixture-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}).then(r=>r.json())};createRoot(document.getElementById('root')).render(React.createElement(CellViewer,{remote,sessionId:'fixture'}));`
const server=await createServer({configFile:false,root:resolve('.'),server:{host:'127.0.0.1',port:4318,strictPort:true},esbuild:{jsx:'automatic'},resolve:{alias:[{find:/^react$/,replacement:require.resolve('react')},{find:/^react\/jsx-runtime$/,replacement:require.resolve('react/jsx-runtime')},{find:/^react-dom\/client$/,replacement:require.resolve('react-dom/client')}]},plugins:[{
  name:'cell-viewer-smoke',configureServer(server){server.middlewares.use(async(req,res,next)=>{
    if(req.url==='/fixture-api'&&req.method==='POST'){
      res.setHeader('Content-Type','application/json');const start=performance.now()
      try{
        let body='';for await(const chunk of req){body+=chunk;if(body.length>1024*1024)throw new Error('Request too large')}
        const input=JSON.parse(body)
        const value=input.action==='list'?{assets:store.listDataAssets(project.id),viewers:store.listViewerSessions(project.id)}:{cell:await service.execute(project,{...input,action:input.action.slice(5),selection:input.cellSelection,camera:input.cellCamera})}
        const output=JSON.stringify({ok:true,value})
        report.requests.push({action:input.action,milliseconds:performance.now()-start,responseBytes:Buffer.byteLength(output),hostMemory:process.memoryUsage(),...(value.cell?.artifact?{artifact:value.cell.artifact}:{})})
        await writeFile(join(root,'report.json'),JSON.stringify(report,null,2))
        res.end(output)
      }catch(error){res.end(JSON.stringify({ok:false,error:{code:'VALIDATION',message:String(error)}}))}return
    }
    if(req.url==='/fixture'){
      res.setHeader('Content-Type','text/html; charset=utf-8')
      res.end(await server.transformIndexHtml('/fixture','<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>ZeroWall 100k cells 验收</title><style>:root{--dsw-alias-border-l1:#d5dbe5;color:#16213b;background:#f4f7fb;font-family:system-ui}body{max-width:1100px;margin:20px auto;background:white;padding:20px}button,select,input{padding:6px;margin:4px}</style><div id="root"></div><script type="module" src="/fixture-entry.js"></script></html>'));return
    }next()
  })},resolveId(id){if(id==='/fixture-entry.js')return '\0fixture-entry'},load(id){if(id==='\0fixture-entry')return app}
}]})
await server.listen();console.log(`Open http://127.0.0.1:4318/fixture ; evidence: ${root}`)
await new Promise<void>(done=>{process.stdin.once('data',()=>done());process.once('SIGINT',()=>done());process.stdin.resume()})
await server.close();store.close();process.stdin.pause()
