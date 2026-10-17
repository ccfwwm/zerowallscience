"""Read back exported OOXML and render every page with LibreOffice PDF output."""
from pathlib import Path
import json, sys, zipfile, hashlib, io, re, subprocess, shutil, uuid
import xml.etree.ElementTree as ET
import fitz
from PIL import Image
root=Path('artifacts/verification/8.3.5/ppt-maker-smoke').resolve()
mode=sys.argv[1] if len(sys.argv)>1 else 'pilot'
stem='NHANES-两页验证' if mode=='pilot' else 'NHANES-14页丰富版'
pptx=root/(stem+'.pptx');render=root/(mode+'-export-render');pdf=render/(stem+'.pdf')
render.mkdir(exist_ok=True);ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','c':'http://schemas.openxmlformats.org/drawingml/2006/chart'}
pptx_sha=hashlib.sha256(pptx.read_bytes()).hexdigest()
spec=json.loads((root/('pilot-spec.json' if mode=='pilot' else 'presentation-spec.json')).read_text(encoding='utf8'))
# A fresh output directory prevents an old PDF from passing new OOXML checks.
run_dir=render/(pptx_sha[:12]+'-'+uuid.uuid4().hex[:8]);run_dir.mkdir()
soffice=shutil.which('soffice') or 'C:/Program Files/LibreOffice/program/soffice.com'
conversion=subprocess.run([soffice,'-env:UserInstallation='+(root/('lo-readback-'+mode)).as_uri(),'--headless','--convert-to','pdf:impress_pdf_Export','--outdir',str(run_dir),str(pptx)],capture_output=True,text=True,timeout=120)
fresh_pdf=run_dir/(stem+'.pdf')
assert conversion.returncode==0 and fresh_pdf.is_file(), ('fresh export render failed',conversion.returncode,conversion.stderr[:1000])
shutil.copy2(fresh_pdf,pdf)
slides=[];embedded=[]
with zipfile.ZipFile(pptx) as z:
 slide_size=ET.fromstring(z.read('ppt/presentation.xml')).find('p:sldSz',ns)
 page_width,page_height=int(slide_size.get('cx')),int(slide_size.get('cy'))
 names=sorted([n for n in z.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml',n)],key=lambda n:int(re.search(r'(\d+)\.xml',n)[1]))
 for name in names:
  x=ET.fromstring(z.read(name));text=[t.text or '' for t in x.findall('.//a:t',ns)]
  assert not any(word in ''.join(text) for word in ['原论文','原文 p.','生成插图','GPT Image','可编辑','DOI:']), (name,'production text on report canvas')
  n=int(re.search(r'(\d+)\.xml',name)[1]);notes=f'ppt/notesSlides/notesSlide{n}.xml'
  assert notes in z.namelist(), (name,'missing notes')
  assert '10.1186/s12937-024-01017-0' in z.read(notes).decode(), (name,'missing source in notes')
  if spec.get('designIntent',{}).get('sectionKickers') is False:
   # A section name may legitimately be a body label (e.g. the cover's
   # NHANES years). Detect the unwanted small label in the top-left header,
   # rather than prohibiting its words everywhere in the presentation.
   section=spec['slides'][n-1]['section']
   for shape in x.findall('.//p:sp',ns):
    shape_text=''.join(t.text or '' for t in shape.findall('.//a:t',ns))
    off=shape.find('p:spPr/a:xfrm/a:off',ns)
    sizes=[int(r.get('sz'))/100 for r in shape.findall('.//a:rPr',ns) if r.get('sz')]
    is_header=off is not None and int(off.get('x'))<page_width*0.5 and int(off.get('y'))<page_height*0.1
    is_small=bool(sizes) and max(sizes)<=spec['fonts']['bodyPt']
    assert not (shape_text==section and is_header and is_small), (n,'unexpected section kicker')
  slides.append({'page':n,'editableTextRuns':len(text),'pictures':len(x.findall('.//p:pic',ns)),'tables':len(x.findall('.//a:tbl',ns)),'charts':len(x.findall('.//c:chart',ns)),'text':text})
 for name in z.namelist():
  if name.startswith('ppt/media/'):
   data=z.read(name);sha=hashlib.sha256(data).hexdigest()
   try:
    im=Image.open(io.BytesIO(data));alpha=im.getchannel('A').getextrema() if 'A' in im.getbands() else None
   except Exception:alpha=None
   embedded.append({'path':name,'sha256':sha,'alphaRange':alpha})
doc=fitz.open(pdf);assert len(doc)==len(slides)
for i,p in enumerate(doc):p.get_pixmap(matrix=fitz.Matrix(4/3,4/3),alpha=False).save(render/f'page-{i+1:02d}.png')
derivatives=[]
for p in (root/'.zerowall/presentation-prepared').glob('*.png'):
 sha=hashlib.sha256(p.read_bytes()).hexdigest()
 if any(e['sha256']==sha for e in embedded):derivatives.append({'path':str(p),'sha256':sha,'embeddedUnchanged':True})
if mode=='pilot':assert derivatives,'alpha derivative not embedded unchanged'
if mode=='full':
 assert len(slides)==14
 assert sum(s['tables'] for s in slides)==2, 'native tables missing'
 assert sum(s['charts'] for s in slides)==1, 'native chart missing'
 with zipfile.ZipFile(pptx) as z:
  chart=ET.fromstring(z.read('ppt/charts/chart1.xml'))
  assert chart.find('.//c:valAx/c:majorUnit',ns).get('val')=='0.3', 'authored numeric tick interval lost'
report={'mode':mode,'pptx':str(pptx),'bytes':pptx.stat().st_size,'sha256':pptx_sha,'pages':slides,'embeddedMedia':embedded,'alphaDerivatives':derivatives,'renderedPages':len(doc),'render':{'engine':'LibreOffice','freshPdf':str(fresh_pdf),'inputSha256':pptx_sha},'sourcesInNotes':True,'noProductionTextOnCanvas':True}
(root/f'{mode}-export-readback.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in report.items() if k not in ['pages','embeddedMedia']},ensure_ascii=False))
