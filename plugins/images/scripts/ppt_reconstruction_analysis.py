"""Deterministic reconstruction stages. Raw recognition is never a review ledger.

All models and source paths are supplied by the signed host capability. This
module performs no network requests and never generates scientific imagery.
"""
from functools import lru_cache
import collections
import difflib
import hashlib
import html
import json
import math
import pathlib
import re
import time
import zipfile
import xml.etree.ElementTree as ET

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

VERSION = '2.6.0'
OCR_POLICY = 'capture-v5-global-halves-character-evidence'
SELECTION_POLICY = 'ownership-v2-global-line-anchor'


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


@lru_cache(maxsize=512)
def font_at(path, size):
    return ImageFont.truetype(path, max(1, int(size)))


def tight(mask):
    ys, xs = np.where(mask > 0)
    if not len(xs): return None
    return [int(xs.min()), int(ys.min()), int(xs.max()+1), int(ys.max()+1)]


def glyph_image(text, path, size, tracking=0):
    font = font_at(path, size)
    box = font.getbbox(text)
    advance = font.getlength(text) + tracking * max(0, len(text)-1)
    image = Image.new('L', (max(1, math.ceil(max(box[2], advance)+abs(tracking)*len(text)+4)), max(1, box[3]-box[1]+4)))
    draw = ImageDraw.Draw(image)
    if abs(tracking) < .01:
        draw.text((-box[0], -box[1]), text, font=font, fill=255)
    else:
        x = -box[0]
        for i, character in enumerate(text):
            draw.text((x, -box[1]), character, font=font, fill=255)
            x += font.getlength(text[i:i+2]) - (font.getlength(text[i+1]) if i+1<len(text) else 0) + tracking
    pixels = np.asarray(image)
    ink = tight(pixels > 95)
    if ink is None: return None
    l,t,r,b = ink
    return pixels[t:b,l:r], [box[0]+l, box[1]+t, box[0]+r, box[1]+b], advance


def mask_distance(target, candidate):
    """Symmetric contour distance with isotropic sampling, no glyph warping."""
    h = max(target.shape[0], candidate.shape[0]); w = max(target.shape[1], candidate.shape[1])
    ratio = min(1., 80/max(1,h))
    size = (max(1,round(w*ratio)), max(1,round(h*ratio)))
    a = np.zeros((h,w),np.uint8); b = a.copy()
    a[:target.shape[0],:target.shape[1]] = (target>95).astype(np.uint8)
    b[:candidate.shape[0],:candidate.shape[1]] = (candidate>95).astype(np.uint8)
    a = cv2.resize(a,size,interpolation=cv2.INTER_NEAREST); b=cv2.resize(b,size,interpolation=cv2.INTER_NEAREST)
    if not a.any() or not b.any(): return 10.
    da=cv2.distanceTransform(1-a,cv2.DIST_L2,3); db=cv2.distanceTransform(1-b,cv2.DIST_L2,3)
    chamfer=(float(db[a>0].mean())+float(da[b>0].mean()))/max(1,size[1])
    density=abs(float(a.mean())-float(b.mean()))
    dimensions=abs(math.log(candidate.shape[0]/target.shape[0]))+abs(math.log(candidate.shape[1]/target.shape[1]))
    return chamfer*3 + density*.5 + dimensions*.45


def font_role(text, box, image_size):
    l,t,r,b=box;_,height=image_size
    script='cjk' if re.search(r'[\u3400-\u9fff]',text) else 'latin'
    role='title' if t<height*.24 and b-t>=height*.028 else 'body' if b-t>=height*.014 else 'label'
    return script+'-'+role


def joint_font_profile(receipts):
    """Share a font prior across a deck, retaining every per-line alternative."""
    roles=collections.defaultdict(list)
    for receipt in receipts:
        for c in receipt.get('components',[]):
            fit=c.get('fontFit');role=c.get('fontRole')
            if fit and role:roles[role].append(fit)
    result={}
    for role,fits in roles.items():
        candidates={(c['family'],c['bold']) for fit in fits for c in fit.get('candidates',[fit])}
        scored=[]
        for family,bold in candidates:
            regrets=[];observations=0
            for fit in fits:
                matching=[x['error'] for x in fit.get('candidates',[fit]) if x['family']==family and x['bold']==bold]
                regrets.append(min(matching)-fit['error'] if matching else .25)
                observations+=bool(matching)
            scored.append((float(np.mean(regrets)),family,bold,observations))
        if scored:
            error,family,bold,observations=min(scored)
            result[role]={'fontFamily':family,'bold':bold,'meanRegret':round(error,5),'observations':observations,'lines':len(fits)}
    return {'basis':'joint-fit','roles':result,'requiresSourceReview':True}


