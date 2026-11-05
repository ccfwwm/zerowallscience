"""Offline raster-slide decomposition. Never regenerates scientific pixels.

Input/output paths are authorized by the Host. Models are shipped in the pinned
RapidOCR wheel and verified against model-lock.json before inference. No downloads.
"""
import argparse
from functools import lru_cache
import hashlib
import io
import json
import math
import os
import pathlib
import posixpath
import sys
import time
import zipfile
import xml.etree.ElementTree as ET
import contextlib

os.environ.setdefault('OMP_NUM_THREADS', '1')
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import ppt_reconstruction_analysis as analysis

VERSION = analysis.VERSION
NS = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}


def sha(value):
    return hashlib.sha256(value).hexdigest()


def save_json(file, value):
    temporary = file.with_suffix(file.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), 'utf-8')
    temporary.replace(file)


def source_image(request):
    if request.get('image'):
        data = pathlib.Path(request['image']).read_bytes()
        return Image.open(io.BytesIO(data)).convert('RGB'), {'sha256': sha(data), 'kind': 'image'}
    source = pathlib.Path(request['sourcePptx'])
    number = int(request['page'])
    with zipfile.ZipFile(source) as archive:
        presentation = ET.fromstring(archive.read('ppt/presentation.xml'))
        size = presentation.find('p:sldSz', NS)
        width, height = int(size.attrib['cx']), int(size.attrib['cy'])
        # Respect the presentation's relationship order (slide1.xml need not be page 1).
        relations = ET.fromstring(archive.read('ppt/_rels/presentation.xml.rels'))
        targets = {r.attrib['Id']: r.attrib['Target'] for r in relations if r.attrib.get('TargetMode') != 'External'}
        slide_ids = presentation.findall('p:sldIdLst/p:sldId', NS)
        target = targets[slide_ids[number - 1].attrib['{' + NS['r'] + '}id']]
        slide_path = posixpath.normpath(posixpath.join('ppt', target.lstrip('/'))) if not target.startswith('/') else target.lstrip('/')
        slide = ET.fromstring(archive.read(slide_path))
        tree = slide.find('p:cSld/p:spTree', NS)
        objects = [item for item in tree if item.tag.rsplit('}', 1)[-1] not in ['nvGrpSpPr', 'grpSpPr']]
        if len(objects) != 1 or objects[0].tag != '{' + NS['p'] + '}pic':
            raise ValueError('NATIVE_PPTX: This page has native/multiple objects. Use ppt_import to preserve them.')
        pic = objects[0]
        blip = pic.find('p:blipFill/a:blip', NS)
        rel_path = posixpath.join(posixpath.dirname(slide_path), '_rels', posixpath.basename(slide_path) + '.rels')
        rels = ET.fromstring(archive.read(rel_path))
        rid = blip.attrib['{' + NS['r'] + '}embed']
        rel = next(r for r in rels if r.attrib['Id'] == rid)
        if rel.attrib.get('TargetMode') == 'External':
            raise ValueError('External images are not fetched by raster reconstruction.')
        media_path = posixpath.normpath(posixpath.join(posixpath.dirname(slide_path), rel.attrib['Target']))
        data = archive.read(media_path)
        image = Image.open(io.BytesIO(data)).convert('RGBA')
        original_size = image.size
        crop = pic.find('p:blipFill/a:srcRect', NS)
        if crop is not None:
            c = {k: int(crop.attrib.get(k, 0)) / 100000 for k in ['l', 't', 'r', 'b']}
            image = image.crop((round(image.width*c['l']), round(image.height*c['t']), round(image.width*(1-c['r'])), round(image.height*(1-c['b']))))
        xfrm = pic.find('p:spPr/a:xfrm', NS)
        if xfrm is None: raise ValueError('Missing picture transform; use native import.')
        off, ext = xfrm.find('a:off', NS), xfrm.find('a:ext', NS)
        if xfrm.attrib.get('flipH') in ['1', 'true']: image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        if xfrm.attrib.get('flipV') in ['1', 'true']: image = image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        scale = max(original_size) / max(width, height)
        canvas = Image.new('RGBA', (round(width*scale), round(height*scale)), (255, 255, 255, 255))
        dims = (round(int(ext.attrib['cx'])*scale), round(int(ext.attrib['cy'])*scale))
        image = image.resize(dims, Image.Resampling.LANCZOS)
        alpha = blip.find('a:alphaModFix', NS)
        if alpha is not None: image.putalpha(round(255*int(alpha.attrib.get('amt', 100000))/100000))
        rotation = int(xfrm.attrib.get('rot', 0)) / 60000
        if rotation: image = image.rotate(-rotation, Image.Resampling.BICUBIC, expand=True)
        x = round(int(off.attrib['x'])*scale) - (image.width - dims[0])//2
        y = round(int(off.attrib['y'])*scale) - (image.height - dims[1])//2
        canvas.alpha_composite(image, (x, y))
        return canvas.convert('RGB'), {'sha256': sha(data), 'kind': 'pptx-picture', 'mediaPart': media_path, 'sourceSize': original_size,
            'slideSizeEmu': [width, height], 'transform': dict(xfrm.attrib), 'crop': dict(crop.attrib) if crop is not None else None,
            'pictureOffset': dict(off.attrib), 'pictureExtent': dict(ext.attrib)}


