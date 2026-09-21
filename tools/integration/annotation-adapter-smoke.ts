/** Exercise installed native ROI APIs and real exchange files; no claim of pixel-level GUI acceptance. */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ResearchStore } from '../../store/src/index.js'
import { ImageViewerService } from '../../plugins/research/src/host/image-viewer.js'
import { NativeEngineService, engineEnvironment, engineExecutable } from '../../plugins/research/src/host/native-engines.js'
import { napariAnnotationAdapter, fijiAnnotationAdapter } from '../../plugins/research/src/host/annotation-adapters.js'

if (!process.argv.includes('--run')) throw new Error('Pass --run to validate installed Fiji/napari ROI APIs against synthetic data.')
const require = createRequire(resolve('plugins/research/package.json'))
const sharp = (await import(pathToFileURL(require.resolve('sharp')).href)).default
const root = resolve('.build','annotation-adapter-smoke',new Date().toISOString().replaceAll(':','-'))
await mkdir(root,{recursive:true})
const sourcePath=join(root,'synthetic.png'); await sharp({create:{width:64,height:64,channels:3,background:'#646464'}}).png().toFile(sourcePath)
const store=new ResearchStore(join(root,'store.sqlite')); const engines=new NativeEngineService(store); const service=new ImageViewerService(store,engines)
const project=store.createProject({name:'Native annotation numerical fixture',rootPath:root})
const asset=store.createDataAsset({projectId:project.id,name:'Synthetic PNG',uri:pathToFileURL(sourcePath).href,location:'local',mediaType:'image/png'})
const opened=await service.execute(project,{sessionId:'test',action:'image_open',assetId:asset.id}); const viewerId=opened.viewer!.id
const payload={coordinates:opened.image!.coordinates,rois:[{id:'rect',name:'8x8 rectangle',page:0,kind:'rectangle' as const,x:10.25,y:20.5,width:8,height:8},{id:'point',name:'point',page:0,kind:'point' as const,x:5.5,y:6.5},{id:'poly',name:'polygon',page:0,kind:'polygon' as const,points:[[1,2],[8,2],[4,7]] as Array<[number,number]>}]}
const saved=await service.execute(project,{sessionId:'test',action:'annotation_save',viewerId,expectedVersion:1,annotation:{expectedRevisionId:null,payload}})
const report: unknown[]=[]
try {
  if (process.argv.includes('--gui')) {
    for (const engine of ['napari','fiji'] as const) {
      const result=await service.execute(project,{sessionId:'test',action:'annotation_launch',viewerId,expectedVersion:1,engine})
      const launched=result.launch!
      const deadline=Date.now()+45000
      let current=launched
      while(Date.now()<deadline) {
        current=engines.list(project.id).find(item=>item.launchId===launched.launchId)!
        const ready=await readFile(current.annotationBridge!.returnPath+'.ready','utf8').catch(()=>'')
        const error=await readFile(join(resolve(current.annotationBridge!.returnPath,'..'),'native-request.json.error'),'utf8').catch(()=>'')
        if(error)throw new Error(error)
        if(ready===launched.launchId || current.diagnosticTail?.includes(`ZEROWALL_ANNOTATION_READY ${launched.launchId}`) || current.status==='failed')break
        await new Promise(done=>setTimeout(done,500))
      }
      const adapterReady=(current.diagnosticTail?.includes(`ZEROWALL_ANNOTATION_READY ${launched.launchId}`)??false) || await readFile(current.annotationBridge!.returnPath+'.ready','utf8').catch(()=>'')===launched.launchId
      report.push({engine,adapterReady,launch:current,scope:'Real Host launch and adapter readiness marker only; visual acceptance is separate'})
      console.log(JSON.stringify({engine,adapterReady,launch:current}))
      if(!adapterReady)throw new Error(`${engine} adapter did not reach ready: ${current.diagnosticTail}`)
    }
  } else {
  for(const engine of ['napari','fiji'] as const) {
    const directory=join(root,engine); await mkdir(directory)
    const script=engine==='napari'?napariAnnotationAdapter:fijiAnnotationAdapter
    const adapter=join(directory,'adapter.py'); await writeFile(adapter,script)
    const returnPath=join(directory,'return.json'); const requestPath=join(directory,'request.json')
    const document={format:'zerowall-image-annotations',version:1,projectId:project.id,assetId:asset.id,sourceSha256:opened.image!.sourceSha256,baseRevisionId:saved.annotationHead!.id,origin:'workbench',payload}
    const bridgeId=`test-${engine}`
    await writeFile(requestPath,JSON.stringify({bridgeId,sourcePath,returnPath,document}))
    const test=engine==='napari'?String.raw`
import runpy, os, numpy as np
api=runpy.run_path(os.environ['TEST_ADAPTER'])
request=api['load_request']()
import napari
viewer=napari.Viewer(show=False)
image=viewer.add_image(np.ones((64,64)))
shapes,points=api['build_layers'](viewer,request['document'])
rois=api['collect_layers'](viewer,image,shapes,points)
assert rois[0]['x']==10.25 and rois[0]['width']==8
assert next(r for r in rois if r['kind']=='point')['x']==5.5
shapes.translate=(1,0)
try:
    api['collect_layers'](viewer,image,shapes,points)
    raise AssertionError('transformed layer accepted')
except ValueError: pass
shapes.translate=(0,0)
shapes.data=[np.asarray(v)+[0,1] for v in shapes.data]
api['save_return'](request,api['collect_layers'](viewer,image,shapes,points),'napari')
try:
    api['save_return'](request,rois,'napari')
    raise AssertionError('return overwritten')
except FileExistsError: pass
viewer.close()
print('NAPARI_NATIVE_ROI_PASS')
`:String.raw`
import runpy, os
api=runpy.run_path(os.environ['TEST_ADAPTER'])
request=api['load_request']()
from ij.plugin.frame import RoiManager
from ij import IJ
manager=RoiManager(True)
api['build_rois'](manager,request['document'])
rois=api['collect_rois'](manager)
assert rois[0]['x']==10.25 and rois[0]['width']==8
assert rois[1]['x']==5.5 and rois[1]['y']==6.5
image=IJ.openImage(request['sourcePath'])
image.setRoi(manager.getRoi(0))
stats=image.getStatistics()
assert stats.area==64 and stats.mean==100
roi=manager.getRoi(0); roi.setLocation(11.25,20.5)
api['save_return'](request,api['collect_rois'](manager),'fiji')
manager.close()
print('FIJI_NATIVE_ROI_PASS area=%s mean=%s' % (stats.area,stats.mean))
from java.lang import System
System.exit(0)
`
    const testPath=join(directory,'check.py');await writeFile(testPath,test)
    const executable=engine==='napari'?engineExecutable('napari'):process.env.ZEROWALL_FIJI_JAVA || 'C:\\softworks\\fiji\\java\\win64\\zulu21.42.19-ca-jdk21.0.7-win_x64\\bin\\java.exe'
    const args=engine==='napari'?[testPath]:['-cp',join(process.env.ZEROWALL_FIJI_PATH||'C:\\softworks\\fiji','jars','*'),'org.python.util.jython',testPath]
    const env={...await engineEnvironment(engine,executable),ZEROWALL_ANNOTATION_REQUEST:requestPath,TEST_ADAPTER:adapter}
    const output=await new Promise<string>((done,reject)=>{
      const child=spawn(executable,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let log=''
      const timer=setTimeout(()=>{child.kill();reject(new Error(`${engine} timed out: ${log}`))},60000)
      child.stdout.on('data',b=>{log+=b});child.stderr.on('data',b=>{log+=b})
      child.once('error',error=>{clearTimeout(timer);reject(error)})
      child.once('close',code=>{clearTimeout(timer);code===0?done(log):reject(new Error(`${engine} ${code}: ${log}`))})
    })
    store.recordAuditEvent(project.id,'science-engine.lifecycle',{launchId:bridgeId,id:engine,projectId:project.id,sessionId:'test',lifecycleRevision:1,started:true,status:'exited',guiReady:'unverified',path:executable,assetId:asset.id,createdAt:new Date().toISOString(),message:'Native API adapter fixture (not GUI acceptance)',annotationBridge:{viewerId,baseRevisionId:saved.annotationHead!.id,sourceSha256:opened.image!.sourceSha256,returnPath,adapterSha256:createHash('sha256').update(script).digest('hex')}})
    const result=await service.execute(project,{sessionId:'test',action:'annotation_collect',viewerId,expectedVersion:1,launchId:bridgeId})
    const replay=await service.execute(project,{sessionId:'test',action:'annotation_collect',viewerId,expectedVersion:1,launchId:bridgeId})
    if(result.annotationSave!.revision.id!==replay.annotationSave!.revision.id)throw new Error('Collection was not idempotent')
    const returned=JSON.parse(await readFile(returnPath,'utf8'))
    if(returned.payload.rois[0].x!==11.25)throw new Error(`${engine} native edit not returned`)
    report.push({engine,output,annotationSave:result.annotationSave,artifact:result.artifact,idempotentReplay:true,scope:'Native ROI APIs and Host collection, not visual acceptance'})
    console.log(output.trim())
  }
  }
} finally { await writeFile(join(root,'report.json'),JSON.stringify(report,null,2)); engines.dispose();store.close();console.log(`REPORT ${root}`) }
