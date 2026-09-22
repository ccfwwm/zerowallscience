import type { ImageAnnotations } from '@zerowallscience/research-store/types'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { open, readFile, readdir, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'
import { fijiJava } from './fiji-workflow.js'
import { cfuMeasurement, colonyMeasurement, scratchWoundMeasurement, tubeMeasurement, type FijiImageConfig, type FijiImageResult } from '../shared/fiji-experiments.js'

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
/** Parameters are data; this fixed script is the only code executed by ImageJ. */
export const fijiImageRunner = String.raw`
import os,json,hashlib,traceback,math
from ij import IJ,ImagePlus
from ij.process import ByteProcessor,ImageProcessor
from ij.measure import ResultsTable,Measurements,Calibration
from ij.plugin.filter import ParticleAnalyzer
from ij.io import FileSaver,RoiEncoder
from ij.gui import Roi,PolygonRoi
from java.lang import System
def digest(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        while True:
            b=f.read(1048576)
            if not b: break
            h.update(b)
    return h.hexdigest()
def save(name,value):
    with open(os.path.join(directory,name),'wb') as f: f.write((json.dumps(value,allow_nan=False,indent=2)+'\n').encode('utf-8'))
request_path=os.environ['ZEROWALL_FIJI_REQUEST']
request=json.load(open(request_path));directory=request['directory']
try:
    if digest(request['sourcePath'])!=request['sourceSha256']: raise ValueError('Source hash mismatch')
    image=IJ.openImage(request['sourcePath'])
    if image is None: raise ValueError('ImageJ cannot open source')
    if image.getBitDepth()!=8 or image.getStackSize()!=1: raise ValueError('Requires raw 8-bit grayscale single-plane image; no implicit rescaling or channel conversion')
    if image.getWidth()*image.getHeight()>25000000: raise ValueError('Image exceeds 25 million pixel limit')
    c=request['config'];r=c['roi'];x,y,w,h=[r[k] for k in ('x','y','width','height')]
    if any(isinstance(v,bool) or int(v)!=v for v in (x,y,w,h)) or min(x,y)<0 or min(w,h)<1 or x+w>image.getWidth() or y+h>image.getHeight(): raise ValueError('ROI outside image')
    x,y,w,h=map(int,(x,y,w,h));threshold=c['threshold']
    if not isinstance(threshold,(int,float)) or math.isnan(threshold) or math.isinf(threshold) or threshold<0 or threshold>255: raise ValueError('Invalid threshold')
    if c['polarity'] not in ('bright','dark'): raise ValueError('Invalid polarity')
    roi=Roi(x,y,w,h);RoiEncoder(os.path.join(directory,'analysis.roi')).write(roi)
    processor=image.getProcessor();processor.setRoi(roi);crop=processor.crop();mask=ByteProcessor(w,h)
    # Native ImageJ LUT creates the exact inclusive threshold mask without display scaling.
    from jarray import array
    lut=array([255 if (v>=threshold if c['polarity']=='bright' else v<=threshold) else 0 for v in range(256)],'i')
    mask=crop.duplicate();mask.applyTable(lut)
    automatic=mask.duplicate()
    if not FileSaver(ImagePlus('automatic mask',automatic)).saveAsPng(os.path.join(directory,'automatic-mask.png')): raise ValueError('Cannot save automatic mask')
    review=request.get('review')
    if review:
        document=review['payload'];coordinates=document['coordinates']
        if coordinates['width']!=image.getWidth() or coordinates['height']!=image.getHeight() or coordinates['pages']!=1: raise ValueError('Accepted annotation dimensions differ from source image')
        by_id={item['id']:item for item in document['rois']}
        def area_roi(item):
            if item['page']!=0 or item['kind']=='point': raise ValueError('Mask revision requires single-page area ROIs')
            if item['kind']=='rectangle': return Roi(float(item['x'])-x,float(item['y'])-y,float(item['width']),float(item['height']))
            return PolygonRoi(array([float(p[0])-x for p in item['points']],'f'),array([float(p[1])-y for p in item['points']],'f'),len(item['points']),Roi.POLYGON)
        def fill_regions(target,ids,value):
            target.setValue(value)
            for key in ids: target.fill(area_roi(by_id[key]))
        if 'foregroundRoiIds' in review:
            mask=ByteProcessor(w,h);fill_regions(mask,review['foregroundRoiIds'],255)
        exclusions=ByteProcessor(w,h);fill_regions(exclusions,review['excludedRoiIds'],255)
        for row in range(h):
            for col in range(w):
                if exclusions.get(col,row): mask.set(col,row,0)
        if not FileSaver(ImagePlus('excluded regions',exclusions)).saveAsPng(os.path.join(directory,'exclusion-mask.png')): raise ValueError('Cannot save exclusions')
        save('accepted-review.json',review)
    foreground=int(mask.getHistogram()[255])
    if not FileSaver(ImagePlus('threshold mask',mask)).saveAsPng(os.path.join(directory,'mask.png')): raise ValueError('Cannot save mask')
    overlay=crop.convertToRGB()
    for row in range(h):
        for col in range(w):
            if mask.get(col,row) and (col==0 or row==0 or col==w-1 or row==h-1 or any(mask.get(nx,ny)==0 for nx,ny in ((col-1,row),(col+1,row),(col,row-1),(col,row+1)))): overlay.set(col,row,0xff3030)
    if not FileSaver(ImagePlus('segmentation boundary',overlay)).saveAsPng(os.path.join(directory,'overlay.png')): raise ValueError('Cannot save overlay')
    areas=[];discarded=0
    topology=None
    if c['kind']=='tube-formation':
        from sc.fiji.skeletonize3D import Skeletonize3D_
        from sc.fiji.analyzeSkeleton import AnalyzeSkeleton_
        scale=c['unitScale']
        if not isinstance(scale,(int,float)) or math.isnan(scale) or math.isinf(scale) or scale<=0 or c['unit'] not in ('pixel','um','mm') or (c['unit']=='pixel' and scale!=1): raise ValueError('Invalid isotropic pixel calibration')
        skeleton=ImagePlus('skeleton',mask.duplicate());cal=Calibration();cal.pixelWidth=scale;cal.pixelHeight=scale;cal.pixelDepth=scale;cal.setUnit(c['unit']);skeleton.setCalibration(cal)
        thinner=Skeletonize3D_();thinner.setup('',skeleton);thinner.run(skeleton.getProcessor())
        analyzer=AnalyzeSkeleton_();analyzer.setup('',skeleton);native=analyzer.run(AnalyzeSkeleton_.NONE,False,False,None,True,False)
        native_array=lambda value:None if value is None else list(value)
        fields={'trees':int(native.getNumOfTrees()),'branches':native_array(native.getBranches()),'endPoints':native_array(native.getEndPoints()),'junctions':native_array(native.getJunctions()),'junctionVoxels':native_array(native.getJunctionVoxels()),'slabs':native_array(native.getSlabs()),'triplePoints':native_array(native.getTriples()),'quadruplePoints':native_array(native.getQuadruples()),'averageBranchLength':native_array(native.getAverageBranchLength()),'maximumBranchLength':native_array(native.getMaximumBranchLength()),'numberOfVoxels':native_array(native.getNumberOfVoxels()),'shortestPathList':native_array(native.getShortestPathList()),'shortestPathStartPosition':None if native.getSpStartPosition() is None else [native_array(row) for row in native.getSpStartPosition()]}
        points=lambda values:[{'x':int(p.x),'y':int(p.y),'z':int(p.z)} for p in (values or [])]
        graphs=[];edges=[]
        for gi,g in enumerate(native.getGraph() or []):
            vertices=g.getVertices();ge=g.getEdges();graphs.append({'vertices':vertices.size(),'vertexPoints':[points(v.getPoints()) for v in vertices],'edges':ge.size(),'independentCycles':max(0,ge.size()-vertices.size()+1)})
            for ei,e in enumerate(ge):edges.append({'tree':gi,'edge':ei,'v1':vertices.indexOf(e.getV1()),'v2':vertices.indexOf(e.getV2()),'length':float(e.getLength()),'slabs':points(e.getSlabs())})
        points=lambda values:[{'x':int(p.x),'y':int(p.y),'z':int(p.z)} for p in (values or [])]
        topology={'pluginFields':fields,'graphs':graphs,'edges':edges,'endPoints':points(native.getListOfEndPoints()),'junctionVoxels':points(native.getListOfJunctionVoxels()),'slabVoxels':points(native.getListOfSlabVoxels()),'startingSlabVoxels':points(native.getListOfStartingSlabVoxels()),'meshDefinition':'Independent graph cycles E-V+C, not spatial mesh regions','lengthDefinition':'Sum of AnalyzeSkeleton edge.getLength using explicit isotropic calibration','pruning':'none','skeletonPixels':int(skeleton.getProcessor().getHistogram()[255]),'plugins':request['plugins']}
        if not FileSaver(skeleton).saveAsPng(os.path.join(directory,'skeleton.png')): raise ValueError('Cannot save skeleton')
        tags=analyzer.getResultImage(False)
        tagged=ImagePlus('skeleton tags',tags) if tags is not None else ImagePlus('empty skeleton tags',mask.duplicate())
        if not FileSaver(tagged).saveAsTiff(os.path.join(directory,'skeleton-tags.tif')): raise ValueError('Cannot save raw skeleton tags')
        save('skeleton-topology.json',topology)
        with open(os.path.join(directory,'particles.csv'),'wb') as f:f.write(('tree,edge,v1,v2,length_'+c['unit']+'\n'+'\n'.join('%s,%s,%s,%s,%s'%(e['tree'],e['edge'],e['v1'],e['v2'],e['length']) for e in edges)+'\n').encode('utf-8'))
    elif c['kind']!='scratch-wound':
        low,high=c['minArea'],c['maxArea']
        if int(low)!=low or int(high)!=high or low<1 or high<low: raise ValueError('Invalid particle area bounds')
        mask.setThreshold(255,255,ImageProcessor.NO_LUT_UPDATE);table=ResultsTable()
        analyzer=ParticleAnalyzer(0,Measurements.AREA|Measurements.CENTROID,table,1,float('inf'))
        particle_image=ImagePlus('particles',mask.duplicate());particle_image.setCalibration(Calibration())
        particle_image.getProcessor().setThreshold(255,255,ImageProcessor.NO_LUT_UPDATE)
        if not analyzer.analyze(particle_image): raise ValueError('ImageJ ParticleAnalyzer failed')
        rows=['index,area_pixel,x_roi,y_roi,accepted']
        for i in range(table.size()):
            area=int(round(table.getValue('Area',i)));keep=low<=area<=high
            if keep: areas.append(area)
            else: discarded+=1
            rows.append('%s,%s,%s,%s,%s'%(i,area,table.getValue('X',i),table.getValue('Y',i),str(keep).lower()))
        with open(os.path.join(directory,'particles.csv'),'wb') as f:f.write(('\n'.join(rows)+'\n').encode('utf-8'))
    else:
        with open(os.path.join(directory,'particles.csv'),'wb') as f:f.write('foreground_pixels\n%s\n'%foreground)
    result={'width':w,'height':h,'foregroundPixels':foreground,'componentAreas':areas,'discardedComponents':discarded,'imageJVersion':IJ.getVersion(),'javaVersion':System.getProperty('java.version'),'connectivity':8}
    if topology is not None: result['nativeSkeleton']=topology
    save('imagej-result.json',result);save('roi.json',{'roi':r,'sourceSha256':request['sourceSha256'],'coordinates':'source pixels','overlayCoordinates':'ROI-local pixels'})
    names=['automatic-mask.png','mask.png','overlay.png','analysis.roi','particles.csv','roi.json','imagej-result.json']
    if review: names.extend(['exclusion-mask.png','accepted-review.json'])
    if topology is not None: names.extend(['skeleton.png','skeleton-tags.tif','skeleton-topology.json'])
    save('completion.json',{'status':'succeeded','requestSha256':digest(request_path),'files':[{'name':name,'sha256':digest(os.path.join(directory,name))} for name in names]})
except:
    traceback.print_exc();save('completion.json',{'status':'failed','requestSha256':digest(request_path)})
    System.exit(1)
System.exit(0)
`

let active = false
export async function runImageJExperiment(directory: string, source: Buffer, config: FijiImageConfig, signal?: AbortSignal, review?: { annotationRevisionId: string; excludedRoiIds: string[]; foregroundRoiIds?: string[]; reason: string; payload: ImageAnnotations }): Promise<{ analysis: FijiImageResult; files: Array<{ name: string; checksum: string }>; runnerSha256: string }> {
  signal?.throwIfAborted()
  if (config.review && !review) throw new Error('Mask review requires Host-validated accepted annotation data.')
  if (active) throw new Error('Another local ImageJ experiment is running; retry after it completes.')
  active = true
  try {
    const java = await fijiJava(); const sourcePath=join(directory,'source-image'); const requestPath=join(directory,'imagej-request.json'); const scriptPath=join(directory,'imagej-runner.py')
    const plugins:Array<{name:string;sha256:string}>=[]; const pluginPaths:string[]=[]
    if(config.kind==='tube-formation'){
      const pluginDirectory=join(dirname(dirname(java.jars)),'plugins');const names=await readdir(pluginDirectory)
      for(const prefix of ['AnalyzeSkeleton_', 'Skeletonize3D_']){const matches=names.filter(name=>name.startsWith(prefix+'-')&&name.endsWith('.jar'));if(matches.length!==1)throw new Error(`Exactly one installed ${prefix} plugin is required.`);const name=matches[0]!;const path=join(pluginDirectory,name);plugins.push({name,sha256:hash(await readFile(path))});pluginPaths.push(path)}
    }
    const request=JSON.stringify({directory,sourcePath,sourceSha256:hash(source),plugins,...(review?{review}:{}),config:{...config,kind:config.kind??'bacterial-cfu'}},null,2)+'\n'
    await writeFile(sourcePath,source,{flag:'wx'});await writeFile(requestPath,request,{flag:'wx'});await writeFile(scriptPath,fijiImageRunner,{flag:'wx'})
    const log=await open(join(directory,'imagej.log'),'wx')
    try { await new Promise<void>((resolve,reject)=>{
      signal?.throwIfAborted()
      const child=spawn(java.executable,['-Xmx512m','-Djava.awt.headless=true','-XX:ActiveProcessorCount=2','-cp',[java.jars,...pluginPaths].join(delimiter),'org.python.util.jython',scriptPath],{cwd:directory,env:{...process.env,ZEROWALL_FIJI_REQUEST:requestPath},shell:false,windowsHide:true,stdio:['ignore',log.fd,log.fd]})
      let interruption:string|undefined
      const abort=()=>{interruption='ImageJ cancelled; partial files and logs retained.';child.kill()}
      signal?.addEventListener('abort',abort,{once:true})
      const timer=setTimeout(()=>{interruption='ImageJ timed out after 120 seconds; logs retained.';child.kill()},120000)
      const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
      child.once('error',error=>{cleanup();reject(error)});child.once('exit',code=>{cleanup();code===0&&!interruption?resolve():reject(new Error(interruption??`ImageJ exited ${code}; inspect imagej.log.`))})
    }) } finally { await log.close() }
    const completion=JSON.parse(await readFile(join(directory,'completion.json'),'utf8'))
    const expected=['automatic-mask.png','mask.png','overlay.png','analysis.roi','particles.csv','roi.json','imagej-result.json',...(review?['exclusion-mask.png','accepted-review.json']:[]),...(config.kind==='tube-formation'?['skeleton.png','skeleton-tags.tif','skeleton-topology.json']:[])]
    if(completion.status!=='succeeded'||completion.requestSha256!==hash(request)||!Array.isArray(completion.files)||completion.files.length!==expected.length)throw new Error('ImageJ completion manifest is invalid.')
    const files:Array<{name:string;checksum:string}>=[]
    for(const name of expected){const item=completion.files.find((entry:{name:string})=>entry.name===name);const bytes=await readFile(join(directory,name));if(!item||hash(bytes)!==item.sha256)throw new Error('ImageJ output checksum mismatch.');files.push({name,checksum:item.sha256})}
    const raw=JSON.parse(await readFile(join(directory,'imagej-result.json'),'utf8'))
    const notes=[`ImageJ ${raw.imageJVersion}; Java ${raw.javaVersion}; native threshold${config.kind==='tube-formation'?' and Skeletonize3D/AnalyzeSkeleton':' and 8-connected ParticleAnalyzer'}.`, 'ROI-local mask and boundary overlay retained; touching objects are not split automatically.']
    let measurement
    if(config.kind==='tube-formation'){
      const topology=raw.nativeSkeleton;const fields=topology.pluginFields
      measurement=tubeMeasurement({...config,length:topology.edges.reduce((sum:number,edge:{length:number})=>sum+edge.length,0),endpoints:(fields.endPoints??[]).reduce((sum:number,value:number)=>sum+value,0),junctions:(fields.junctions??[]).reduce((sum:number,value:number)=>sum+value,0),segments:(fields.branches??[]).reduce((sum:number,value:number)=>sum+value,0),meshes:topology.graphs.reduce((sum:number,graph:{independentCycles:number})=>sum+graph.independentCycles,0)})
      measurement.flags.push('meshes_are_independent_graph_cycles');raw.skeletonPixels=topology.skeletonPixels
      notes.push(topology.meshDefinition,topology.lengthDefinition,...plugins.map(plugin=>`${plugin.name}; SHA256 ${plugin.sha256}`))
    }else if(config.kind==='scratch-wound')measurement=scratchWoundMeasurement({...config,remainingArea:raw.foregroundPixels})
    else if(config.kind==='colony-formation'){
      if(config.stainUnit&&!['pixel','um2','mm2'].includes(config.stainUnit))throw new Error('Unknown area unit.')
      if(config.stainUnit&&config.stainUnit!=='pixel'&&(typeof config.pixelArea!=='number'||!Number.isFinite(config.pixelArea)||config.pixelArea<=0))throw new Error('Physical stained area requires positive pixelArea calibration.')
      measurement=colonyMeasurement({wellId:config.wellId,independentCount:raw.componentAreas.length,...(config.seededCells===undefined?{}:{seededCells:config.seededCells}),...(config.stainUnit?{stainUnit:config.stainUnit,stainedArea:raw.componentAreas.reduce((sum:number,value:number)=>sum+value,0)*(config.stainUnit==='pixel'?1:config.pixelArea!)}:{})})
    }else measurement=cfuMeasurement({...config,colonyCount:raw.componentAreas.length})
    if (review) notes.push('Accepted ROI masks are rasterized in source pixel coordinates; exclusions are not extrapolated to unseen tissue or plate area.', 'Automatic mask, accepted mask, exclusion mask and annotation revision are retained separately.')
    return {analysis:{...raw,measurement,notes},files:[...files,...await Promise.all(['completion.json','imagej-request.json','imagej-runner.py','imagej.log'].map(async name=>({name,checksum:hash(await readFile(join(directory,name)))})))],runnerSha256:hash(fijiImageRunner)}
  }finally{active=false}
}