def fonts(request):
    directory = pathlib.Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts'
    paths = request.get('fonts') or [str(directory/name) for name in ['msyh.ttc', 'msyhbd.ttc', 'msyhl.ttc', 'simhei.ttf', 'simsun.ttc', 'Deng.ttf', 'Dengb.ttf', 'arial.ttf', 'arialbd.ttf', 'calibri.ttf', 'calibrib.ttf']]
    paths += ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
    result = []
    for path in dict.fromkeys(paths):
        if pathlib.Path(path).is_file():
            font = ImageFont.truetype(path, 40)
            family, style = font.getname()
            result.append((path, family, 'bold' in style.lower() or 'bd.' in path.lower()))
    if not result: raise ValueError('No suitable installed fonts. Install a licensed CJK font before reconstruction.')
    return result


@lru_cache(maxsize=16384)
def font_has_glyph(path, character):
    if character.isspace(): return True
    font = ImageFont.truetype(path, 40)
    glyph, missing = font.getmask(character), font.getmask('\uffff')
    return glyph.size != missing.size or bytes(glyph) != bytes(missing)


def fit_font(text, mask, candidates, preferred=None):
    return analysis.fit_font(text, mask, candidates, font_has_glyph, preferred)


def local_background(rgb, box):
    return analysis.background_and_mask(rgb, box)


@lru_cache(maxsize=1)
def ocr_engine(model_profile='default'):
    if model_profile == 'v5-candidate':
        from rapidocr import RapidOCR
        lock_path = pathlib.Path(__file__).with_name('ppt-reconstruction-v5-models.json')
        lock = json.loads(lock_path.read_text('utf-8'))
        model_root = pathlib.Path(__file__).parent / 'models'
        for item in lock['models']:
            path=model_root/item['name']
            if not path.is_file() or sha(path.read_bytes()) != item['sha256']:raise ValueError('PPT_OCR_MODEL_INTEGRITY: v5 candidate model missing or modified')
        engine=RapidOCR(params={'Global.use_cls':False,'Global.log_level':'error','Global.max_side_len':2000,'Det.model_path':str(model_root/lock['models'][0]['name']),'Rec.model_path':str(model_root/lock['models'][1]['name']),'Det.limit_side_len':1600,'EngineConfig.onnxruntime.intra_op_num_threads':2,'EngineConfig.onnxruntime.inter_op_num_threads':1})
        def infer(image):
            result=engine(image,return_word_box=True,return_single_char_box=True)
            characters=[]
            for line in result.word_results or []:
                for item in line or []:
                    if not isinstance(item,(tuple,list)) or len(item)!=3:continue
                    word,score,box=item
                    if box is not None:characters.append({'text':word,'confidence':float(score),'box':np.asarray(box).tolist()})
            return [[box.tolist(),text,float(score)] for box,text,score in zip(result.boxes if result.boxes is not None else [],result.txts or [],result.scores if result.scores is not None else [])],{'seconds':result.elapse,'characters':characters}
        return infer
    import rapidocr_onnxruntime
    directory = pathlib.Path(rapidocr_onnxruntime.__file__).parent
    lock = json.loads(pathlib.Path(__file__).with_name('ppt-reconstruction-models.json').read_text('utf-8'))
    for item in lock['models']:
        target = directory / item['path']
        if not target.is_file() or sha(target.read_bytes()) != item['sha256']:
            raise ValueError('PPT_OCR_MODEL_INTEGRITY: reinstall the signed ppt-reconstruction capability.')
    return rapidocr_onnxruntime.RapidOCR(intra_op_num_threads=1, inter_op_num_threads=1, det_limit_side_len=3200,
                                       det_model_path=str(directory/lock['models'][0]['path']),
                                       cls_model_path=str(directory/lock['models'][1]['path']),
                                       rec_model_path=str(directory/lock['models'][2]['path']))


