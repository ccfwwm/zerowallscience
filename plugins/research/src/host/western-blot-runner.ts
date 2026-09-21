/** Fixed ImageJ runner. Parameters and all paths are passed in a JSON request. */
export const westernBlotRunner = String.raw`
import os, json, hashlib, math, traceback
from ij import IJ, ImagePlus
from ij.gui import Roi, PolygonRoi
from ij.io import RoiEncoder, FileSaver
from jarray import array
from java.lang import System

def digest(path):
    h=hashlib.sha256()
    with open(path,'rb') as handle:
        while True:
            chunk=handle.read(1048576)
            if not chunk: break
            h.update(chunk)
    return h.hexdigest()

def write_json(path,value):
    with open(path,'wb') as handle:
        handle.write((json.dumps(value,ensure_ascii=True,allow_nan=False,indent=2)+'\n').encode('utf-8'))

def main(request,request_sha):
    if digest(request['sourcePath'])!=request['sourceSha256']: raise ValueError('Source hash mismatch')
    image=IJ.openImage(request['sourcePath'])
    if image is None: raise ValueError('ImageJ could not decode image')
    dimensions=request['annotation']['coordinates']
    if image.getWidth()!=dimensions['width'] or image.getHeight()!=dimensions['height'] or image.getStackSize()!=dimensions['pages']:
        raise ValueError('ImageJ image dimensions disagree with ROI contract')
    depth=image.getBitDepth()
    if depth not in (8,16,32): raise ValueError('Quantification requires raw grayscale 8/16/32-bit data; RGB images are not converted automatically')
    if image.getNChannels()>1 or image.getNFrames()>1: raise ValueError('Hyperstack axes require a specific acquisition contract')
    plan=request['plan']; sat=plan['saturation']
    if depth in (8,16) and (sat['lower']<0 or sat['upper']>2**depth-1): raise ValueError('Saturation limits exceed the stored pixel range')
    rois={item['id']:item for item in request['annotation']['rois']}
    used=sorted(set(lane[key] for lane in plan['lanes'] for key in ('bandRoiId','backgroundRoiId','loadingRoiId','loadingBackgroundRoiId') if key in lane))
    measurements={}; masks={}; outputs=[]
    for index,key in enumerate(used):
        item=rois[key]
        if item['kind']=='rectangle': roi=Roi(float(item['x']),float(item['y']),float(item['width']),float(item['height']))
        else: roi=PolygonRoi(array([float(p[0]) for p in item['points']],'f'),array([float(p[1]) for p in item['points']],'f'),len(item['points']),Roi.POLYGON)
        roi.setName(item['name']); roi.setPosition(item['page']+1)
        roi_path='roi-%04d.roi'%index; RoiEncoder(os.path.join(request['directory'],roi_path)).write(roi); outputs.append(roi_path)
        # Use ImageJ's rasterized ROI mask, not the PNG display preview or a bounding-box surrogate.
        ip=image.getStack().getProcessor(item['page']+1); ip.setRoi(roi)
        bounds=ip.getRoi(); mask=ip.getMask(); total=0.0; count=0; low=0; high=0; minimum=float('inf'); maximum=-float('inf')
        for y in range(bounds.y,bounds.y+bounds.height):
            for x in range(bounds.x,bounds.x+bounds.width):
                if mask is not None and mask.get(x-bounds.x,y-bounds.y)==0: continue
                value=float(ip.getf(x,y))
                if math.isnan(value) or math.isinf(value): raise ValueError('Non-finite source pixel')
                total+=value; count+=1; minimum=min(minimum,value); maximum=max(maximum,value)
                if value<=sat['lower']: low+=1
                if value>=sat['upper']: high+=1
        if count==0: raise ValueError('ROI rasterizes to zero pixels')
        measurements[key]={'roiId':key,'pixels':count,'mean':total/count,'sum':total,'min':minimum,'max':maximum,'clippedLow':low,'clippedHigh':high}
        masks[key]=(item['page'],bounds,mask)
    def overlap(first,second):
        page,a,ma=masks[first]; page_b,b,mb=masks[second]
        if page!=page_b: return False
        for y in range(max(a.y,b.y),min(a.y+a.height,b.y+b.height)):
            for x in range(max(a.x,b.x),min(a.x+a.width,b.x+b.width)):
                if (ma is None or ma.get(x-a.x,y-a.y)!=0) and (mb is None or mb.get(x-b.x,y-b.y)!=0): return True
        return False
    target_ids=[lane['bandRoiId'] for lane in plan['lanes']]+[lane['loadingRoiId'] for lane in plan['lanes'] if 'loadingRoiId' in lane]
    background_ids=set(lane[key] for lane in plan['lanes'] for key in ('backgroundRoiId','loadingBackgroundRoiId') if key in lane)
    for i,a in enumerate(target_ids):
        for b in target_ids[i+1:]:
            if overlap(a,b): raise ValueError('Target/loading ROIs overlap between measurements')
        for b in background_ids:
            if overlap(a,b): raise ValueError('Background overlaps a measured band/loading ROI')
    sign=1 if plan['polarity']=='bright' else -1
    def corrected(band,background):
        return sign*(measurements[band]['sum']-measurements[band]['pixels']*measurements[background]['mean'])
    rows=[]
    for lane in plan['lanes']:
        flags=[]; intensity=corrected(lane['bandRoiId'],lane['backgroundRoiId']); loading=None
        selected=[lane[key] for key in ('bandRoiId','backgroundRoiId','loadingRoiId','loadingBackgroundRoiId') if key in lane]
        if any(measurements[key]['clippedLow']>0 or measurements[key]['clippedHigh']>0 for key in selected): flags.append('clipped_pixels')
        if intensity<=0: flags.append('nonpositive_background_corrected_band')
        normalized=intensity
        if plan['normalization']!='none':
            loading=corrected(lane['loadingRoiId'],lane['loadingBackgroundRoiId'])
            if loading<=0: flags.append('nonpositive_loading_control')
            normalized=intensity/loading if loading>0 else None
        if flags: normalized=None
        rows.append({'sampleId':lane['sampleId'],'biologicalReplicate':lane['biologicalReplicate'],'group':lane['group'],'correctedIntensity':intensity,'loadingCorrectedIntensity':loading,'normalized':normalized,'relativeToControl':None,'flags':flags})
    controls=[row for row in rows if row['group']==plan['controlGroup']]; control_mean=None
    if controls and all(row['normalized'] is not None for row in controls): control_mean=sum(row['normalized'] for row in controls)/len(controls)
    for row in rows:
        if plan['controlGroup'] is not None and control_mean is None: row['flags'].append('control_group_failed_qc')
        elif control_mean is not None and row['normalized'] is not None: row['relativeToControl']=row['normalized']/control_mean
    result={'format':'zerowall-western-blot','version':1,'engine':{'imagej':IJ.getVersion(),'java':System.getProperty('java.version')},'sourceSha256':request['sourceSha256'],'annotationRevisionId':request['annotationRevisionId'],'requestSha256':request_sha,'bitDepth':depth,'measurements':[measurements[key] for key in used],'rows':rows,'controlMean':control_mean,'notes':['ImageJ rasterized raw-pixel measurements; no display LUT, resize, gamma or automatic RGB conversion.','Background correction is signed (sum - pixel count * background mean).','Any clipped band, background or loading pixel blocks normalized values; raw measurements are retained.','Control scaling uses the arithmetic mean of valid control lanes only if every control lane passes QC.','Descriptive lane quantification only. Technical lanes are not independent biological replicates; no significance or mechanism inference.']}
    write_json(os.path.join(request['directory'],'result.json'),result); outputs.append('result.json')
    write_json(os.path.join(request['directory'],'roi-index.json'),[{'roiId':key,'file':'roi-%04d.roi'%index,'annotation':rois[key]} for index,key in enumerate(used)]); outputs.append('roi-index.json')
    # QC overlay in source coordinates; display-only raster conversion does not enter the statistics.
    from ij.gui import Overlay
    from java.awt import Color
    from ij.io import RoiDecoder
    image.setSlice(1); overlay=Overlay()
    for index,key in enumerate(used):
        if rois[key]['page']==0:
            roi=RoiDecoder(os.path.join(request['directory'],'roi-%04d.roi'%index)).getRoi(); roi.setStrokeColor(Color.yellow if key in target_ids else Color.cyan); overlay.add(roi)
    # Keep QC rendering headless: flatten()/IJ.saveAs may initialize ImageJ's AWT menu.
    processor=image.getStack().getProcessor(1).duplicate(); processor.setColor(Color.yellow); processor.setLineWidth(1)
    for index,key in enumerate(used):
        if rois[key]['page']!=0: continue
        item=rois[key]
        if item['kind']=='rectangle': processor.drawRect(int(item['x']),int(item['y']),int(item['width']),int(item['height']))
        else:
            points=item['points']
            for j in range(len(points)): processor.drawLine(int(points[j][0]),int(points[j][1]),int(points[(j+1)%len(points)][0]),int(points[(j+1)%len(points)][1]))
    qc=ImagePlus('QC overlay',processor); FileSaver(qc).saveAsPng(os.path.join(request['directory'],'qc-page-0.png')); qc.close(); outputs.append('qc-page-0.png')
    import csv
    with open(os.path.join(request['directory'],'lanes.csv'),'wb') as handle:
        writer=csv.writer(handle); columns=['sampleId','biologicalReplicate','group','correctedIntensity','loadingCorrectedIntensity','normalized','relativeToControl','flags']; writer.writerow(columns)
        for row in rows:
            writer.writerow([(';'.join(row[key]) if key=='flags' else unicode(row[key]) if row[key] is not None else '').encode('utf-8') for key in columns])
    outputs.append('lanes.csv')
    image.close()
    return [{'path':name,'sha256':digest(os.path.join(request['directory'],name))} for name in outputs]

request_path=os.environ['ZEROWALL_FIJI_REQUEST']
with open(request_path,'rb') as handle: request=json.loads(handle.read().decode('utf-8'))
request_sha=digest(request_path)
try:
    files=main(request,request_sha)
    write_json(os.path.join(request['directory'],'completion.json'),{'status':'succeeded','requestSha256':request_sha,'files':files})
    System.exit(0)
except Exception:
    message=traceback.format_exc()
    write_json(os.path.join(request['directory'],'completion.json'),{'status':'failed','requestSha256':request_sha,'error':message})
    print(message)
    System.exit(1)
`
