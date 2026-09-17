"""Verify that MinerU artifacts, not native PDF text, reach both detectors."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile

import fitz
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'resources/skills/zerowall-image-dup/scripts/zerowall_integrity.py'


def main():
    root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix='mineru-handoff-'))
    root.mkdir(parents=True, exist_ok=True)
    files, mappings = [], []
    for name in ['paper-a', 'paper-b']:
        folder = root / name
        folder.mkdir(exist_ok=True)
        image = folder / 'figure.png'
        Image.fromarray(np.random.default_rng(14).integers(0, 256, (240, 240, 3), dtype=np.uint8)).save(image)
        pdf = folder / 'source.pdf'
        with fitz.open() as doc:
            doc.new_page().insert_text((40, 40), 'Native text must be replaced by MinerU OCR.')
            doc.save(pdf)
        markdown = folder / 'full.md'
        markdown.write_text('MinerU OCR evidence: Methods sample size 120. Results p=0.04.', encoding='utf-8')
        content = folder / 'source_content_list.json'
        content.write_text(json.dumps([
            {'type': 'text', 'text': markdown.read_text(), 'page_idx': 0, 'bbox': [0, 0, 100, 100]},
            {'type': 'image', 'img_path': 'figure.png', 'page_idx': 0, 'bbox': [20, 100, 300, 400]},
        ]), encoding='utf-8')
        manifest = folder / 'parse-manifest.json'
        manifest.write_text(json.dumps({'schema': 1, 'parser': 'mineru', 'source': str(pdf),
            'markdown': str(markdown), 'images': [str(image)], 'contentList': str(content)}), encoding='utf-8')
        files.append(str(pdf))
        mappings.extend(['--parsed', f'{pdf}={manifest}'])
    result = subprocess.run([sys.executable, str(SCRIPT), 'compare', *files, *mappings,
        '--workspace', str(root / 'jobs')], capture_output=True, text=True, encoding='utf-8', timeout=300)
    value = json.loads(result.stdout.splitlines()[-1])
    assert result.returncode == 0 and value['ok'], (value, result.stderr[-2000:])
    payload = json.loads(Path(value['json']).read_text(encoding='utf-8'))
    assert not payload['partial'], payload['skipped']
    text = json.loads((Path(value['json']).parent / 'paper-000-text.json').read_text(encoding='utf-8'))
    assert 'MinerU OCR evidence' in text[0]['text'] and 'Native text' not in str(text)
    assert any({s['file'] for s in finding['sources']} == set(files) for finding in payload['findings'])
    assert any({s.get('page') for s in finding['sources']} == {1} for finding in payload['findings'])
    (root / 'verification.json').write_text(json.dumps({'ok': True, 'ocr_text_forwarded': True,
        'cross_paper_image_match': True, 'report': value}, indent=2), encoding='utf-8')
    print(json.dumps(value))


if __name__ == '__main__':
    main()