def reconstruct(request):
    started=time.monotonic()
    out=pathlib.Path(request['outputDir']);out.mkdir(parents=True,exist_ok=True)
    image,source=source_image(request)
    width,height=request.get('width',960),request.get('height',540)
    if source.get('slideSizeEmu') and any(abs(a-b/12700)>.01 for a,b in zip((width,height),source['slideSizeEmu'])):
        raise ValueError('Canvas size differs from source PPTX.')
    page=int(request.get('page',1));sx,sy=width/image.width,height/image.height
    rgb=np.asarray(image).copy();cleaned=rgb.copy()
    semantic_regions=[];protected_boxes=set()
    for region in request.get('regions') or []:
        box=region.get('sourceBounds')
        if not isinstance(box,list) or len(box)!=4 or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in box):raise ValueError('Invalid semantic region')
        l,t,w,h=map(round,box)
        if min(l,t)<0 or min(w,h)<=0 or l+w>image.width or t+h>image.height:raise ValueError('Semantic region exceeds source')
        candidate=[l,t,l+w,t+h]
        if any(max(l,a[0])<min(l+w,a[2]) and max(t,a[1])<min(t+h,a[3]) for a,_ in semantic_regions):raise ValueError('Semantic ownership regions overlap')
        protected=region.get('kind')=='scientific-image' or region.get('preserveSourcePixels') is True
        if protected:protected_boxes.add(tuple(candidate))
        semantic_regions.append((candidate,not protected and region.get('kind') in ('card','shape')))
    model_profile=request.get('modelProfile','default')
    if model_profile not in ('default','v5-candidate'):raise ValueError('Unknown OCR model profile')
    model_lock=json.loads(pathlib.Path(__file__).with_name('ppt-reconstruction-v5-models.json' if model_profile=='v5-candidate' else 'ppt-reconstruction-models.json').read_text('utf-8'))
    candidates=fonts(request)
    font_signature=[(p,f,b,pathlib.Path(p).stat().st_mtime_ns,pathlib.Path(p).stat().st_size) for p,f,b in candidates]
    reference=analysis.text_candidates(request.get('referencePptx'),page)
    font_profile=request.get('fontProfile') or {}
    if not isinstance(font_profile,dict) or not isinstance(font_profile.get('roles',{}),dict):raise ValueError('Invalid shared font profile')
    fingerprint=analysis.digest([VERSION,source,width,height,model_lock,analysis.OCR_POLICY,analysis.SELECTION_POLICY,font_signature,request.get('minimumConfidence',.92),reference,request.get('ocrPolicy','adaptive'),request.get('regions'),request.get('inventory'),request.get('textAnnotations'),font_profile])
    receipt_path=out/'receipt.json'
    if receipt_path.is_file() and not request.get('force'):
        old=json.loads(receipt_path.read_text('utf-8'))
        if old.get('fingerprint')==fingerprint and all((out/name).is_file() and sha((out/name).read_bytes())==value for name,value in old['files'].items()):return {**old,'cached':True}
    ocr_fingerprint=analysis.digest([source,image.size,model_lock,analysis.OCR_POLICY,request.get('ocrPolicy','adaptive')])
    raw_path=out/'ocr-raw-v3.json';raw=analysis.read_raw_cache(raw_path,ocr_fingerprint)
    ocr_cached=raw is not None;ocr_started=time.monotonic()
    if raw is None:
        rows,passes=analysis.recognize(rgb,ocr_engine(model_profile),request.get('ocrPolicy','adaptive'))
        raw={'schemaVersion':3,'fingerprint':ocr_fingerprint,'policy':analysis.OCR_POLICY,'results':rows,'passes':passes,'rawDigest':analysis.digest({'results':rows,'passes':passes})}
        save_json(raw_path,raw)
    rows=analysis.select_ocr(raw['results'],raw.get('passes',{}));ocr_seconds=time.monotonic()-ocr_started
    for annotation in request.get('textAnnotations',[]):
        if annotation.get('verifiedAgainstSource') is not True or not annotation.get('text') or not annotation.get('reviewer'):
            raise ValueError('Text corrections require explicit source review and provenance')
        l,t,w,h=annotation['sourceBounds'];r,b=l+w,t+h
        if min(l,t)<0 or min(w,h)<=0 or r>image.width or b>image.height:raise ValueError('Annotated text exceeds source')
        evidence=[];retained=[]
        for row in rows:
            x0,y0,x1,y1=analysis.bounds(row[0]);inter=max(0,min(r,x1)-max(l,x0))*max(0,min(b,y1)-max(t,y0))
            if inter/max(1,(x1-x0)*(y1-y0))>.55:evidence.append(row[:3])
            else:retained.append(row)
        # Annotation trust and OCR confidence remain separate. Raw observations
        # never acquire a fabricated confidence or lose a failed observation.
        rows=retained+[[[[l,t],[r,t],[r,b],[l,b]],annotation['text'],1.,{'annotation':annotation,'observations':evidence}]]
    texts=[];components=[];text_boxes=[]
    fit_started=time.monotonic()
    fit_cache_path=out/'font-fit-v2.json'
    try:fit_cache=json.loads(fit_cache_path.read_text('utf-8'))
    except (OSError,ValueError):fit_cache={}
    if fit_cache.get('fontSignature')!=analysis.digest(font_signature):fit_cache={'fontSignature':analysis.digest(font_signature),'fits':{}}
    fits=fit_cache['fits']
    for row in rows:
        points,text,score=row[:3];annotation=row[3] if len(row)>3 else None
        x0,y0,x1,y1=analysis.bounds(points);x0,y0,x1,y1=max(0,x0),max(0,y0),min(image.width,x1),min(image.height,y1)
        if x1<=x0 or y1<=y0:continue
        text_boxes.append((x0,y0,x1,y1))
        identifier=f'text-{page}-'+analysis.digest([points,text])[:12]
        role=analysis.font_role(text,(x0,y0,x1,y1),image.size)
        preferred=font_profile.get('roles',{}).get(role)
        component={'id':identifier,'page':page,'type':'text','fontRole':role,'bbox':[x0*sx,y0*sy,(x1-x0)*sx,(y1-y0)*sy],
                   'sourceRegion':[x0,y0,x1-x0,y1-y0],'text':text,'confidence':None if annotation else float(score),
                   'ocr':{'observations':annotation['observations']} if annotation else {'text':text,'confidence':float(score)},
                   'editable':False,'editMode':'raster','textCandidates':analysis.candidate_matches(text,reference),'zIndex':1000+len(components)}
        components.append(component)
        if annotation:component['sourceReview']=annotation['annotation']
        if any(max(x0,l)<min(x1,r) and max(y0,t)<min(y1,b) for l,t,r,b in protected_boxes):
            component['reason']='protected-scientific-region';continue
        tilt=abs(float(points[1][1]-points[0][1]))/max(1,float(points[1][0]-points[0][0]))
        if score<request.get('minimumConfidence',.92):component['reason']='low-ocr-confidence';continue
        if tilt>.045:component['reason']='rotated-text';continue
        background=local_background(rgb,(x0,y0,x1,y1))
        if background is None:component['reason']='complex-background';continue
        box,plane,mask=background
        style=annotation['annotation'].get('style',{}) if annotation else {}
        fit_candidates=[item for item in candidates if (not style.get('fontFamily') or item[1]==style['fontFamily']) and ('bold' not in style or item[2]==style['bold'])]
        if not fit_candidates:raise ValueError('Requested verified font is not installed')
        fit_key=analysis.digest([VERSION,text,sha(mask.tobytes()),mask.shape,style,preferred])
        fit=fits.get(fit_key)
        if fit is None:
            fit=fit_font(text,mask,fit_candidates,preferred)
            if fit:fits[fit_key]=fit
        if fit is None or fit['error']>.7:component['reason']='font-fit-needs-review';continue
        x0,y0,x1,y1=box
        radius=max(2,min(12,round(mask.shape[0]*.035)))
        erase=cv2.dilate(mask,np.ones((radius*2+1,radius*2+1),np.uint8))>0
        smooth,reliable=analysis.region_underlay(rgb,box)
        if reliable:plane=smooth
        # Filling only the stroke with a fitted light background leaves a
        # visible letter-shaped patch even after every original dark pixel is
        # removed. Rebuild the accepted simple background as one continuous
        # patch, feathering its boundary; photographic regions were rejected.
        hh,ww=mask.shape;yy,xx=np.mgrid[0:hh,0:ww]
        feather=max(2,min(12,round(hh*.04)))
        alpha=np.clip(np.minimum.reduce((xx,ww-1-xx,yy,hh-1-yy))/feather,0,1)[...,None]
        cleaned[y0:y1,x0:x1]=(rgb[y0:y1,x0:x1]*(1-alpha)+plane*alpha).astype(np.uint8)
        foreground=np.median(rgb[y0:y1,x0:x1][mask>0],axis=0).astype(int)
        color='#'+''.join(f'{v:02X}' for v in foreground)
        left,top=fit['tightOffset'];glyph=fit['glyphBox'];fs=fit['sizePx']*sy
        x=(x0+left-glyph[0])*sx;y=(y0+top-glyph[1])*sy
        native_width=max(fit['advance']*sx,(x1-x0)*sx)+fs*.1
        content={'text':text.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;'),'fontFamily':fit['family'],'fontSize':round(fs,4),
                 'bold':fit['bold'],'letterSpacing':round(fit.get('letterSpacingPx',0)*sx,4),'color':color,'align':['left','top'],'wrap':False}
        element={'elementId':identifier,'elementType':'text','bounds':[max(0,x),max(0,y),min(width-max(0,x),native_width),min(height-max(0,y),fs*1.8)],
                 'content':content,'textInsets':[0,0,0,0],'sourceRegion':component['sourceRegion']}
        mask_name=f'mask-{identifier}.png';Image.fromarray(mask).save(out/mask_name,compress_level=1)
        component.update({'editable':True,'editMode':'native-text','fallback':'native','fontFit':fit,'style':content,
                          'maskPath':mask_name,'maskSourceRegion':[x0,y0,x1-x0,y1-y0],
                          'inkBounds':[(x0+left)*sx,(y0+top)*sy,fit['tightSize'][0]*sx,fit['tightSize'][1]*sy]})
        texts.append(element)
    save_json(fit_cache_path,fit_cache)
    fit_seconds=time.monotonic()-fit_started
    layout_started=time.monotonic()
    proposals=analysis.visual_regions(cleaned,text_boxes)
    # Explicit proposals are validated image-local regions, not model-generated
    # replacement pixels. They permit a vision/layout service or user selection
    # to refine a failed automatic split through the same reconstruction path.
    if semantic_regions:proposals=semantic_regions
    background=Image.fromarray(cleaned).convert('RGBA');layers=[];relations=[]
    for index,(box,rectangular) in enumerate(proposals):
        x0,y0,x1,y1=box;name=f'visual-{index}.png';protected=tuple(box) in protected_boxes
        pixels=(rgb if protected else cleaned)[y0:y1,x0:x1]
        identifier=f'visual-{page}-'+analysis.digest(box)[:12]
        box_units=[x0*sx,y0*sy,(x1-x0)*sx,(y1-y0)*sy]
        panel=analysis.panel_layers(pixels) if rectangular else None
        if panel:
            element={'elementId':identifier,'elementType':'shape','shapeName':'rect','bounds':box_units,'fill':panel['fill'],'border':{'color':panel['fill']['color'],'width':0},'reconstructionGroup':identifier}
            mode='native-shape'
        else:
            Image.fromarray(pixels).save(out/name,compress_level=1)
            element={'elementId':identifier,'elementType':'image','bounds':box_units,'src':name,'fit':{'mode':'fill'}}
            mode='independent-image'
        # No hidden duplicate remains under the extracted object. The pixels
        # outside its ownership mask are untouched; unknown occluded content
        # is explicitly a review boundary, not invented scientific evidence.
        underlay,underlay_reliable=analysis.region_underlay(rgb,box)
        background.paste(Image.fromarray(underlay).convert('RGBA'),(x0,y0))
        layers.append(element)
        if panel:
            residual_name=f'visual-{index}-detail.png'
            Image.fromarray(panel['residual']).save(out/residual_name,compress_level=1)
            layers.append({'elementId':identifier+'-detail','elementType':'image','bounds':box_units,'src':residual_name,'fit':{'mode':'fill'},'reconstructionGroup':identifier})
        component={'id':identifier,'page':page,'type':'shape' if panel else 'scientific-image','bbox':box_units,'sourceRegion':[x0,y0,x1-x0,y1-y0],
                   'editable':bool(panel),'movable':True,'editMode':mode,'confidence':None,'zIndex':index+1,
                   'sourcePixelsPreserved':protected,
                   'backgroundAfterMove':'plain-canvas-estimate' if underlay_reliable else 'requires-review'}
        if panel:component['sourceResidual']={'src':residual_name,'explainedInterior':panel['explainedInterior'],'editBoundary':'Source edge/detail overlay remains raster; flat backplate is native.'}
        components.append(component)
        children=[c['id'] for c in components if c['type']=='text' and x0<=c['sourceRegion'][0] and y0<=c['sourceRegion'][1] and c['sourceRegion'][0]+c['sourceRegion'][2]<=x1 and c['sourceRegion'][1]+c['sourceRegion'][3]<=y1]
        if children:
            relations.append({'type':'contains','parent':identifier,'children':children})
            element['reconstructionGroup']=identifier
            for text_element in texts:
                if text_element['elementId'] in children:text_element['reconstructionGroup']=identifier
    background.save(out/'background.png',compress_level=1);image.save(out/'source.png',compress_level=1)
    elements=[{'elementId':f'background-{page}','elementType':'image','bounds':[0,0,width,height],'src':'background.png','fit':{'mode':'fill'}},*layers,*texts]
    fallback=[c for c in components if c['type']=='text' and not c['editable']]
    total_chars=sum(len(c['text']) for c in components if c['type']=='text');native_chars=sum(len(c['text']) for c in components if c['type']=='text' and c['editable'])
    reasons=dict(__import__('collections').Counter(c['reason'] for c in fallback))
    inventory_result=analysis.validate_inventory(request.get('inventory'),source['sha256'],components)
    quality={'recognizedTexts':len(rows),'nativeTexts':len(texts),'rasterTexts':len(fallback),'visualLayers':sum(e['elementType']=='image' for e in layers),
             'nativeShapes':sum(e['elementType']=='shape' for e in layers),'recognizedCharacters':total_chars,'nativeCharacters':native_chars,
             'recognizedTextEditCoverage':round(native_chars/max(1,total_chars),4),'failureReasons':reasons,
             **{key:inventory_result[key] for key in ('contentVerified','inventoryVerified','scientificImagesVerified')},'requiresReview':True}
    warnings=[f'{len(fallback)} recognized text regions require reconstruction review.'] if fallback else []
    if not request.get('inventory'):warnings.append('OCR recall is unverified: independent page inventory and content review are required.')
    result={'schemaVersion':1,'processorVersion':VERSION,'fingerprint':fingerprint,'source':source,'page':page,'width':width,'height':height,'pixelSize':image.size,
            'elements':elements,'components':components,'relations':relations,'referenceTextCandidates':reference,'inventory':request.get('inventory'),
            'rawOcrDigest':raw['rawDigest'],'quality':quality,'inventoryReview':inventory_result,'warnings':warnings,'qualityStatus':'review',
            'timings':{'ocrSeconds':round(ocr_seconds,3),'fontFitSeconds':round(fit_seconds,3),'layoutSeconds':round(time.monotonic()-layout_started,3),'totalSeconds':round(time.monotonic()-started,3)},'ocrCached':ocr_cached,'cached':False}
    result['files']={p.name:sha(p.read_bytes()) for p in out.glob('*.png') if p.name in {'background.png','source.png'} or p.name.startswith(('visual-','mask-'))}
    save_json(receipt_path,result)
    save_json(out/'component-inventory.json',{'page':page,'source':source,'components':components,'relations':relations,'referenceTextCandidates':reference,'inventoryReview':inventory_result,'contentVerified':quality['contentVerified']})
    return result


