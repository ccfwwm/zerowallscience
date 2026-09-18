"""Regression for OCR tables, Unicode IO, tile scheduling and global hash coverage."""
import importlib.util
import json
import random
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / 'resources/skills/zerowall-image-dup/scripts'
sys.path.insert(0, str(SCRIPTS))
import zerowall_integrity as runner
from mineru_adapter import normalize, extracted_tables, region_records, figure_findings
from manusift.detectors.sift_copymove import _read_image
from manusift.contracts import ParsedDoc
from PIL import Image

root = Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(tempfile.mkdtemp(prefix='integrity-640-'))
root.mkdir(parents=True, exist_ok=True)
for ext in ['png','jpg','tiff']:
    path=root/f'中文 路径.{ext}'
    Image.new('RGB',(80,90),(41,99,188)).save(path)
    assert _read_image(str(path)).shape == (90,80,3)

raw=[[{'type':'list','content':{'list_items':[{'item_content':[{'content':'References: Test 2026'}]}]}},
    {'type':'table','content':{'html':'<table><tr><th>Group</th><th>N</th></tr><tr><td>A</td><td>12</td></tr></table>'},'bbox':[1,2,3,4]}]]
rows=normalize(raw)
assert rows[0]['text']=='References: Test 2026'
tables=extracted_tables(rows,root/'paper.pdf',[])
assert tables[0].rows==[['A','12']] and tables[0].source_index==0

region=root/'region';region.mkdir(exist_ok=True)
(region/'full.md').write_text('n=12, p=0.04, 33.3%',encoding='utf8')
figure=root/'中文 路径.png'
records=[{'type':'image','img_path':figure.name,'page_idx':2,'bbox':[100,200,400,500]}]
manifest={'markdown':str(root/'full.md'),'images':[str(figure)]}
skipped=[]
found,pending=region_records(records,manifest,{},root/'paper.pdf',skipped)
assert pending and not found
found,pending=region_records(records,manifest,{str(figure):{'markdown':str(region/'full.md')}},root/'paper.pdf',[])
doc=ParsedDoc('test',str(root/'paper.pdf'),[],[],{'zerowall_figure_ocr':found})
assert figure_findings(doc)[0].raw['page']==3 and not pending

# Real worker global comparisons must include duplicate pairs spanning distant tiles.
rng=random.Random(971)
fields=['aH','pH','dH','dH_hf','dH_vf','dH_r90','dH_r180','dH_r270']
bench=[]
for count in [300,1000,4044]:
    features=[{'name':f'{i:05d}.png',**{k:f'{rng.getrandbits(64):016x}' for k in fields}} for i in range(count)]
    features[-1]={**features[0],'name':f'{count-1:05d}.png'}
    start=time.monotonic()
    result=runner.node_scan({'compareFeatures':features,'threshold':0},timeout=120)
    assert any({p['a'],p['b']}=={features[0]['name'],features[-1]['name']} for p in result['pairs'])
    bench.append({'images':count,'seconds':round(time.monotonic()-start,3),'pairs':count*(count-1)//2})

# Real image tiles: timeout after a completed feature tile, then resume without redoing it.
paths=[]
import numpy as np
for i in range(6):
    path=root/f'tile-{i}.png'
    Image.fromarray(np.random.default_rng(i if i<5 else 0).integers(0,256,(128,128,3),dtype=np.uint8)).save(path)
    paths.append(str(path))
calls=[]
def interrupted(config,timeout):
    calls.append(config)
    if len(calls)==2:raise TimeoutError('Injected interruption')
    return runner.node_scan(config,timeout)
job=root/'resume';job.mkdir(exist_ok=True)
first=runner.batch_scan(paths,job,8,interrupted,runner.save,120,2)
assert first['partial'] and first['progress']['completed']==1
cached=job/'steps/region-batches/features-00000.json';stamp=cached.stat().st_mtime_ns
second=runner.batch_scan(paths,job,8,runner.node_scan,runner.save,120,2)
assert not second['partial'] and cached.stat().st_mtime_ns==stamp
assert second['progress']['completed']==second['progress']['planned']
assert any({p['a'],p['b']}=={'tile-0.png','tile-5.png'} for p in second['pairs'])
assert any({p['a'],p['b']}=={'tile-0.png','tile-5.png'} for p in second['crossPairs'])
result={'ok':True,'unicode_formats':3,'mineru_tables':True,'figure_ocr':True,'resume':True,'hash_benchmarks':bench}
(root/'verification.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result))
