"""Trusted CPU health probe; argv[1] is the imported payload directory."""
import contextlib
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import sys

os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
os.environ['OMP_NUM_THREADS'] = '2'
os.environ['TF_NUM_INTRAOP_THREADS'] = '2'
os.environ['TF_NUM_INTEROP_THREADS'] = '1'
with contextlib.redirect_stdout(sys.stderr):
    import numpy as np
    import openslide
    import tensorflow as tf
    from stardist.models import StarDist2D
    tf.config.set_visible_devices([], 'GPU')
    tf.config.threading.set_intra_op_parallelism_threads(2)
    tf.config.threading.set_inter_op_parallelism_threads(1)
    model_dir = Path(sys.argv[1]).resolve() / 'model' / '2D_versatile_he'
    model = StarDist2D(None, name=model_dir.name, basedir=str(model_dir.parent))
    labels, details = model.predict_instances(np.ones((96, 96, 3), dtype=np.float32), prob_thresh=0.6924782541382084, nms_thresh=0.3, show_tile_progress=False)
    if labels.shape != (96, 96) or len(details['prob']) != 0:
        raise RuntimeError('Blank reference image did not produce the expected zero-nuclei mask.')
print(json.dumps({
    'healthy': True,
    'engine': 'he-stardist',
    'cpuOnly': not tf.config.get_visible_devices('GPU'),
    'model': '2D_versatile_he',
    'modelWeightsSha256': hashlib.sha256((model_dir / 'weights_best.h5').read_bytes()).hexdigest(),
    'reference': {'shape': [96, 96, 3], 'nuclei': len(details['prob'])},
    'versions': {name: importlib.metadata.version(name) for name in ['stardist', 'tensorflow', 'numpy', 'csbdeep', 'openslide-python', 'openslide-bin']},
    'openslideLibrary': openslide.__library_version__,
}))