def compare_render(request):
    """Compare the actual exported PPTX render, not the intermediate mosaic."""
    out = pathlib.Path(request['outputDir']); out.mkdir(parents=True, exist_ok=True)
    receipt_path = pathlib.Path(request['receipt'])
    receipt = json.loads(receipt_path.read_text('utf-8'))
    source = Image.open(receipt_path.parent/'source.png').convert('RGB')
    rendered = Image.open(request['rendered']).convert('RGB')
    native_render=np.asarray(rendered)
    native_source=np.asarray(source.resize((native_render.shape[1],native_render.shape[0]),Image.Resampling.LANCZOS))
    probe_request=request.get('textProbe');probe_pixels=None;probe_colors={}
    if probe_request:
        probe_pixels=np.asarray(Image.open(probe_request['path']).convert('RGB'))
        if probe_pixels.shape!=native_render.shape:raise ValueError('Text probe dimensions differ from final render')
        probe_colors={item['elementId']:item['color'] for item in probe_request['colors']}
    size = (round(receipt['width']), round(receipt['height']))
    source = source.resize(size, Image.Resampling.LANCZOS)
    rendered = rendered.resize(size, Image.Resampling.LANCZOS)
    original, actual = np.asarray(source), np.asarray(rendered)
    error = np.abs(original.astype(np.float32)-actual.astype(np.float32))
    distance = error.max(axis=2)
    heat = cv2.applyColorMap(np.minimum(255, distance*4).astype(np.uint8), cv2.COLORMAP_JET)
    Image.fromarray(heat[:,:,::-1]).save(out/'difference-heatmap.png')
    Image.blend(source, rendered, .5).save(out/'overlay.png')
    source.save(out/'reference.png'); rendered.save(out/'rendered.png')
    regions = []
    for component in receipt['components']:
        x,y,w,h = component['bbox']
        x0,y0,x1,y1 = max(0,int(x)),max(0,int(y)),min(size[0],math.ceil(x+w)),min(size[1],math.ceil(y+h))
        local = error[y0:y1,x0:x1]
        if not local.size: continue
        entry={'id':component['id'],'type':component['type'],'editable':component['editable'],
               'mae':round(float(local.mean()),3),'changedFraction':round(float((local.max(axis=2)>24).mean()),4)}
        if component['type']=='text' and component['editable']:
            probe=None;source_mask=None
            if probe_request:
                color=probe_colors.get(component['id'])
                if color is None:raise ValueError('Text probe is missing a native text object')
                probe={'pixels':probe_pixels,'color':color}
                mask_path=receipt_path.parent/component['maskPath']
                if sha(mask_path.read_bytes())!=receipt['files'][component['maskPath']]:raise ValueError('Source text mask digest mismatch')
                source_mask=np.asarray(Image.open(mask_path).convert('L'))
            alignment=analysis.text_alignment(component,receipt,native_render,native_source,probe,source_mask)
            if alignment:entry['alignment']=alignment
        regions.append(entry)
    regions.sort(key=lambda region:region['mae'],reverse=True)
    result = {'schemaVersion':1,'comparisonKind':'final-pptx-render','processorVersion':VERSION,
              'sourceSha256':receipt['source']['sha256'],'renderSha256':sha(pathlib.Path(request['rendered']).read_bytes()),
              'elementsSha256':analysis.digest(receipt['elements']),
              'alignmentMethod':'isolated-text-probe' if probe_request else 'page-color',
              'textProbeSha256':sha(pathlib.Path(probe_request['path']).read_bytes()) if probe_request else None,
              'mae':round(float(error.mean()),3),'changedFraction':round(float((distance>24).mean()),4),
              'ssim':round(analysis.ssim(original,actual),6),
              'textEdgeP95':round(float(np.percentile([r['alignment']['edgeError'] for r in regions if r.get('alignment')],95)),4) if any(r.get('alignment') for r in regions) else None,
              'glyphEdgeP95':round(float(np.percentile([r['alignment']['glyphEdgeP95'] for r in regions if r.get('alignment',{}).get('glyphEdgeP95') is not None],95)),4) if any(r.get('alignment',{}).get('glyphEdgeP95') is not None for r in regions) else None,
              'nativeTextGeometryCoverage':sum(r.get('alignment',{}).get('glyphEdgeP95') is not None for r in regions)/max(1,sum(c['type']=='text' and c.get('editable',False) for c in receipt['components'])),
              'nativeTextMae':round(float(np.mean([r['mae'] for r in regions if r['type']=='text' and r['editable']])),4) if any(r['type']=='text' and r['editable'] for r in regions) else None,
              'regions':regions,'requiresReview':True,'qualityStatus':'review',
              'note':'Pixel metrics are diagnostics. OCR content, scientific images, fonts and editing boundaries require review.'}
    save_json(out/'comparison.json',result)
    return result