def fit_font(text, mask, candidates, has_glyph, preferred=None):
    ink=tight(mask)
    if ink is None or not text.strip(): return None
    l,t,r,b=ink; target=mask[t:b,l:r]; h,w=target.shape
    results=[]
    for path,family,bold in candidates:
        if not all(has_glyph(path,char) for char in set(text)): continue
        probe=font_at(path,100); box=probe.getbbox(text)
        nominal=min(1200,max(6,round(min(100*h/max(1,box[3]-box[1]),100*w/max(1,box[2]-box[0])))))
        best=None
        for size in sorted(set(max(6,round(nominal*ratio)) for ratio in (.96,1.,1.04))):
            initial=glyph_image(text,path,size)
            if initial is None: continue
            pixels,glyph_box,advance=initial
            tracking=max(-size*.08,min(size*.10,(w-pixels.shape[1])/max(1,len(text)-1))) if len(text)>1 else 0
            trial=glyph_image(text,path,size,tracking) if abs(tracking)>.15 else initial
            rendered,gb,adv=trial
            error=mask_distance(target,rendered)
            item={'path':path,'family':family,'bold':bold,'sizePx':size,'letterSpacingPx':round(tracking,4),
                  'error':round(error,5),'glyphBox':gb,'advance':adv,'glyphWidth':rendered.shape[1],
                  'tightOffset':[l,t],'tightSize':[w,h]}
            if best is None or error<best['error']:best=item
        if best:results.append(best)
    if not results:return None
    # A shared role is a prior, not permission to force an obviously wrong font.
    def selection_error(item):
        penalty=.055 if preferred and (item['family']!=preferred.get('fontFamily') or ('bold' in preferred and item['bold']!=preferred['bold'])) else 0
        return item['error']+penalty
    results.sort(key=selection_error)
    return {**results[0],'candidates':[{k:v for k,v in x.items() if k not in ('path','glyphBox','tightOffset','tightSize')} for x in results[:4]]}


def background_and_mask(rgb, box):
    x0,y0,x1,y1=map(int,box); h,w=rgb.shape[:2]; pad=5
    x0,y0,x1,y1=max(pad,x0),max(pad,y0),min(w-pad,x1),min(h-pad,y1)
    if x1<=x0 or y1<=y0:return None
    yy,xx=np.mgrid[y0-pad:y1+pad,x0-pad:x1+pad]
    ring=(xx<x0)|(xx>=x1)|(yy<y0)|(yy>=y1)
    sample=rgb[yy[ring],xx[ring]].astype(float)
    design=np.column_stack((np.ones(len(sample)),xx[ring]-x0,yy[ring]-y0))
    selected=np.ones(len(sample),bool)
    for _ in range(3):
        coef=np.linalg.lstsq(design[selected],sample[selected],rcond=None)[0]
        residual=np.linalg.norm(sample-design@coef,axis=1)
        selected=residual<=max(10,float(np.percentile(residual,72)))
    if float(np.median(residual))>22 or float(np.percentile(residual[selected],85))>28:
        return color_text_mask(rgb,(x0,y0,x1,y1))
    yy,xx=np.mgrid[y0:y1,x0:x1]
    plane=np.clip(np.stack((np.ones_like(xx),xx-x0,yy-y0),axis=-1)@coef,0,255).astype(np.uint8)
    distance=np.linalg.norm(rgb[y0:y1,x0:x1].astype(float)-plane,axis=2)
    mask=(distance>max(28,float(np.percentile(residual[selected],85))*2)).astype(np.uint8)*255
    # Long isolated borders must not become text strokes.
    count,labels,stats,_=cv2.connectedComponentsWithStats(mask)
    for index in range(1,count):
        l,t,cw,ch,area=stats[index]
        if (cw>mask.shape[1]*.7 and ch<max(3,mask.shape[0]*.06)) or (ch>mask.shape[0]*.85 and cw<3):mask[labels==index]=0
    fraction=np.count_nonzero(mask)/max(1,mask.size)
    if not .015<fraction<.70:return None
    return (x0,y0,x1,y1),plane,mask


