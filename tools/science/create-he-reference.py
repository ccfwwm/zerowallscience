"""Create an uncompressed tiled 3-level TIFF with known colors and calibration."""
import argparse
import json
from pathlib import Path
import numpy as np
import tifffile

parser = argparse.ArgumentParser()
parser.add_argument('output',type=Path)
args = parser.parse_args()
args.output.parent.mkdir(parents=True,exist_ok=True)
image = np.full((384,512,3),[240,220,220],dtype=np.uint8)
image[64:192,128:384] = [80,60,120]
with tifffile.TiffWriter(args.output) as writer:
    for level in range(3):
        step = 2**level
        writer.write(image[::step,::step],photometric='rgb',tile=(128,128),compression=None,
            subfiletype=0 if level==0 else 1,resolution=(40000/step,20000/step),resolutionunit='CENTIMETER',metadata=None)
print(json.dumps({'path':str(args.output),'levels':[[512,384],[256,192],[128,96]],
    'calibration_um_per_pixel':{'x':0.25,'y':0.5},'roi':{'x':128,'y':64,'width':128,'height':64},
    'roi_mean_rgb':[80,60,120],'purpose':'synthetic tiled HE software reference; no biological claim'}))
