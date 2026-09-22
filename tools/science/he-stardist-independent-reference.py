"""Independent whole-image model reference, only for bounded test fixtures."""
import os
os.environ['CUDA_VISIBLE_DEVICES']='-1'
os.environ['TF_ENABLE_ONEDNN_OPTS']='0'
os.environ['TF_NUM_INTRAOP_THREADS']='4'
os.environ['TF_NUM_INTEROP_THREADS']='1'
os.environ['OMP_NUM_THREADS']='4'
import json,sys
from pathlib import Path
import numpy as np,tifffile
from stardist.models import StarDist2D
from stardist.matching import matching
from csbdeep.utils import normalize_mi_ma
image=tifffile.imread(sys.argv[1],key=0)
if image.shape[0]*image.shape[1]>4000000:raise ValueError('Full-image reference is only allowed for <=4 million pixel fixtures')
directory=Path(sys.argv[2]);request=json.loads((directory/'request.json').read_text());result=json.loads((directory/'result.json').read_text())
model_path=Path(request['modelDirectory']);model=StarDist2D(None,name=model_path.name,basedir=str(model_path.parent))
low=result['normalization']['lower'][0];high=result['normalization']['upper'][0]
labels,polygons=model.predict_instances(normalize_mi_ma(image,low,high,dtype=np.float32),prob_thresh=request['parameters']['probabilityThreshold'],nms_thresh=request['parameters']['nmsThreshold'],show_tile_progress=False)
actual=tifffile.imread(directory/'labels.tif');metrics=matching(labels,actual,thresh=0.9)._asdict()
matched=matching(labels,actual,thresh=0.9,report_matches=True)
matched_prediction_ids={matched.matched_pairs[index][1] for index in matched.matched_tps}
coordinates=np.load(directory/'polygons.npz');extra=[]
for index in range(len(coordinates['prob'])):
 if index+1 not in matched_prediction_ids:
  center=coordinates['points'][index];extra.append({'id':index+1,'center_yx':center.tolist(),'probability':float(coordinates['prob'][index]),'closestBlockEdgePixels':min(min(abs(float(center[1])-block['x']),abs(float(center[1])-(block['x']+block['width'])),abs(float(center[0])-block['y']),abs(float(center[0])-(block['y']+block['height']))) for block in result['blocks'])})
# Context should preserve model output up to tiny floating point / polygon rasterization differences.
passed=bool(metrics['fp']==0 and metrics['fn']==0 and metrics['mean_true_score']>=0.995)
report={'passed':passed,'acceptance':{'matchingIoU':0.9,'maximumFalsePositives':0,'maximumFalseNegatives':0,'minimumMeanTrueIoU':0.995},'reference':'One direct predict_instances call over the complete bounded test image; same frozen model, normalization and thresholds','singleImageCount':len(polygons['prob']),'tiledCount':result['count'],'metrics':metrics,'unmatchedPredictions':extra,'normalization':result['normalization']}
(directory/'independent-reference.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
