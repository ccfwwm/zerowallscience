"""Deterministic integration assertions against both real detection engines."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import numpy as np
from PIL import Image, ImageDraw
import fitz

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'resources/skills/zerowall-image-dup/scripts/zerowall_integrity.py'

def invoke(*args):
    completed = subprocess.run([sys.executable, str(SCRIPT), *map(str,args)], capture_output=True, text=True, encoding='utf-8', timeout=300)
    result = json.loads(completed.stdout.splitlines()[-1])
    assert completed.returncode == 0 and result['ok'], (result, completed.stderr[-3000:])
    return result

def main():
    output = Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(tempfile.mkdtemp(prefix='zerowall-integrity-test-'))
    inputs = output / '中文样本' / '子目录'; inputs.mkdir(parents=True,exist_ok=True)
    rng = np.random.default_rng(29)
    image = Image.fromarray(rng.integers(0,256,(320,320,3),dtype=np.uint8))
    draw = ImageDraw.Draw(image)
    for _ in range(24):
        x,y = rng.integers(0,270,2); draw.ellipse((x,y,x+25,y+25),fill=tuple(rng.integers(0,256,3)))
    image.save(inputs/'original.png'); image.save(inputs/'duplicate.png')
    image.transpose(Image.Transpose.FLIP_LEFT_RIGHT).save(inputs/'flipped.png')
    image.rotate(90).save(inputs/'rotated.png')
    image.resize((240,240)).save(inputs/'compressed.jpg',quality=65)
    image.crop((40,40,200,200)).resize((256,256)).save(inputs/'cropped.png')
    copied=image.copy(); copied.paste(image.crop((16,16,112,112)),(192,192)); copied.save(inputs/'copy-move.png')
    Image.fromarray(rng.integers(0,256,(320,320,3),dtype=np.uint8)).save(inputs/'negative.png')
    (inputs/'broken.png').write_bytes(b'not an image')
    (inputs/'broken.pdf').write_bytes(b'not a PDF')
    for name in ['paper-a.pdf','paper-b.pdf']:
        with fitz.open() as pdf:
            for i in range(2):
                page=pdf.new_page();page.insert_text((40,35),f'Results page {i+1}')
                page.insert_image(fitz.Rect(40,60,360,380),filename=str(inputs/'original.png'))
            pdf.save(inputs/name)
    workspace=output/'tasks'
    scan=invoke('image', inputs.parent,'--workspace',workspace)
    payload=json.loads(Path(scan['json']).read_text(encoding='utf-8'))
    def pair(f):return {Path(s['file']).name for s in f['sources']}
    pairs=[f for f in payload['findings'] if len(f['sources'])==2]
    outcomes={}
    for name in ['duplicate.png','flipped.png','rotated.png','compressed.jpg','cropped.png']:
        matches=[f for f in pairs if pair(f)=={'original.png',name}]
        assert matches, name
        assert any(f['evidence_images'] for f in matches), name
        outcomes[name]=sorted({e['engine'] for f in matches for e in f['evidence_records']})
    copy=[f for f in payload['findings'] if pair(f)=={'copy-move.png'} and f['raw'].get('regions')]
    assert copy and copy[0]['raw']['regions'][0]['ax'] < .15 and copy[0]['raw']['regions'][0]['bx'] > .5
    assert not any('negative.png' in pair(f) for f in pairs), 'Negative image incorrectly paired'
    assert any('broken.png' in str(s) for s in payload['skipped'])
    assert any('broken.pdf' in str(s) for s in payload['skipped'])
    assert payload['directory_summary']
    for f in payload['findings']:
        for artifact in f['evidence_images']: assert (Path(scan['json']).parent/artifact).stat().st_size > 0
    page_scan=invoke('image',inputs/'paper-a.pdf','--cross-page-only','--workspace',workspace)
    page_payload=json.loads(Path(page_scan['json']).read_text(encoding='utf-8'))
    assert any({s.get('page') for s in f['sources']}=={1,2} for f in page_payload['findings'])
    assert all(len({(s['file'],s['page']) for s in f['sources']})>1 for f in page_payload['findings'])
    compare=invoke('compare', inputs/'paper-a.pdf', inputs/'paper-b.pdf','--workspace',workspace)
    compared=json.loads(Path(compare['json']).read_text(encoding='utf-8'))
    cross=[f for f in compared['findings'] if pair(f)=={'paper-a.pdf','paper-b.pdf'}]
    assert cross and any(s.get('pdf_rects') for f in cross for s in f['sources'])
    assert not compared['partial'], compared['steps']
    assert (Path(compare['json']).parent/'paper-000-text.json').exists()
    resumed=invoke('compare',inputs/'paper-a.pdf',inputs/'paper-b.pdf','--workspace',workspace)
    assert resumed.get('cached') and resumed['trace_id']==compare['trace_id']
    invoke('report','--trace-id',compare['trace_id'],'--workspace',workspace)
    summary={'outcomes':outcomes,'copy_move_regions':copy[0]['raw']['regions'],'negative_pairs':0,
             'cross_paper_findings':len(cross),'pdf_cross_page_findings':len(page_payload['findings']),
             'skipped':compared['skipped'],'image_report':scan,'comparison_report':compare}
    (output/'verification.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'ok':True,'verification':str(output/'verification.json')},ensure_ascii=False))

if __name__=='__main__':main()
