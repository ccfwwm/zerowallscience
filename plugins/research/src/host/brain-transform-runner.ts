export const BRAIN_TRANSFORM_RUNNER=String.raw`import json, sys, math
from pathlib import Path
import numpy as np
import tifffile

def fail(message):
 print(json.dumps({'error':str(message)}));raise SystemExit(2)

def volume(path):
 try: value=tifffile.memmap(path)
 except Exception as error: fail(f'Transform volumes must be uncompressed memory-mappable TIFF: {error}')
 if value.ndim!=3 or math.prod(value.shape)>256000000: fail('Transform volume must be 3D and at most 256 million voxels')
 return value

try:
 request=json.load(sys.stdin);root=Path(request['directory']);mode=request['action']
 if mode=='atlas-metadata':
  from brainglobe_atlasapi import BrainGlobeAtlas
  atlas=BrainGlobeAtlas('allen_mouse_25um',brainglobe_dir=request['atlasDirectory'],check_latest=False)
  if atlas.orientation!='asr':fail('Unexpected atlas orientation')
  print(json.dumps({'atlasVersion':str(atlas.metadata.get('version','unknown')),'atlasShape':list(atlas.shape),'atlasResolution':list(atlas.resolution)}));raise SystemExit(0)
 source=volume(root/'downsampled.tiff');fields=[volume(root/f'deformation_field_{i}.tiff') for i in range(3)]
 if any(f.shape!=source.shape or f.dtype.kind!='f' for f in fields):fail('Deformation fields must be floating-point volumes matching the downsampled sample shape')
 if mode=='inspect':
  ranges=[]
  for field in fields:
   low=math.inf;high=-math.inf
   for index in range(field.shape[0]):
    plane=field[index]
    if not np.isfinite(plane).all():fail('Deformation field contains non-finite values')
    low=min(low,float(plane.min()));high=max(high,float(plane.max()))
   ranges.append([low,high])
  from brainglobe_atlasapi import BrainGlobeAtlas
  from importlib.metadata import version
  atlas=BrainGlobeAtlas('allen_mouse_25um',brainglobe_dir=request['atlasDirectory'],check_latest=False)
  if atlas.orientation!='asr':fail('Unexpected atlas orientation')
  print(json.dumps({'sourceShape':list(source.shape),'fieldRangesMillimeter':ranges,'producer':{'brainreg':version('brainreg'),'atlasapi':version('brainglobe-atlasapi')},'atlasVersion':str(atlas.metadata.get('version','unknown')),'atlasShape':list(atlas.shape),'atlasResolution':list(atlas.resolution)}));raise SystemExit(0)
 contract=request['contract']
 if list(source.shape)!=contract['sourceShape']:fail('Downsampled shape differs from saved transform contract')
 coordinates=request.get('coordinates');rows=[]
 if not isinstance(coordinates,list) or not 1<=len(coordinates)<=100000:fail('Provide 1-100000 coordinates')
 for index,raw in enumerate(coordinates):
  if not isinstance(raw,list) or len(raw)!=3 or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) for v in raw):fail('Coordinates require three finite numeric downsampled ASR voxel values')
  point=np.asarray(raw,dtype=float)
  if np.any(point<0) or np.any(point>np.asarray(source.shape)-1):
   rows.append({'index':index,'source':raw,'atlasMicron':None,'status':'outside-source-grid'});continue
  lower=np.floor(point).astype(int);upper=np.minimum(lower+1,np.asarray(source.shape)-1);weight=point-lower
  mapped=np.zeros(3,dtype=float)
  for mask in range(8):
   pick=[upper[i] if mask&(1<<i) else lower[i] for i in range(3)]
   factor=math.prod(weight[i] if mask&(1<<i) else 1-weight[i] for i in range(3))
   for axis,field in enumerate(fields):mapped[axis]+=float(field[tuple(pick)])*factor
  if not np.isfinite(mapped).all():fail('Transform interpolation returned a non-finite value')
  micron=mapped*1000;voxel=micron/contract['atlasResolution']
  status='outside-atlas' if np.any(voxel<0) or np.any(voxel>=contract['atlasShape']) else 'mapped'
  rows.append({'index':index,'source':raw,'atlasMicron':micron.tolist(),'status':status})
 print(json.dumps({'rows':rows,'mapped':sum(r['status']=='mapped' for r in rows),'outsideSourceGrid':sum(r['status']=='outside-source-grid' for r in rows),'outsideAtlas':sum(r['status']=='outside-atlas' for r in rows),'coordinateSpace':'brainreg-downsampled-asr-voxel','targetSpace':'atlas-asr-micron','scientificReview':'pending'}))
except SystemExit:raise
except Exception as error:fail(f'{type(error).__name__}: {error}')
`
