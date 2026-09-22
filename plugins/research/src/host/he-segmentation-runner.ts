/** Fixed CPU runner. OpenSlide reads individual halo blocks; the full RGB image is never materialized. */
export const HE_SEGMENTATION_RUNNER = String.raw`
import os,sys,json,hashlib,math,time,traceback,csv
from pathlib import Path
request=json.load(open(os.environ['ZEROWALL_HE_REQUEST'],encoding='utf-8'))
directory=Path(request['directory']);parameters=request['parameters']
os.environ['CUDA_VISIBLE_DEVICES']='-1'
os.environ['TF_ENABLE_ONEDNN_OPTS']='0'
os.environ['TF_NUM_INTRAOP_THREADS']=str(parameters['threads'])
os.environ['TF_NUM_INTEROP_THREADS']='1'
os.environ['OMP_NUM_THREADS']=str(parameters['threads'])
os.environ['TF_CPP_MIN_LOG_LEVEL']='2'
def digest(path):
 h=hashlib.sha256()
 with open(path,'rb') as handle:
  for block in iter(lambda:handle.read(1048576),b''):h.update(block)
 return h.hexdigest()
def write_json(name,value):
 path=directory/name;temporary=directory/(name+'.tmp')
 temporary.write_text(json.dumps(value,allow_nan=False,indent=2)+'\n',encoding='utf-8');temporary.replace(path)
try:
 import numpy as np,openslide,tifffile,tensorflow as tf
 from PIL import Image,ImageDraw
 from stardist.models import StarDist2D
 from csbdeep.utils import normalize_mi_ma
 tf.config.set_visible_devices([],'GPU');tf.config.threading.set_intra_op_parallelism_threads(parameters['threads']);tf.config.threading.set_inter_op_parallelism_threads(1)
 source=Path(request['sourcePath']);source_stat=source.stat()
 if digest(source)!=request['sourceSha256']:raise ValueError('Source SHA-256 mismatch')
 model_directory=Path(request['modelDirectory'])
 for item in request['model']['files']:
  if digest(model_directory/item['path'])!=item['sha256']:raise ValueError('Model file SHA-256 mismatch: '+item['path'])
 model=StarDist2D(None,name=model_directory.name,basedir=str(model_directory.parent))
 if model.config.n_channel_in!=3 or model.config.n_dim!=2:raise ValueError('Requires the frozen 2D RGB H&E model')
 region=request['region'];slide=openslide.OpenSlide(str(source));level=region['page'];downsample=float(slide.level_downsamples[level]);width=int(math.ceil(region['width']/downsample));height=int(math.ceil(region['height']/downsample))
 sample_width,sample_height=width,height
 if width*height>64000000 or min(width,height)<64:raise ValueError('Segmentation ROI must have at least 64 pixels per axis and at most 64 million sampled pixels')
 if region['x']<0 or region['y']<0 or region['x']+region['width']>slide.dimensions[0] or region['y']+region['height']>slide.dimensions[1]:raise ValueError('ROI outside source dimensions')
 width=int(math.ceil(width/16))*16;height=int(math.ceil(height/16))*16
 max_block=parameters['tileSize']+2*parameters['halo']+128
 reads=[];candidates=[0]
 def rgb(y,x,h,w):
  if h*w>max(max_block*max_block,512*512):raise ValueError('Decoded block exceeds bounded halo size')
  actual_w=min(w,sample_width-x);actual_h=min(h,sample_height-y)
  if actual_w<1 or actual_h<1:raise ValueError('Read starts outside source ROI')
  rgba=slide.read_region((region['x']+int(round(x*downsample)),region['y']+int(round(y*downsample))),level,(actual_w,actual_h))
  image=Image.new('RGB',rgba.size,'white');image.paste(rgba,mask=rgba.getchannel('A'));array=np.asarray(image)
  return np.pad(array,((0,h-actual_h),(0,w-actual_w),(0,0)),mode='reflect') if h!=actual_h or w!=actual_w else array
 # Bounded deterministic stratified sample, shared normalization for every block.
 samples=[]
 for y in sorted(set(int(v) for v in np.linspace(0,max(0,sample_height-128),min(8,max(1,math.ceil(sample_height/128)))))):
  for x in sorted(set(int(v) for v in np.linspace(0,max(0,sample_width-128),min(8,max(1,math.ceil(sample_width/128)))))):
   samples.append(rgb(y,x,min(128,sample_height-y),min(128,sample_width-x)).reshape(-1,3))
 sample=np.concatenate(samples);lower=float(np.percentile(sample,1));upper=float(np.percentile(sample,99.8));sample_pixels=len(sample);del sample,samples
 if upper<=lower:lower,upper=0.,255.
 class LazyRegion:
  shape=(height,width,3);ndim=3;dtype=np.dtype('float32')
  def __getitem__(self,key):
   sy,sx,sc=key;y0,y1,ys=sy.indices(height);x0,x1,xs=sx.indices(width)
   if ys!=1 or xs!=1 or sc.indices(3)!=(0,3,1):raise ValueError('Unsupported lazy block slice')
   reads.append({'x':x0,'y':y0,'width':x1-x0,'height':y1-y0});write_json('progress.json',{'stage':'segmenting','blocksRead':len(reads),'lastBlock':reads[-1]})
   return normalize_mi_ma(rgb(y0,x0,y1-y0,x1-x0),lower,upper,dtype=np.float32)
 labels=np.memmap(directory/'labels.raw',mode='w+',dtype='int32',shape=(height,width))
 original_predict=model.predict_instances
 def predict(*args,**kwargs):
  result=original_predict(*args,**kwargs);candidates[0]+=len(result[1]['prob']);return result
 model.predict_instances=predict
 _,polys=model.predict_instances_big(LazyRegion(),axes='YXC',block_size=(min(height,max_block),min(width,max_block),3),min_overlap=(128 if height>max_block else 0,128 if width>max_block else 0,0),context=(parameters['halo'] if height>max_block else 0,parameters['halo'] if width>max_block else 0,0),labels_out=labels,show_progress=False,prob_thresh=parameters['probabilityThreshold'],nms_thresh=parameters['nmsThreshold'],show_tile_progress=False)
 count=len(polys['prob'])
 if count>100000:raise ValueError('ROI exceeds 100000 nuclei result limit; split the ROI')
 centers=np.asarray(polys['points']);coords=np.asarray(polys['coord']);prob=np.asarray(polys['prob'])
 keep=(centers[:,0]*downsample<region['height'])&(centers[:,1]*downsample<region['width']) if count else np.zeros(0,dtype=bool)
 remap=np.zeros(count+1,dtype=np.int32);remap[np.flatnonzero(keep)+1]=np.arange(1,int(keep.sum())+1);centers=centers[keep];coords=coords[keep];prob=prob[keep];count=len(prob)
 area=np.zeros(count+1,dtype=np.int64)
 def label_tiles():
  for y in range(0,sample_height,256):
   for x in range(0,sample_width,256):
    block=remap[np.asarray(labels[y:min(y+256,sample_height),x:min(x+256,sample_width)])];area[:]+=np.bincount(block.ravel(),minlength=count+1)
    padded=np.zeros((256,256),dtype=np.uint32);padded[:block.shape[0],:block.shape[1]]=block;yield padded
 tifffile.imwrite(directory/'labels.tif',data=label_tiles(),shape=(sample_height,sample_width),dtype=np.uint32,tile=(256,256),photometric='minisblack',metadata={'axes':'YX','sourceSha256':request['sourceSha256'],'coordinates':'ROI-local selected-level pixels'},bigtiff=False)
 preview_scale=min(1.,1024./max(sample_width,sample_height));pw=max(1,int(round(sample_width*preview_scale)));ph=max(1,int(round(sample_height*preview_scale)))
 preview=Image.new('RGB',(pw,ph),'white')
 for y in range(0,sample_height,512):
  for x in range(0,sample_width,512):
   h=min(512,sample_height-y);w=min(512,sample_width-x);left=int(round(x*preview_scale));top=int(round(y*preview_scale));right=int(round((x+w)*preview_scale));bottom=int(round((y+h)*preview_scale))
   if right>left and bottom>top:preview.paste(Image.fromarray(rgb(y,x,h,w)).resize((right-left,bottom-top)),(left,top))
 draw=ImageDraw.Draw(preview)
 boundary=[]
 with open(directory/'nuclei.csv','w',newline='',encoding='utf-8') as f:
  writer=csv.writer(f);writer.writerow(['id','center_x_level0','center_y_level0','area_sample_pixels','probability','touches_roi_boundary'])
  for i,(center,polygon,p) in enumerate(zip(centers,coords,prob)):
   edge=bool((polygon[0]<=0).any() or (polygon[1]<=0).any() or (polygon[0]*downsample>=region['height']-downsample).any() or (polygon[1]*downsample>=region['width']-downsample).any());boundary.append(edge)
   writer.writerow([i+1,region['x']+float(center[1])*downsample,region['y']+float(center[0])*downsample,int(area[i+1]),float(p),edge])
   points=[(float(x)*preview_scale,float(y)*preview_scale) for y,x in zip(polygon[0],polygon[1])];draw.line(points+[points[0]],fill=(255,170,0) if edge else (0,240,90),width=1)
 preview.save(directory/'overlay.png');np.savez_compressed(directory/'polygons.npz',coord=coords,points=centers,prob=prob,sourceOffset=np.array([region['y'],region['x']]),downsample=np.array(downsample))
 normalization={'lower':[lower]*3,'upper':[upper]*3,'samplePixels':sample_pixels,'method':'Shared pooled RGB percentiles 1/99.8 from <=64 deterministic 128x128 stratified patches; constant sample falls back to 0/255'}
 model_record={k:request['model'][k] for k in ('name','sha256','source','license')}
 result={'format':'zerowall-he-stardist','version':1,'sourceSha256':request['sourceSha256'],'region':region,'count':count,'boundaryCount':sum(boundary),'sampleWidth':sample_width,'sampleHeight':sample_height,'downsample':downsample,'model':model_record,'parameters':parameters,'normalization':normalization,'tiles':len(reads),'deduplication':{'algorithm':'StarDist predict_instances_big BlockND.filter_objects responsibility partition; objects must fit within 128px overlap','removed':candidates[0]-count},'calibration':request['calibration'],'preview':{'width':pw,'height':ph},'notes':['Research nuclei segmentation, not a diagnostic or disease-specific model.','Predictions use the selected pyramid level; suitability requires checking stain and apparent nucleus size.','Counts use centers within the requested level-0 ROI; boundary nuclei are flagged and may be incomplete.','Deduplication removed count includes context-discarded predictions, not only duplicate objects.','Halo blocks are decoded separately, and label output is disk-backed; maximum object extent is enforced by the native block assembler.'],'blocks':reads}
 if request['calibration']:
  c=request['calibration'];physical_area=region['width']*c['x']*region['height']*c['y'];result['physical']={'roiAreaUm2':physical_area,'nucleiPerMm2':count/physical_area*1000000}
 if source.stat().st_size!=source_stat.st_size or source.stat().st_mtime_ns!=source_stat.st_mtime_ns or digest(source)!=request['sourceSha256']:raise ValueError('Source changed during segmentation')
 write_json('result.json',result);labels.flush();labels._mmap.close();del labels;slide.close();(directory/'labels.raw').unlink()
 files=['result.json','labels.tif','nuclei.csv','overlay.png','polygons.npz']
 write_json('completion.json',{'status':'succeeded','requestSha256':digest(os.environ['ZEROWALL_HE_REQUEST']),'files':[{'name':name,'sha256':digest(directory/name),'size':(directory/name).stat().st_size} for name in files]})
 write_json('progress.json',{'stage':'succeeded','blocksRead':len(reads),'nuclei':count})
except:
 traceback.print_exc();write_json('completion.json',{'status':'failed','requestSha256':digest(os.environ['ZEROWALL_HE_REQUEST'])});sys.exit(1)
`
