// Kept inside the Host bundle. Only structured JSON crosses stdin; no user Python.
export const HE_READER = String.raw`
import base64, io, json, math, sys
from PIL import Image
import openslide

def positive(value):
    try:
        number=float(value)
        return number if math.isfinite(number) and number>0 else None
    except (TypeError,ValueError): return None

try:
    request=json.load(sys.stdin)
    with openslide.OpenSlide(request['path']) as slide:
        width,height=slide.dimensions
        properties=dict(slide.properties)
        levels=[{'level':index,'width':size[0],'height':size[1],'downsample':float(slide.level_downsamples[index])} for index,size in enumerate(slide.level_dimensions)]
        mx,my=positive(properties.get('openslide.mpp-x')),positive(properties.get('openslide.mpp-y'))
        calibration_source='openslide.mpp'
        if mx is None or my is None:
            unit=properties.get('tiff.ResolutionUnit','').lower()
            scale=10000 if unit in ('centimeter','3') else 25400 if unit in ('inch','2') else None
            rx,ry=positive(properties.get('tiff.XResolution')),positive(properties.get('tiff.YResolution'))
            if scale and rx and ry: mx,my=scale/rx,scale/ry; calibration_source='TIFF resolution tags'
        calibration={'x':mx,'y':my,'unit':'um','source':calibration_source} if mx and my else None
        bounds={'x':0,'y':0,'width':width,'height':height,'source':'full-slide'}
        names=['x','y','width','height']
        if all('openslide.bounds-'+name in properties for name in names):
            values={name:int(properties['openslide.bounds-'+name]) for name in names}
            if values['x']>=0 and values['y']>=0 and values['width']>0 and values['height']>0 and values['x']+values['width']<=width and values['y']+values['height']<=height:
                bounds={**values,'source':'openslide.bounds'}
        summary={'width':width,'height':height,'pages':len(levels),'format':properties.get('openslide.vendor','unknown'),
            'engine':'openslide','engineVersion':openslide.__library_version__,'bindingVersion':openslide.__version__,
            'levels':levels,'calibration':calibration,'bounds':bounds,
            'notes':['Real OpenSlide pyramid levels; all ROI x/y/width/height are level-0 pixels.',
                     'Only the requested region is decoded; transparent out-of-tissue pixels use a white display background.',
                     'RGB connected-component screening is not StarDist segmentation or clinical diagnosis.']}
        if request['operation']=='inspect':
            print(json.dumps({'he':summary})); raise SystemExit(0)
        region=request['region']; level=region.get('page',0)
        if not isinstance(level,int) or level<0 or level>=len(levels): raise ValueError('Invalid OpenSlide pyramid level')
        for key in ['x','y','width','height']:
            if not isinstance(region[key],int): raise ValueError('ROI coordinates must be integers')
        x,y,w,h=(region[key] for key in ['x','y','width','height'])
        if x<0 or y<0 or w<1 or h<1 or x+w>width or y+h>height: raise ValueError('ROI outside level-0 slide bounds')
        downsample=levels[level]['downsample']
        outw,outh=math.ceil(w/downsample),math.ceil(h/downsample)
        if outw*outh>4194304 or outw>4096 or outh>4096: raise ValueError('Requested tile exceeds 4 megapixels/4096 per axis; choose a coarser level or smaller ROI')
        rgba=slide.read_region((x,y),level,(outw,outh))
        rgb=Image.new('RGB',rgba.size,'white'); rgb.paste(rgba,mask=rgba.getchannel('A'))
        output=io.BytesIO(); rgb.save(output,format='PNG')
        result={'he':summary,'tile':{'region':{**region,'page':level},'width':outw,'height':outh,'downsample':downsample,
            'coverageLevel0':{'width':outw*downsample,'height':outh*downsample},
            'pngBase64':base64.b64encode(output.getvalue()).decode('ascii')}}
        print(json.dumps(result))
except Exception as error:
    print(json.dumps({'error':type(error).__name__+': '+str(error)})); raise SystemExit(2)
`