def color_text_mask(rgb, box):
    """Separate a coherent text colour on a slowly varying background.

    Never infer replacement scientific pixels. Only a small stroke mask is
    repaired; a textured/photographic foreground fails this conservative test.
    """
    x0,y0,x1,y1=box;pixels=rgb[y0:y1,x0:x1];h,w=pixels.shape[:2]
    if min(h,w)<4:return None
    lab=cv2.cvtColor(pixels,cv2.COLOR_RGB2LAB).astype(np.float32)
    ring=np.concatenate((lab[:3].reshape(-1,3),lab[-3:].reshape(-1,3),lab[:,:3].reshape(-1,3),lab[:,-3:].reshape(-1,3)))
    background=np.median(ring,axis=0)
    quant=(pixels//24).reshape(-1,3);colors,counts=np.unique(quant,axis=0,return_counts=True)
    choices=[]
    for index in np.argsort(counts)[-12:]:
        color=np.median(pixels[np.all(pixels//24==colors[index],axis=2)],axis=0).astype(np.uint8)
        fg=cv2.cvtColor(color.reshape(1,1,3),cv2.COLOR_RGB2LAB)[0,0].astype(float)
        contrast=float(np.linalg.norm(fg-background))
        if contrast<45:continue
        mask=(np.linalg.norm(lab-fg,axis=2)<25).astype(np.uint8)*255
        n,labels,stats,_=cv2.connectedComponentsWithStats(mask)
        for k in range(1,n):
            l,t,cw,ch,area=stats[k]
            if area<max(3,h*h*.00015) or ch<h*.12 or (cw>w*.7 and ch<h*.10) or cw*ch>w*h*.4:mask[labels==k]=0
        box_ink=tight(mask)
        if box_ink is None:continue
        l,t,r,b=box_ink;fraction=np.count_nonzero(mask)/mask.size
        if not .025<fraction<.55 or r-l<w*.65 or b-t<h*.40:continue
        choices.append((contrast*np.sqrt(fraction),mask))
    if not choices:return None
    mask=max(choices,key=lambda x:x[0])[1]
    dilated=cv2.dilate(mask,np.ones((3,3),np.uint8))
    smooth,reliable=region_underlay(rgb,box)
    if reliable:
        repaired=smooth
    else:
        # Full stroke width includes antialiasing, highlights and source shadows.
        radius=max(3,min(15,round(h*.045)))
        dilated=cv2.dilate(mask,np.ones((radius*2+1,radius*2+1),np.uint8))
        repaired=cv2.inpaint(pixels,dilated,7,cv2.INPAINT_TELEA)
    return box,repaired,mask


def bounds(points):
    xy=np.asarray(points); l,t=np.floor(xy.min(axis=0)).astype(int); r,b=np.ceil(xy.max(axis=0)).astype(int)
    return [int(l),int(t),int(r),int(b)]


def merge_ocr(rows):
    result=[]
    # Region ownership precedes recognition confidence: a high-confidence
    # word inside an already recognized line is an alternative, not another
    # foreground object. Otherwise multi-scale OCR duplicates visible text.
    def priority(row):
        l,t,r,b=bounds(row[0])
        return (float(row[2])>=.92,(r-l)*(b-t),float(row[2]))
    for row in sorted(rows,key=priority,reverse=True):
        a=bounds(row[0]); area=max(1,(a[2]-a[0])*(a[3]-a[1])); duplicate=False
        for other in result:
            z=bounds(other[0]);inter=max(0,min(a[2],z[2])-max(a[0],z[0]))*max(0,min(a[3],z[3])-max(a[1],z[1]))
            coverage=inter/min(area,max(1,(z[2]-z[0])*(z[3]-z[1])))
            if coverage>.65:
                duplicate=True;break
        if not duplicate:result.append(row)
    return sorted(result,key=lambda x:(bounds(x[0])[1]//12,bounds(x[0])[0]))


def recognize(rgb, engine, policy='adaptive'):
    global_rows,metadata=engine(rgb[:,:,::-1]); rows=list(global_rows or []); tiles=[]
    observations=[]
    if isinstance(metadata,dict):observations.extend(metadata.get('characters',[]))
    h,w=rgb.shape[:2]
    if policy=='tiled':
        tiles=[(x,y,min(w,x+1536),min(h,y+1536)) for y in range(0,h,1408) for x in range(0,w,1408)]
    elif policy=='adaptive':
        for points,text,score in sorted(rows,key=lambda x:x[2]):
            l,t,r,b=bounds(points)
            if score<.94 or b-t<48 or abs(points[1][1]-points[0][1])>4:
                if len(tiles)<2 and (len(text.strip())>=2 or score>.8):tiles.append((max(0,l-64),max(0,t-48),min(w,r+64),min(h,b+48)))
        # Include uncovered bands: a global OCR miss is not a high-confidence result.
        tiles.extend([(0,0,w,min(h,round(h*.58))),(0,round(h*.42),w,h)])
    for l,t,r,b in tiles:
        if r-l<20 or b-t<12:continue
        local,metadata=engine(rgb[t:b,l:r,::-1])
        if isinstance(metadata,dict):
            for character in metadata.get('characters',[]):
                observations.append({**character,'box':[[float(x)+l,float(y)+t] for x,y in character['box']]})
        for points,text,score in local or []:
            rows.append([[[float(x)+l,float(y)+t] for x,y in points],text,float(score)])
    return rows,{'globalRegions':len(global_rows or []),'localPasses':len(tiles),'characters':observations}


def select_ocr(rows, passes):
    """Retain a single owner for a line; keep every observation in raw cache."""
    count=passes.get('globalRegions',len(rows));owners=merge_ocr(rows[:count])
    for row in rows[count:]:
        a=bounds(row[0]);matched=None
        for index,other in enumerate(owners):
            z=bounds(other[0]);pad=max(4,(z[3]-z[1])*.2)
            inter=max(0,min(a[2],z[2]+pad)-max(a[0],z[0]-pad))*max(0,min(a[3],z[3]+pad)-max(a[1],z[1]-pad))
            area=max(1,(a[2]-a[0])*(a[3]-a[1]))
            if inter/area>.35:matched=index;break
        if matched is not None:
            other=owners[matched];z=bounds(other[0])
            ratio=(a[2]-a[0])*(a[3]-a[1])/max(1,(z[2]-z[0])*(z[3]-z[1]))
            if other[2]<.92 and row[2]>.96 and .65<ratio<1.6:owners[matched]=row
        elif row[2]>.96 and len(row[1].strip())>=2:owners.append(row)
    return merge_ocr(owners)


def read_raw_cache(path, fingerprint):
    try:
        value=json.loads(path.read_text('utf-8'))
        if value.get('schemaVersion')==3 and value.get('fingerprint')==fingerprint and value.get('rawDigest')==digest({'results':value['results'],'passes':value['passes']}) and not value.get('derivedFrom'):
            return value
    except (OSError,ValueError,KeyError,TypeError):pass
    return None


def text_candidates(file, page):
    if not file:return []
    ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
    with zipfile.ZipFile(file) as z:
        root=ET.fromstring(z.read('ppt/presentation.xml'));ids=root.findall('p:sldIdLst/p:sldId',ns)
        rels={r.attrib['Id']:r.attrib['Target'] for r in ET.fromstring(z.read('ppt/_rels/presentation.xml.rels')) if r.attrib.get('TargetMode')!='External'}
        target=rels[ids[page-1].attrib['{'+ns['r']+'}id']]
        import posixpath
        name=target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join('ppt',target))
        slide=ET.fromstring(z.read(name))
        return [''.join(t.text or '' for t in p.findall('.//a:t',ns)) for p in slide.findall('.//a:p',ns) if p.findall('.//a:t',ns)]


def candidate_matches(text, candidates):
    norm=lambda v:re.sub(r'[\s|丨｜]','',v).casefold()
    a=norm(text)
    found=[]
    for value in candidates:
        b=norm(value)
        ratio=difflib.SequenceMatcher(None,a,b).ratio()
        if a and (a in b or ratio>.7):found.append({'text':value,'similarity':round(ratio,3),'exactSubstring':a in b})
    return sorted(found,key=lambda x:x['similarity'],reverse=True)[:2]


def visual_regions(cleaned, text_boxes):
    """Hierarchical region proposals; connected full-slide decoration is excluded."""
    h,w=cleaned.shape[:2];scale=min(1,1600/w);small=cv2.resize(cleaned,(round(w*scale),round(h*scale)))
    edges=cv2.Canny(small,60,150)
    edges=cv2.morphologyEx(edges,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
    contours,_=cv2.findContours(edges,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
    proposals=[]
    for contour in contours:
        x,y,cw,ch=cv2.boundingRect(contour);fraction=cw*ch/(small.shape[0]*small.shape[1])
        if not .002<fraction<.48 or cw<35 or ch<30:continue
        perimeter=cv2.arcLength(contour,True);poly=cv2.approxPolyDP(contour,.018*perimeter,True)
        rectangular=len(poly) in (4,5,6) and cv2.contourArea(contour)/max(1,cw*ch)>.70
        if not rectangular and fraction>.08:continue
        box=[max(0,round(x/scale)-2),max(0,round(y/scale)-2),min(w,round((x+cw)/scale)+2),min(h,round((y+ch)/scale)+2)]
        # Pure text contours are owned by the native/raster text inventory.
        covered=sum(max(0,min(box[2],r)-max(box[0],l))*max(0,min(box[3],b)-max(box[1],t)) for l,t,r,b in text_boxes)
        if covered>.65*(box[2]-box[0])*(box[3]-box[1]):continue
        proposals.append((box,rectangular))
    # Prefer atomic visual regions. Keep an enclosing panel only if it has no
    # substantial children; do not merge intersecting bounding rectangles.
    result=[]
    for a,rect in sorted(proposals,key=lambda x:(x[0][2]-x[0][0])*(x[0][3]-x[0][1])):
        area=(a[2]-a[0])*(a[3]-a[1]);skip=False
        for b,_ in result:
            inter=max(0,min(a[2],b[2])-max(a[0],b[0]))*max(0,min(a[3],b[3])-max(a[1],b[1]))
            if inter/min(area,(b[2]-b[0])*(b[3]-b[1]))>.70:skip=True;break
            if inter>0:skip=True;break
        if not skip:result.append((a,rect))
    return sorted(result,key=lambda x:(x[0][1],x[0][0]))[:100]


def solid_shape(pixels):
    if pixels.shape[0]<30 or pixels.shape[1]<30:return None
    color=np.median(pixels.reshape(-1,3),axis=0)
    if float((np.linalg.norm(pixels-color,axis=2)<8).mean())<.997:return None
    return '#'+''.join(f'{int(v):02X}' for v in color)


def panel_layers(pixels):
    """Recover a simple backplate; preserve non-uniform source pixels separately.

    The residual is source RGBA, never an invented illustration. A backplate is
    accepted only when it explains most of the interior. Photo/diagram panels
    fail this test and stay independent source images.
    """
    h,w=pixels.shape[:2]
    if min(h,w)<30:return None
    pad=max(2,round(min(h,w)*.025))
    interior=pixels[pad:h-pad,pad:w-pad]
    sample=interior[::max(1,h//160),::max(1,w//160)].reshape(-1,3).astype(float)
    quant=(sample//12).astype(int);colors,counts=np.unique(quant,axis=0,return_counts=True)
    selected=np.all(quant==colors[np.argmax(counts)],axis=1)
    color=np.median(sample[selected],axis=0)
    # Colour bins split antialiasing/gradients. Refit around the winning mode,
    # rather than around the average of a panel's illustrations and lettering.
    for _ in range(2):
        near=np.linalg.norm(sample-color,axis=1)<16
        if not near.any():return None
        color=np.median(sample[near],axis=0)
    distance=np.linalg.norm(interior.astype(float)-color,axis=2)
    explained=float((distance<12).mean())
    if explained<.88:return None
    color=np.rint(color).astype(np.uint8)
    difference=np.linalg.norm(pixels.astype(float)-color,axis=2)
    # Keep a thin source edge, including the original round corner and shadow.
    alpha=(difference>5).astype(np.uint8)*255
    alpha[:pad]=255;alpha[-pad:]=255;alpha[:,:pad]=255;alpha[:,-pad:]=255
    residual=np.dstack((pixels,alpha))
    return {'fill':{'type':'solid','color':'#'+''.join(f'{v:02X}' for v in color)},
            'explainedInterior':round(explained,4),'residual':residual}


def validate_inventory(inventory, source_sha, components):
    """Check a source-reviewed inventory independently of the OCR result count."""
    result={'inventoryVerified':False,'contentVerified':False,'scientificImagesVerified':False,
            'expectedItems':0,'matchedItems':0,'issues':[]}
    if inventory is None:
        result['issues'].append({'reason':'independent-inventory-missing'});return result
    if not isinstance(inventory,dict) or inventory.get('sourceSha256')!=source_sha:
        raise ValueError('Independent inventory must bind the original source image hash')
    if inventory.get('verifiedAgainstSource') is not True or not inventory.get('reviewer'):
        raise ValueError('Independent inventory requires source review and reviewer')
    items=inventory.get('items')
    if not isinstance(items,list) or not items:raise ValueError('Independent inventory is empty')
    ids=set();matched=set()
    normalize=lambda s:re.sub(r'\s+','',html.unescape(s or '')).casefold()
    for item in items:
        identifier=item.get('id');kind=item.get('type');box=item.get('sourceBounds')
        if not isinstance(identifier,str) or identifier in ids or kind not in ('text','shape','scientific-image','container','line'):
            raise ValueError('Invalid/duplicate independent inventory object')
        ids.add(identifier)
        if not isinstance(box,list) or len(box)!=4 or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in box) or min(box[0],box[1])<0 or min(box[2],box[3])<=0:
            raise ValueError('Invalid independent inventory bounds')
        x,y,w,h=box;possible=[]
        for c in components:
            if c['id'] in matched:continue
            if kind=='text' and c['type']!='text':continue
            if kind!='text' and c['type']=='text':continue
            l,t,cw,ch=c['sourceRegion'];inter=max(0,min(x+w,l+cw)-max(x,l))*max(0,min(y+h,t+ch)-max(y,t))
            cover=inter/max(1,w*h);overlap=inter/max(1,min(w*h,cw*ch))
            if cover>=.70 and overlap>=.80:possible.append((cover,c))
        result['expectedItems']+=1
        if not possible:result['issues'].append({'id':identifier,'type':kind,'reason':'missing-object'});continue
        c=max(possible,key=lambda v:v[0])[1];matched.add(c['id'])
        if kind=='text' and normalize(item.get('text'))!=normalize(c.get('text')):
            result['issues'].append({'id':identifier,'type':kind,'reason':'text-conflict','expected':item.get('text'),'observed':c.get('text')});continue
        mode=c.get('editMode','')
        if item.get('nativeRequired',kind in ('text','shape','line')) and not mode.startswith('native'):
            result['issues'].append({'id':identifier,'type':kind,'reason':'not-native-editable'});continue
        if kind=='scientific-image' and (mode!='independent-image' or c.get('backgroundAfterMove')=='requires-review'):
            result['issues'].append({'id':identifier,'type':kind,'reason':'image-edit-boundary'});continue
        result['matchedItems']+=1
    # A partial inventory is useful evidence, but cannot approve omitted items.
    if inventory.get('complete') is not True:result['issues'].append({'reason':'inventory-incomplete'})
    expected={i['type'] for i in items}
    extra=[c['id'] for c in components if c['type']=='text' and c['id'] not in matched]
    if extra:result['issues'].append({'type':'text','reason':'unlisted-recognized-text','ids':extra})
    result['inventoryVerified']=not result['issues'] and bool(items)
    result['contentVerified']=result['inventoryVerified'] and 'text' in expected
    result['scientificImagesVerified']=result['inventoryVerified'] and inventory.get('scientificImagesReviewed') is True
    return result


def region_underlay(rgb, box):
    """Estimate only the canvas underneath a movable rectangular cutout.

    A low residual indicates a plain/gradient canvas; complex occlusion remains
    an explicit review item. The extracted scientific image stays unchanged.
    """
    l,t,r,b=box;h,w=rgb.shape[:2];pad=4
    xs=np.linspace(l,r-1,min(128,r-l)).astype(int);ys=np.linspace(t,b-1,min(128,b-t)).astype(int)
    points=[(x,y) for x in xs for y in (max(0,t-pad),min(h-1,b+pad))]
    points.extend((x,y) for y in ys for x in (max(0,l-pad),min(w-1,r+pad)))
    coords=np.array(points);samples=rgb[coords[:,1],coords[:,0]].astype(float)
    design=np.column_stack((np.ones(len(coords)),(coords[:,0]-l)/max(1,r-l),(coords[:,1]-t)/max(1,b-t)))
    keep=np.ones(len(coords),bool)
    for _ in range(3):
        coef=np.linalg.lstsq(design[keep],samples[keep],rcond=None)[0]
        residual=np.linalg.norm(samples-design@coef,axis=1);keep=residual<=max(8,np.percentile(residual,70))
    yy,xx=np.mgrid[0:b-t,0:r-l]
    plane=np.clip(np.stack((np.ones_like(xx),xx/max(1,r-l),yy/max(1,b-t)),axis=-1)@coef,0,255).astype(np.uint8)
    return plane, bool(np.percentile(residual,85)<20)


def ssim(a,b):
    x=cv2.cvtColor(a,cv2.COLOR_RGB2GRAY).astype(np.float32);y=cv2.cvtColor(b,cv2.COLOR_RGB2GRAY).astype(np.float32)
    ux=cv2.GaussianBlur(x,(11,11),1.5);uy=cv2.GaussianBlur(y,(11,11),1.5)
    vx=cv2.GaussianBlur(x*x,(11,11),1.5)-ux*ux;vy=cv2.GaussianBlur(y*y,(11,11),1.5)-uy*uy
    cov=cv2.GaussianBlur(x*y,(11,11),1.5)-ux*uy
    return float((((2*ux*uy+6.5025)*(2*cov+58.5225))/((ux*ux+uy*uy+6.5025)*(vx+vy+58.5225))).mean())


def outline_distance(source, rendered):
    """Bidirectional stroke-edge distance; equal bounding boxes are insufficient."""
    a=cv2.Canny(source.astype(np.uint8),50,150)>0;b=cv2.Canny(rendered.astype(np.uint8),50,150)>0
    if not a.any() or not b.any():return None
    da=cv2.distanceTransform((~a).astype(np.uint8),cv2.DIST_L2,cv2.DIST_MASK_PRECISE)
    db=cv2.distanceTransform((~b).astype(np.uint8),cv2.DIST_L2,cv2.DIST_MASK_PRECISE)
    distances=np.concatenate((db[a],da[b]))
    return float(np.percentile(distances,95))


def probe_ink(pixels, color):
    """Recover antialiased ink on the white diagnostic canvas, by object ID.

    Unlike a same-color search on the normal slide, artwork/backgrounds and
    neighboring text cannot enter this measurement. Colors have distinct rays
    from white; reject pixels inconsistent with that compositing equation.
    """
    color=color.lstrip('#');fg=np.array([int(color[i:i+2],16) for i in (0,2,4)],np.float32)
    direction=255-fg;delta=255-pixels.astype(np.float32)
    alpha=np.sum(delta*direction,axis=2)/np.dot(direction,direction)
    residual=np.max(np.abs(delta-alpha[...,None]*direction),axis=2)
    mask=((alpha>=.45)&(alpha<=1.01)&(residual<=1.5)).astype(np.uint8)*255
    count,labels,stats,_=cv2.connectedComponentsWithStats(mask)
    for i in range(1,count):
        if stats[i,cv2.CC_STAT_AREA]<2:mask[labels==i]=0
    return mask


def text_alignment(component, receipt, rendered, source=None, probe=None, source_mask=None):
    if not component.get('editable') or not component.get('inkBounds') or not component.get('style'):return None
    x,y,w,h=component['inkBounds'];scale_x=rendered.shape[1]/receipt['width'];scale_y=rendered.shape[0]/receipt['height']
    if probe is not None:
        mask=probe_ink(probe['pixels'],probe['color'])
        box=tight(mask)
        if box is None:return None
        a,c,d,e=box;aw=(d-a)/scale_x;ah=(e-c)/scale_y
        if not .4<ah/max(1,h)<2 or not .35<aw/max(1,w)<2:return None
        # Use the saved recognition mask, independently of the rendered page's
        # neighboring artwork or remaining raster text. Resize in source space
        # before placement so the source and PowerPoint share one pixel grid.
        target=np.zeros_like(mask)
        if source_mask is None:return None
        mx,my,mw,mh=component['maskSourceRegion']
        pw,ph=receipt['pixelSize'];l,t=round(mx*mask.shape[1]/pw),round(my*mask.shape[0]/ph)
        r,b=round((mx+mw)*mask.shape[1]/pw),round((my+mh)*mask.shape[0]/ph)
        if l<0 or t<0 or r>mask.shape[1] or b>mask.shape[0] or r<=l or b<=t:return None
        target[t:b,l:r]=(cv2.resize(source_mask,(r-l,b-t),interpolation=cv2.INTER_AREA)>=128).astype(np.uint8)*255
        expected=tight(target)
        if expected is None:return None
        l,t,r,b=expected;ex,ey,ew,eh=l/scale_x,t/scale_y,(r-l)/scale_x,(b-t)/scale_y
        outline=outline_distance(target,mask)
        dx,dy=ex-a/scale_x,ey-c/scale_y
        return {'method':'isolated-text-probe','dx':round(dx,4),'dy':round(dy,4),
                'widthRatio':round(ew/max(1,aw),5),'heightRatio':round(eh/max(1,ah),5),
                'edgeError':round(max(abs(dx),abs(dy),abs(ew-aw),abs(eh-ah)),4),
                'glyphEdgeP95':round(outline/((scale_x+scale_y)/2),4) if outline is not None else None,
                'sourceInkBounds':[ex,ey,ew,eh],'renderInkBounds':[a/scale_x,c/scale_y,aw,ah]}
    pad=max(5,component['style']['fontSize']*.45)
    l,t=max(0,math.floor((x-pad)*scale_x)),max(0,math.floor((y-pad)*scale_y))
    r,b=min(rendered.shape[1],math.ceil((x+w+pad)*scale_x)),min(rendered.shape[0],math.ceil((y+h+pad)*scale_y))
    if r<=l or b<=t:return None
    color=component['style']['color'].lstrip('#');fg=np.array([int(color[i:i+2],16) for i in (0,2,4)])
    pixels=rendered[t:b,l:r].astype(np.float32)
    mask=(np.linalg.norm(pixels-fg,axis=2)<55).astype(np.uint8)*255
    count,labels,stats,_=cv2.connectedComponentsWithStats(mask)
    for i in range(1,count):
        a,c,cw,ch,area=stats[i]
        if area<2 or ch>h*scale_y*1.7 or cw>w*scale_x*1.2:mask[labels==i]=0
    box=tight(mask)
    if box is None:return None
    a,c,d,e=box;aw=(d-a)/scale_x;ah=(e-c)/scale_y
    if not .55<ah/max(1,h)<1.65 or not .5<aw/max(1,w)<1.5:return None
    dx=x-(l+a)/scale_x;dy=y-(t+c)/scale_y
    outline=None
    if source is not None:
        source_mask=(np.linalg.norm(source[t:b,l:r].astype(np.float32)-fg,axis=2)<55).astype(np.uint8)*255
        outline=outline_distance(source_mask,mask)
        if outline is not None:outline=round(outline/((scale_x+scale_y)/2),4)
    return {'dx':round(dx,4),'dy':round(dy,4),'widthRatio':round(w/max(1,aw),5),'heightRatio':round(h/max(1,ah),5),
            'edgeError':round(max(abs(dx),abs(dy),abs(w-aw),abs(h-ah)),4),'glyphEdgeP95':outline,'sourceInkBounds':[x,y,w,h],
            'renderInkBounds':[(l+a)/scale_x,(t+c)/scale_y,aw,ah]}


def repair_elements(receipt, comparison):
    import copy
    elements=copy.deepcopy(receipt['elements']);regions={x['id']:x for x in comparison['regions']};changes=[]
    for element in elements:
        region=regions.get(element['elementId'],{});align=region.get('alignment')
        if element['elementType']!='text' or not align or align['edgeError']<=1.5:continue
        content=element['content'];fs=content['fontSize'];x,y,w,h=element['bounds']
        dx=max(-fs*.35,min(fs*.35,align['dx']));dy=max(-fs*.35,min(fs*.35,align['dy']))
        size_ratio=max(.94,min(1.06,align['heightRatio']))
        if align.get('method')=='isolated-text-probe':
            # Font scaling also changes the glyph's offset inside its line box.
            # Compensate that offset rather than oscillating around the baseline.
            rx,ry=align['renderInkBounds'][:2]
            dx=max(-fs*.35,min(fs*.35,align['dx']-(rx-x)*(size_ratio-1)))
            dy=max(-fs*.35,min(fs*.35,align['dy']-(ry-y)*(size_ratio-1)))
        # Pixel position is measured in final renderer coordinates. A single
        # global DPI/baseline offset cannot calibrate all font families/runs.
        content['fontSize']=round(fs*size_ratio,4)
        count=max(1,len(html.unescape(content['text']))-1)
        source_width=align['sourceInkBounds'][2];actual_width=align['renderInkBounds'][2]
        tracking=content.get('letterSpacing',0)+(source_width-actual_width*size_ratio)/count
        content['letterSpacing']=round(max(-fs*.12,min(fs*.14,tracking)),4)
        nx=max(0,min(receipt['width']-1,x+dx));ny=max(0,min(receipt['height']-1,y+dy))
        element['bounds']=[nx,ny,min(receipt['width']-nx,max(w,source_width+fs*.25)),min(receipt['height']-ny,max(h,content['fontSize']*1.8))]
        changes.append({'elementId':element['elementId'],'dx':dx,'dy':dy,'fontScale':size_ratio,'letterSpacing':content['letterSpacing']})
    return elements,changes