def repair_render(request):
    receipt=json.loads(pathlib.Path(request['receipt']).read_text('utf-8'))
    comparison=json.loads(pathlib.Path(request['comparisonPath']).read_text('utf-8'))
    if comparison.get('sourceSha256')!=receipt['source']['sha256']:raise ValueError('Repair evidence belongs to a different source')
    if comparison.get('elementsSha256') is not None and comparison['elementsSha256']!=analysis.digest(receipt['elements']):raise ValueError('Repair evidence belongs to a different text layout')
    elements,changes=analysis.repair_elements(receipt,comparison)
    result={**receipt,'elements':elements,'repairChanges':changes,'repairRound':int(receipt.get('repairRound',0))+1,'calibrationVersion':VERSION,'qualityStatus':'review'}
    if result['repairRound']>3:raise ValueError('Reconstruction repair budget exceeded')
    out=pathlib.Path(request['outputDir']);out.mkdir(parents=True,exist_ok=True)
    save_json(out/'repair.json',result)
    return result


def execute_request(request):
    if request.get('repair'):return repair_render(request),'repair.json'
    if request.get('comparison'):return compare_render(request),'comparison.json'
    return reconstruct(request),'receipt.json'


def worker_server():
    """One JSON request per line; stdout is a framed protocol, logs use stderr."""
    for line in sys.stdin:
        message=None
        try:
            message=json.loads(line)
            with contextlib.redirect_stdout(sys.stderr):
                request=json.loads(pathlib.Path(message['request']).read_text('utf-8-sig'))
                result,name=execute_request(request)
            print(json.dumps({'id':message['id'],'ok':True,'receipt':str(pathlib.Path(request['outputDir'])/name),'quality':result.get('quality',result),'timings':result.get('timings',{}),'cached':result.get('cached',False)},ensure_ascii=True),flush=True)
        except Exception as error:
            print(json.dumps({'id':message.get('id') if isinstance(message,dict) else None,'ok':False,'error':str(error)},ensure_ascii=True),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--request');parser.add_argument('--server',action='store_true')
    args=parser.parse_args()
    if args.server:worker_server();raise SystemExit(0)
    try:
        request = json.loads(pathlib.Path(args.request).read_text('utf-8-sig'))
        result,name=execute_request(request)
        print(json.dumps({'ok':True,'receipt':str(pathlib.Path(request['outputDir'])/name),'quality':result.get('quality',result),'timings':result.get('timings',{}),'cached':result.get('cached',False)},ensure_ascii=True))
    except Exception as error:
        print(json.dumps({'ok':False,'error':str(error)},ensure_ascii=True));sys.exit(1)
