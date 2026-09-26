"""ZeroWall offline screening: pinned upstream detectors and image evidence adapters."""
from __future__ import annotations

import argparse
import base64
from contextlib import contextmanager
from importlib.metadata import version
from dataclasses import asdict, replace
import hashlib
import html
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'vendor'))
from mineru_adapter import normalize, extracted_tables, region_records, figure_findings
from batch_scan import scan as batch_scan
VERSION = '7.1.0'
IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp', '.gif', '.webp', '.avif', '.heic', '.heif', '.jp2', '.j2k', '.svg'}
COMPANION_EXTENSIONS = IMAGE_EXTENSIONS | {'.pdf', '.xlsx', '.csv', '.tsv'}
COMPANION_DIRECTORY = re.compile(r'(?:source\s*data|extended\s*data|supplement|supporting\s*information|unprocessed\s*(?:blot|western|gel)|additional\s*file|online\s*resource)', re.I)
COMPANION_FILENAME = COMPANION_DIRECTORY
CORE = {'fitz': 'PyMuPDF', 'pydantic_settings': 'pydantic-settings', 'numpy': 'numpy', 'cv2': 'opencv-python-headless', 'PIL': 'Pillow', 'imagehash': 'ImageHash', 'scipy': 'scipy', 'skimage': 'scikit-image', 'structlog': 'structlog', 'pikepdf': 'pikepdf', 'markdown': 'Markdown', 'yaml': 'PyYAML'}


@contextmanager
def task_lock(job):
    # OS file locks are released even if the worker exits unexpectedly.
    with (job / '.lock').open('a+b') as lock:
        lock.seek(0)
        if lock.read(1) == b'':
            lock.write(b'0'); lock.flush()
        lock.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise RuntimeError('This task is already running; reuse its trace ID after it finishes.') from error
        try:
            yield
        finally:
            lock.seek(0)
            if os.name == 'nt':
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + f'.tmp-{uuid.uuid4().hex}')
    try:
        temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
        for attempt in range(10):
            try:
                temp.replace(path)
                return
            except PermissionError:
                if attempt == 9:
                    raise
                time.sleep(0.05 * (attempt + 1))
    finally:
        temp.unlink(missing_ok=True)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def preflight(require_local_ocr=True, require_cnn=True):
    missing, errors = [], {}
    required = dict(CORE)
    if require_local_ocr or require_cnn:
        required['torchvision'] = 'torchvision'
    if require_local_ocr:
        required['easyocr'] = 'easyocr'
    if require_cnn:
        required['imagededup'] = 'imagededup'
    pinned = {'torch': '2.14.0'}
    if require_local_ocr or require_cnn:
        pinned['torchvision'] = '0.29.0'
    if require_local_ocr:
        pinned['easyocr'] = '1.7.2'
    if require_cnn:
        pinned['imagededup'] = '0.3.3.post2'
    for module, package in required.items():
        try:
            __import__(module)
            installed = version(package)
            if package in pinned and installed != pinned[package]:
                raise RuntimeError(f'expected {package}=={pinned[package]}, found {installed}')
        except Exception as error:
            missing.append(package)
            errors[package] = str(error)

    local_ocr_available = importlib.util.find_spec('easyocr') is not None
    return {'ok': not missing, 'missing': missing, 'errors': errors, 'python': sys.executable, 'engine': VERSION,
            'ocr': bool(require_local_ocr and local_ocr_available), 'ocr_provider': 'easyocr' if require_local_ocr and local_ocr_available else 'disabled',
            'cnn': bool(require_cnn and 'imagededup' not in missing), 'cnn_required': bool(require_cnn),
            'node': os.environ.get('ZEROWALL_NODE') or shutil.which('node'),
            'worker': str(worker_path()),
            'local_ocr_required': bool(require_local_ocr),
            'local_ocr_available': local_ocr_available}


def worker_path():
    configured = os.environ.get('ZEROWALL_INTEGRITY_WORKER')
    if configured:
        return Path(configured)
    for parent in ROOT.parents:
        candidate = parent / 'packages/integrity-runtime/hash-worker.mjs'
        if candidate.is_file():
            return candidate
    raise RuntimeError('ZeroWall image worker is unavailable; repair the application runtime.')


def node_scan(config, timeout=60):
    node = os.environ.get('ZEROWALL_NODE') or shutil.which('node')
    if not node:
        raise RuntimeError('ZeroWall Node runtime is unavailable.')
    env = {k: v for k, v in os.environ.items() if not re.search('KEY|SECRET|TOKEN|PASSWORD', k, re.I)}
    env['ELECTRON_RUN_AS_NODE'] = '1'
    result = subprocess.run([node, str(worker_path()), '--stdin'], input=json.dumps(config),
                            text=True, encoding='utf-8', capture_output=True, timeout=timeout,
                            env=env, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if result.returncode:
        raise RuntimeError('Image worker failed: ' + result.stderr[-2000:])
    value = json.loads(result.stdout)
    if not value.get('ok'):
        raise RuntimeError('Image worker failed: ' + str(value))
    return value


def input_paths(values, recursive):
    paths = []
    for value in values:
        path = Path(value).resolve(strict=True)
        if path.is_dir():
            paths.extend(p for p in (path.rglob('*') if recursive else path.iterdir())
                         if p.is_file() and not p.is_symlink() and p.suffix.lower() in IMAGE_EXTENSIONS | {'.pdf'})
        else:
            paths.append(path)
    return sorted(set(paths), key=str)


def data_paths(values):
    """Expand explicit --data inputs without following symlinks."""
    result = set()
    for value in values:
        path = Path(value).resolve(strict=True)
        if path.is_file():
            result.add(path)
        else:
            result.update(p.resolve() for p in path.rglob('*') if p.is_file() and not p.is_symlink())
    return sorted(result, key=str)


def discover_companions(primary_pdfs):
    """Discover only article-adjacent, clearly labelled companion folders/files."""
    associations = {}
    discovered = set()
    for pdf in primary_pdfs:
        matches = set()
        try:
            children = list(pdf.parent.iterdir())
        except OSError:
            associations[str(pdf)] = []
            continue
        for child in children:
            if child == pdf or child.is_symlink():
                continue
            if child.is_dir() and COMPANION_DIRECTORY.search(child.name):
                for candidate in child.rglob('*'):
                    if candidate.is_file() and not candidate.is_symlink() and candidate.suffix.lower() in COMPANION_EXTENSIONS:
                        matches.add(candidate.resolve())
            elif child.is_file() and COMPANION_FILENAME.search(child.stem) and child.suffix.lower() in COMPANION_EXTENSIONS:
                matches.add(child.resolve())
        associations[str(pdf)] = sorted(matches, key=str)
        discovered.update(matches)
    return associations, sorted(discovered, key=str)


def image_doc(paths, trace, job, skipped):
    from manusift.contracts import ExtractedImage, ParsedDoc
    from manusift.ingest.pdf import _compute_phash
    from PIL import Image
    records = []
    for index, path in enumerate(paths):
        try:
            try:
                decoded = Image.open(path)
            except Exception:
                converted = job / 'steps/images' / f'{index:04d}.png'
                converted.parent.mkdir(parents=True, exist_ok=True)
                node_scan({'normalize': {'input': str(path), 'output': str(converted)}})
                decoded = Image.open(converted)
            with decoded as image:
                converted = job / 'steps/images' / f'{index:04d}.png'
                converted.parent.mkdir(parents=True, exist_ok=True)
                image.convert('RGB').save(converted)
                records.append(ExtractedImage(page=0, index=index, xref=index + 1,
                    phash=_compute_phash(converted.read_bytes()), width=image.width, height=image.height,
                    bytes_size=path.stat().st_size, image_path=str(converted), exif={'zerowall_source': str(path)}))
        except Exception as error:
            skipped.append({'source': str(path), 'stage': 'image-decode', 'reason': str(error)})
    return ParsedDoc(trace, str(job), [], records, {})


DEADLINE = float('inf')


def image_detectors(doc, job, steps):
    from manusift.detectors import load_detector_class
    from manusift.checkpoint import read_step_silent, write_step
    cross_document_only = os.environ.get('MANUSIFT_CROSS_DOCUMENT_ONLY', '').strip().lower() in {'1', 'true', 'yes'}
    names = ['ImageForensicsDetector'] if cross_document_only else ['ImageDuplicateDetector', 'ImageForensicsDetector', 'SiftCopyMoveDetector']
    if not cross_document_only and Path(doc.source_path).suffix.lower() == '.pdf':
        names.append('PanelDuplicateDetector')
    findings = []
    for name in names:
        try:
            cls = load_detector_class(name)
            checkpoint = job / 'steps' / f'{cls.name}.json'
            result = read_step_silent(checkpoint)
            unfinished_pairs = result and any(
                isinstance(value, dict) and value.get('remaining', 0) > 0
                for key, value in (result.stats or {}).items()
                if key in {'cross_image_pairs', 'panel_pairs'}
            )
            if result is None or not result.ok or unfinished_pairs:
                remaining = DEADLINE - time.monotonic()
                if remaining < 1:
                    raise TimeoutError('Budget reached; resume task.')
                checkpoint.parent.mkdir(parents=True, exist_ok=True)
                request = checkpoint.with_suffix('.input.json')
                save(request, asdict(doc))
                timeout = min(360 if name == 'ImageForensicsDetector' else 75, remaining + 15)
                process = subprocess.run([sys.executable, str(ROOT / 'detector_worker.py'), name, str(request), str(checkpoint)],
                    capture_output=True, text=True, encoding='utf-8', errors='replace',
                    timeout=timeout,
                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                if process.returncode:
                    raise RuntimeError(process.stderr[-2000:])
                result = read_step_silent(checkpoint)
                if result is None:
                    raise RuntimeError('Detector did not write a valid checkpoint')
            steps.append({'detector': result.detector, 'ok': result.ok, 'error': result.error, 'stats': result.stats})
            findings.extend(result.findings)
        except Exception as error:
            steps.append({'detector': name, 'ok': False, 'error': str(error)})
    return findings


def load_pdf(path, trace, workspace, only_painted):
    from manusift.ingest.pdf import parse_pdf
    doc = parse_pdf(path, trace, workspace)
    if only_painted:
        import fitz
        with fitz.open(path) as pdf:
            images = [replace(image, exif={**image.exif, 'zerowall_pdf_rects': [list(rect) for rect in pdf[image.page].get_image_rects(image.xref)]}) for image in doc.images if pdf[image.page].get_image_rects(image.xref)]
        doc = replace(doc, images=images)
    return doc


def parsed_manifests(values):
    result = {}
    for value in values:
        source, separator, manifest = value.partition('=')
        if not separator:
            raise ValueError('--parsed requires SOURCE=MANIFEST')
        source = str(Path(source).resolve(strict=True))
        manifest = Path(manifest).resolve(strict=True)
        data = json.loads(manifest.read_text(encoding='utf-8'))
        if data.get('schema') != 1 or data.get('parser') != 'mineru':
            raise ValueError('Unsupported parsing manifest: ' + str(manifest))
        root = manifest.parent
        for key in ['markdown', 'contentList']:
            if data.get(key):
                path = Path(data[key]).resolve(strict=True)
                if not path.is_relative_to(root):
                    raise ValueError('Parsing artifact escapes its result directory')
        for image in data.get('images', []):
            if not Path(image).resolve(strict=True).is_relative_to(root):
                raise ValueError('Parsing image escapes its result directory')
        files = [data['markdown'], *data.get('images', []), *([data['contentList']] if data.get('contentList') else [])]
        data['signature'] = [(str(f), digest(Path(f))) for f in files]
        data['manifest'] = str(manifest)
        result[source] = data
    return result


def load_mineru(path, trace, workspace, manifest, skipped, regions=None):
    from manusift.contracts import ParsedDoc, TextBlock
    records = normalize(json.loads(Path(manifest['contentList']).read_text(encoding='utf-8'))) if manifest.get('contentList') else []
    if not isinstance(records, list):
        raise ValueError('MinerU content list must be an array')
    text = [TextBlock(int(row.get('page_idx', -1)), tuple(row.get('bbox') or [0, 0, 0, 0]), str(row['text']))
            for row in records if isinstance(row, dict) and row.get('text')]
    if not text:
        text = [TextBlock(-1, (0, 0, 0, 0), Path(manifest['markdown']).read_text(encoding='utf-8'))]
        skipped.append({'source': str(path), 'detector': 'page-localization', 'reason': 'MinerU returned no text page mapping; Markdown location only.'})
    image_paths = [Path(value) for value in manifest.get('images', [])]
    staged = image_doc(image_paths, trace, workspace / trace / 'mineru', skipped)
    images = []
    for image in staged.images:
        original = image.exif['zerowall_source']
        row = next((r for r in records if isinstance(r, dict) and r.get('img_path') and
                    (Path(manifest['markdown']).parent / r['img_path']).resolve() == Path(original).resolve()), {})
        page = row.get('page_idx')
        images.append(replace(image, page=page if isinstance(page, int) else 0,
            exif={**image.exif, 'zerowall_source': str(path), 'zerowall_page': page + 1 if isinstance(page, int) else None,
                  'mineru_image': original, 'mineru_bbox': row.get('bbox')}))
    # Preserve native table extraction where available; OCR/text/images come from MinerU.
    base = load_pdf(path, trace, workspace, True) if path.suffix.lower() == '.pdf' else ParsedDoc(trace, str(path), [], [], {})
    figure_rows, requests = region_records(records, manifest, regions or {}, path, skipped)
    ocr_tables = extracted_tables(records + figure_rows, path, skipped)
    # Prefer explicit MinerU tables, retain companion data without duplicating native PDF tables.
    tables = ocr_tables + [t for t in base.tables if t.source_kind in {'csv', 'xlsx'}] if ocr_tables else base.tables
    return replace(base, text_blocks=text, images=images, tables=tables,
        metadata={**base.metadata, 'zerowall_figure_ocr': figure_rows, 'zerowall_ocr_requests': requests,
                  'zerowall_mineru': {'provider': 'mineru', 'ocr': manifest.get('ocr'), 'tables': len(ocr_tables),
                      'blocks': len(records), 'task_id': manifest.get('taskId'), 'model': manifest.get('modelVersion')}})


def pair_sources(raw, doc):
    sources = []
    for key in ['image_a', 'image_b']:
        ref = raw.get(key)
        if not isinstance(ref, dict):
            continue
        record = next((i for i in doc.images if i.page == ref.get('page') and i.index == ref.get('index')), None)
        if record:
            source = image_source(record, doc.source_path)
            if raw.get('bbox_' + key[-1]):
                source['bbox'] = raw['bbox_' + key[-1]]
            sources.append(source)
    if not sources and 'image_index' in raw:
        index = raw['image_index']
        if isinstance(index, int) and 0 <= index < len(doc.images):
            record = doc.images[index]
            for suffix in ('a', 'b') if raw.get('bbox_a') and raw.get('bbox_b') else ('a',):
                source = image_source(record, doc.source_path)
                source['panel'] = suffix
                source['bbox'] = raw.get('bbox_' + suffix)
                sources.append(source)
    if not sources and 'page_a' in raw and 'page_b' in raw:
        sources = [{'file': doc.source_path, 'page': raw[key], 'panel': raw.get('panel_' + key[-1])}
                   for key in ['page_a', 'page_b']]
    if not sources:
        sources = [{'file': doc.source_path, 'location': raw.get('page', 'document')}]
    return sources


def image_source(image, fallback):
    source = image.exif.get('zerowall_source', fallback)
    return {'file': source, 'page': image.exif.get('zerowall_page', image.page + 1) if source.lower().endswith('.pdf') else None,
            'image': image.exif.get('zerowall_index', image.index), 'xref': image.exif.get('zerowall_xref', image.xref),
            'raster': image.image_path, 'pdf_rects': image.exif.get('zerowall_pdf_rects', [])}


def convert_findings(findings, doc):
    result = []
    for finding in findings:
        item = asdict(finding)
        item['sources'] = pair_sources(finding.raw, doc)
        if finding.raw.get('provider') == 'mineru':
            item['sources'] = [{'file': doc.source_path, 'page': finding.raw.get('page'),
                'bbox': finding.raw.get('bbox'), 'raster': finding.raw.get('image')}]
        item['engine'] = 'scientific-core'
        if item['severity'] == 'high':
            raw = item['raw']
            geometric = (raw.get('ransac_model') in {'affine', 'homography'} and
                         raw.get('inlier_count', 0) >= 40 and raw.get('warp_ncc', -1) >= 0.85 and
                         raw.get('warp_ssim', -1) >= 0.65 and raw.get('overlap_ratio', 0) >= 0.03 and
                         raw.get('bbox_a') and raw.get('bbox_b') and len(item['sources']) == 2)
            located = (len(item['sources']) == 2 and
                       all(source.get('file') and source.get('bbox') and
                           (source.get('page') is not None or not str(source['file']).lower().endswith('.pdf'))
                           for source in item['sources']))
            if not geometric or not located:
                item['severity'] = 'medium'
                item['evidence'] += ' High severity withheld because local geometric/pixel evidence was not complete.'
        # Upstream titles can overstate a screening signal; keep original wording in evidence.
        item['title'] = item['title'].replace('shows copy-move forgery', 'shows a candidate copy-move pattern')
        item['finding_id'] = hashlib.sha256(json.dumps([item['detector'], item['sources'], item['raw']], sort_keys=True).encode()).hexdigest()[:20]
        result.append(item)
    return result


def worker_findings(report, source_map, trace, output):
    result = []
    for kind, values in [('whole-image', report.get('pairs', [])), ('region-reuse', report.get('crossPairs', [])), ('copy-move', report.get('copyMove', []))]:
        for index, raw in enumerate(values):
            names = [raw.get('a'), raw.get('b')] if kind != 'copy-move' else [raw.get('name')]
            sources = [source_map.get(name, {'file': name}) for name in names if name]
            identity = hashlib.sha256(json.dumps([kind, sources, raw.get('regions')], sort_keys=True).encode()).hexdigest()[:16]
            evidence_images = []
            crop = raw.get('crop')
            if isinstance(crop, str) and crop.startswith('data:image/'):
                data = base64.b64decode(crop.split(',', 1)[1], validate=True)
                target = output / 'evidence' / f'{identity}.jpg'
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                evidence_images.append(str(target.relative_to(output)).replace('\\', '/'))
            result.append({'finding_id': identity, 'trace_id': trace, 'detector': 'zerowall-region-' + kind,
                'engine': 'region-adapter', 'severity': 'medium', 'title': kind,
                'location': ' ↔ '.join(str(s.get('file')) + (f" p{s['page']}" if s.get('page') else '') for s in sources),
                'evidence': 'Candidate image reuse; inspect the source and highlighted regions.',
                'raw': {k: v for k, v in raw.items() if k != 'crop'}, 'sources': sources,
                'evidence_images': evidence_images})
    return result


def merge_findings(findings):
    """Only merge identical pairs and region descriptions; retain uncalibrated scores per detector."""
    merged = {}
    for finding in findings:
        sources = finding.get('sources', [])
        raw = finding.get('raw', {})
        region = raw.get('regions') or raw.get('bbox') or raw.get('roi') or ([raw.get('strip_a'), raw.get('strip_b')] if 'strip_a' in raw else None)
        key = json.dumps([sorted(json.dumps({k: v for k, v in source.items() if k != 'raster'}, sort_keys=True) for source in sources), region], sort_keys=True)
        if len(sources) < 2:
            key = finding['finding_id']
        if key not in merged:
            merged[key] = {**finding, 'evidence_records': [], 'evidence_images': []}
        item = merged[key]
        item['evidence_records'].append({'engine': finding['engine'], 'detector': finding['detector'], 'raw': raw, 'severity': finding['severity']})
        item['evidence_images'].extend(finding.get('evidence_images', []))
        if finding['severity'] == 'high':
            item['severity'] = 'high'
    return list(merged.values())


def numeric_findings(rows, trace):
    converted = []
    for row in rows:
        raw = dict(row)
        source = {'file': row['source_file'], 'page': row.get('page'), 'sheet': row.get('sheet'),
                  'cell': row.get('cell'), 'bbox': row.get('bbox')}
        identity = hashlib.sha256(json.dumps([row['detector'], source, row['observed'],
                                              row['recalculation']], sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:20]
        converted.append({'finding_id': identity, 'trace_id': trace, 'detector': row['detector'],
                          'engine': 'numeric-audit', 'severity': 'medium' if row['confidence'] == 'high' else 'low',
                          'title': row['title'], 'location': ' '.join(str(x) for x in (row['source_file'], row.get('sheet'), row.get('cell')) if x),
                          'evidence': row['evidence'], 'raw': raw, 'sources': [source], 'evidence_images': []})
    return converted


def coverage_from_steps(steps, region_report, ocr, companions, numeric, cnn, images_count):
    def add_pair(key):
        fields = ('possible', 'compared', 'verified', 'remaining', 'excluded')
        total = {field: 0 for field in fields}
        measured = False
        failed = False
        for step in steps:
            stats = step.get('stats') or {}
            current = stats.get(key)
            if not isinstance(current, dict):
                continue
            measured = True
            failed = failed or not step.get('ok', True) or current.get('status') == 'not_evaluated'
            for field in fields:
                total[field] += int(current.get(field, 0))
        total['status'] = ('not_evaluated' if not measured or failed and total['possible'] == 0
                           else 'incomplete' if failed or total['remaining'] else 'done')
        return total
    progress = (region_report or {}).get('progress', {})
    whole_possible = images_count * (images_count - 1) // 2
    # The Node stage reports work tiles rather than raw pair count; treat its
    # whole-image stage as complete only once it advanced past that stage.
    whole_done = bool(region_report and progress.get('phase') in {'copy-move', 'cross-image'} and progress.get('completed', 0) >= 1)
    whole_image = {'possible': whole_possible, 'compared': whole_possible if whole_done else 0,
                  'verified': len((region_report or {}).get('pairs', [])),
                  'remaining': 0 if whole_done else whole_possible, 'excluded': 0,
                  'status': 'done' if whole_done or whole_possible == 0 and images_count <= 1 else 'not_evaluated' if not region_report else 'incomplete'}
    return {'image_pair': add_pair('cross_image_pairs'), 'whole_image': whole_image,
            'orientation_tested': ['id', 'flipH', 'flipV', 'rot180'], 'panel_pair': add_pair('panel_pairs'),
            'ocr': {key: ocr.get(key) for key in ('provider', 'needed', 'done', 'failed', 'remaining', 'status', 'reason')},
            'companions': {'discovered': len(companions['discovered']), 'scanned': len(companions['scanned']),
                           'failed': len(companions['failed']), 'excluded': len(companions['excluded'])},
            'detectors': numeric['detectors'],
            'cnn': {'enabled': cnn['enabled'], 'status': cnn['status'],
                    'candidates': cnn.get('candidates_count', 0),
                    'verified': cnn.get('verification', {}).get('verified', 0),
                    'remaining': cnn.get('verification', {}).get('remaining', 0),
                    'reason': cnn.get('reason')}}


def render_evidence(findings, output):
    from PIL import Image, ImageDraw
    for finding in findings:
        sources = finding.get('sources', [])
        tiles = []
        for index, source in enumerate(sources[:2]):
            raster = source.get('raster')
            if not raster:
                continue
            with Image.open(raster) as original:
                tile = original.convert('RGB')
            draw = ImageDraw.Draw(tile)
            regions = finding.get('raw', {}).get('regions', [])
            for region in regions:
                for prefix in (['a', 'b'] if len(sources) == 1 else ['a' if index == 0 else 'b']):
                    if not all(prefix + k in region for k in ['x','y','w','h']):
                        continue
                    x, y, w, h = [region[prefix+k] for k in ['x','y','w','h']]
                    draw.rectangle((x*tile.width, y*tile.height, (x+w)*tile.width, (y+h)*tile.height), outline='red' if prefix == 'a' else 'blue', width=max(2,tile.width//150))
            tile.thumbnail((600,600))
            tiles.append(tile)
        if not tiles:
            continue
        evidence = Image.new('RGB', (sum(i.width for i in tiles)+16*(len(tiles)-1), max(i.height for i in tiles)), 'white')
        x = 0
        for tile in tiles:
            evidence.paste(tile, (x,0)); x += tile.width+16
        target = output / 'evidence' / (finding['finding_id'] + '.png')
        target.parent.mkdir(parents=True,exist_ok=True)
        evidence.save(target)
        finding['evidence_images'].append('evidence/' + target.name)


def write_report(output, payload):
    save(output / 'findings.json', payload)
    coverage = payload.get('coverage', {})
    local = coverage.get('image_pair', {})
    panels = coverage.get('panel_pair', {})
    ocr = coverage.get('ocr', {})
    companions = coverage.get('companions', {})
    lines = ['# ZeroWall 科研分析报告', '', f"任务：{payload['trace_id']}", '',
             '检测结果是待人工复核的筛查信号。未检出不代表不存在问题。', '',
             f"发现 {len(payload['findings'])} 项；未完成/跳过 {len(payload['skipped'])} 项。", '',
             '## 覆盖率', '',
             f"跨图局部：已几何复核 {local.get('verified', 0)} / {local.get('possible', 0)} 对；方向 {'/'.join(coverage.get('orientation_tested', []))}；剩余 {local.get('remaining', 0)} 对。", '',
             f"同图面板：已几何复核 {panels.get('verified', 0)} / {panels.get('possible', 0)} 对；剩余 {panels.get('remaining', 0)} 对。", '',
             f"伴随文件：发现 {companions.get('discovered', 0)}、已扫描 {companions.get('scanned', 0)}、失败 {companions.get('failed', 0)}。", '',
             f"OCR：{ocr.get('provider', '未评估')} 完成 {ocr.get('done', 0)} / {ocr.get('needed', 0)}，失败 {ocr.get('failed', 0)}，剩余 {ocr.get('remaining', 0)}。", '']
    if payload.get('partial'):
        lines.extend(['未评估（覆盖或材料不完整；详见下方检测器状态与跳过原因）', ''])
    lines += ['```json', json.dumps(coverage, ensure_ascii=False, indent=2), '```', '']
    lines += ['## 执行与 OCR 来源', '', '```json', json.dumps(payload.get('steps', []), ensure_ascii=False, indent=2), '```', '']
    for finding in payload['findings']:
        lines += [f"## {finding['title']} [{finding['severity']}]", '',
                  f"证据 ID：{finding['finding_id']}", '', finding['location'], '', finding['evidence'], '']
        for image in finding.get('evidence_images', []):
            lines += [f'![区域证据]({image})', '']
    lines += ['## 未执行或不支持的检查', '', '```json', json.dumps(payload['skipped'], ensure_ascii=False, indent=2), '```',
              '', '## 输入与目录汇总', '', '```json', json.dumps({'files': payload['inputs'], 'directories': payload.get('directory_summary', [])}, ensure_ascii=False, indent=2), '```']
    text = '\n'.join(lines) + '\n'
    (output / 'report.md').write_text(text, encoding='utf-8')
    import markdown
    (output / 'report.html').write_text('<!doctype html><html lang="zh"><meta charset="utf-8"><title>ZeroWall 科研分析报告</title><style>body{font:16px system-ui;max-width:1080px;margin:48px auto;padding:24px;color:#223}img{max-width:100%}pre{white-space:pre-wrap;background:#f5f6f8;padding:16px}h2{border-top:1px solid #dde;padding-top:24px}</style>' + markdown.markdown(html.escape(text), extensions=['fenced_code', 'tables']) + '</html>', encoding='utf-8')


def run(args):
    global DEADLINE
    total_deadline = time.monotonic() + args.budget_seconds
    DEADLINE = time.monotonic() + args.budget_seconds / 2
    if args.mode == 'setup':
        return {'ok': False, 'reason': 'Dependencies are managed by the signed ZeroWall Python dependency manifest.',
                'next': 'In ZeroWall Science, check the Python dependency manifest, preview and apply the update, then run doctor again.',
                'cnn': 'The signed dependency manifest installs imagededup; --cnn on enables its candidate recall at scan time.'}
    if args.mode == 'report':
        output = args.workspace.resolve() / args.trace_id / 'output'
        payload = json.loads((output / 'findings.json').read_text(encoding='utf-8'))
        write_report(output, payload)
        return {'ok': True, 'trace_id': args.trace_id, 'report': str(output / 'report.html')}
    check = preflight(args.local_ocr == 'easyocr', args.cnn == 'on')
    if not check['ok']:
        return check
    parsed = parsed_manifests(args.parsed)
    regions = parsed_manifests(args.region_parsed)
    primary_paths = input_paths(args.inputs, args.recursive)
    if not primary_paths:
        raise ValueError('No supported input files were found.')
    if len(primary_paths) > args.limit:
        raise ValueError(f'{len(primary_paths)} inputs exceed --limit {args.limit}; split the task or raise the explicit limit.')
    if args.mode == 'compare' and sum(p.suffix.lower() == '.pdf' for p in primary_paths) < 2:
        raise ValueError('Paper comparison requires at least two PDFs.')
    explicit_data = data_paths(args.data) if args.companion_mode in {'auto', 'explicit'} else []
    auto_associations, auto_discovered = discover_companions([p for p in primary_paths if p.suffix.lower() == '.pdf']) if args.companion_mode == 'auto' else ({}, [])
    explicit_by_pdf = {str(p): explicit_data for p in primary_paths if p.suffix.lower() == '.pdf'}
    companion_associations = {key: sorted(set(values) | set(explicit_by_pdf.get(key, [])), key=str)
                              for key, values in auto_associations.items()}
    for key, values in explicit_by_pdf.items():
        companion_associations.setdefault(key, sorted(set(values), key=str))
    all_companion_files = sorted(set(auto_discovered) | set(explicit_data), key=str)
    excluded_companions = [{'path': str(p), 'reason': 'unsupported companion file type'}
                           for p in explicit_data if p.suffix.lower() not in COMPANION_EXTENSIONS]
    included_companions = [p for p in all_companion_files if p.suffix.lower() in COMPANION_EXTENSIONS]
    paths = sorted(set(primary_paths) | {p for p in included_companions
                   if p.suffix.lower() in IMAGE_EXTENSIONS | {'.pdf'}}, key=str)
    if len(paths) > args.limit:
        raise ValueError(f'{len(paths)} primary and companion files exceed --limit {args.limit}.')
    primary_set = set(primary_paths)
    associated_by_path: dict[str, list[str]] = {}
    for owner, companions in companion_associations.items():
        for companion in companions:
            associated_by_path.setdefault(str(companion), []).append(owner)
    entries = [{'path': str(p), 'sha256': digest(p), 'folder': str(p.parent),
                'role': 'primary' if p in primary_set else 'companion',
                'associated_with': sorted(associated_by_path.get(str(p), []))} for p in paths]
    data_signature = [{'path': str(p), 'sha256': digest(p)} for p in included_companions
                      if p.suffix.lower() in {'.xlsx', '.csv', '.tsv'}]
    dependency_versions = {package: version(package) for package in CORE.values()}
    for package in (['easyocr', 'torchvision'] if args.local_ocr == 'easyocr' else []) + (['imagededup'] if args.cnn == 'on' else []):
        dependency_versions[package] = version(package)
    signature = hashlib.sha256(json.dumps([VERSION, args.mode, entries, args.threshold, args.cross_page_only, args.only_painted, args.batch_size, args.companion_mode, args.cnn, args.local_ocr, parsed, regions, dependency_versions, data_signature], sort_keys=True).encode()).hexdigest()
    trace = args.trace_id or 'zw-' + signature[:20]
    job = args.workspace.resolve() / trace
    output = job / 'output'
    job.mkdir(parents=True, exist_ok=True)
    with task_lock(job):
        manifest = job / 'manifest.json'
        if manifest.exists() and json.loads(manifest.read_text(encoding='utf-8'))['signature'] != signature:
            raise ValueError('Inputs or options changed; choose a new trace ID instead of reusing stale checkpoints.')
        if (output / 'findings.json').exists() and args.resume and not args.rerun and not json.loads((output / 'findings.json').read_text(encoding='utf-8')).get('incomplete_execution', True):
            cached = json.loads((output / 'findings.json').read_text(encoding='utf-8'))
            return {'ok': True, 'trace_id': trace, 'cached': True, 'partial': cached['partial'],
                    'incomplete_execution': False, 'ocr_requests': cached.get('ocr_requests'),
                    'json': str(output / 'findings.json'), 'report': str(output / 'report.html')}
        if args.rerun or not args.resume:
            # Only generated checkpoints inside this validated task directory.
            for checkpoint in job.rglob('*.json'):
                if 'steps' not in checkpoint.relative_to(job).parts:
                    continue
                checkpoint.unlink()
        save(manifest, {'signature': signature, 'version': VERSION, 'inputs': entries,
                        'companions': {'mode': args.companion_mode, 'discovered': [str(p) for p in auto_discovered],
                                       'included': [str(p) for p in included_companions], 'excluded': excluded_companions,
                                       'associations': {key: [str(p) for p in value] for key, value in companion_associations.items()}}})
        output.mkdir(parents=True, exist_ok=True)
        steps, skipped, findings, docs = [], [], [], []
        os.environ.update({'MANUSIFT_CROSSREF_ENABLED': 'false', 'MANUSIFT_OPENALEX_ENABLED': 'false',
                           'MANUSIFT_DAS_RESOLUTION_ENABLED': 'false', 'MANUSIFT_LLM_MAX_CONCURRENCY': '0', 'MANUSIFT_OPENAI_API_KEY': '', 'MANUSIFT_ANTHROPIC_API_KEY': '',
                           'MANUSIFT_BENCHMARK_SKIP_DETECTORS': 'figure_stat_text,figure_grim,figure_table_ocr' if not check['ocr'] else '',
                           'MANUSIFT_WORKSPACE_DIR': str(job / 'papers'), 'MANUSIFT_CROSS_PAPER_IMAGE': '0'})
        os.environ.update({
            'MANUSIFT_CROSS_SIFT_MAX_IMAGES': '0',
            'MANUSIFT_CROSS_SIFT_MAX_FINDINGS': '0',
            'MANUSIFT_CROSS_SIFT_MAX_PAIRS': str(args.max_pairs),
            'MANUSIFT_CROSS_SIFT_RESUME': '1' if args.resume else '0',
            'MANUSIFT_CROSS_SIFT_RUN_ID': uuid.uuid4().hex,
            'MANUSIFT_IMAGE_PAIR_CACHE_DIR': str(job / 'steps' / 'cross-image-pairs'),
            'MANUSIFT_DETECTOR_DEADLINE_MONOTONIC': str(DEADLINE),
            'MANUSIFT_CROSS_DOCUMENT_ONLY': '0',
            'MANUSIFT_CROSS_SIFT_DIFFERENT_SOURCES': '0',
            'MANUSIFT_CNN_ENABLED': '1' if args.cnn == 'on' else '0',
            'EASYOCR_MODULE_PATH': str(Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'ZeroWallScience' / 'models' / 'easyocr'),
        })
        from manusift.contracts import JobState
        import manusift.pipeline as pipeline
        from manusift.pipeline import run_pipeline
        from manusift.workspace import JobPaths
        from manusift.report.finding_calibration import calibrate_findings
        images = [p for p in paths if p.suffix.lower() in IMAGE_EXTENSIONS]
        if images:
            docs.append(image_doc(images, trace, job, skipped))
        from manusift.events import get_bus
        class StepListener:
            name = 'zerowall-execution-status'
            def on_event(self, event):
                if event.type == 'job.step_completed' and event.payload.get('skipped'):
                    skipped.append(dict(event.payload))
        listener = get_bus().subscribe(StepListener())
        for i, path in enumerate(p for p in paths if p.suffix.lower() == '.pdf'):
            try:
                paper_trace = f'paper-{i:03d}'
                paper_paths = JobPaths.for_trace(paper_trace, job / 'papers')
                paper_paths.ensure()
                if args.mode != 'image':
                    # The standalone numeric audit reads the original files.
                    # Avoid copying nested companion trees into a flattened
                    # materials folder where equal basenames can collide.
                    def record_step(result, state):
                        steps.append({'detector': result.detector, 'ok': result.ok, 'error': result.error, 'stats': result.stats, 'source': str(path)})
                    parse_result = parsed.get(str(path))
                    doc = load_mineru(path, paper_trace, job / 'papers', parse_result, skipped, regions) if parse_result else load_pdf(path, paper_trace, job / 'papers', args.only_painted)
                    # Run the screening detectors as separate checkpointed
                    # steps. The full academic-review pipeline also starts
                    # unrelated reference and table stages; wrapping it in one
                    # subprocess discarded all local-pair coverage when that
                    # broad pipeline exceeded its timeout. These detectors
                    # write their own durable pair queues and report accurate
                    # remaining counts so a scan can resume safely.
                    findings.extend(convert_findings(
                        image_detectors(doc, paper_paths.root, steps), doc))
                    if parse_result:
                        save(output / f'paper-{i:03d}-mineru.json', parse_result)
                        shutil.copy2(parse_result['markdown'], output / f'paper-{i:03d}.md')
                    save(output / f'paper-{i:03d}-text.json', [asdict(block) for block in doc.text_blocks])
                else:
                    parse_result = parsed.get(str(path))
                    doc = load_mineru(path, paper_trace, job / 'papers', parse_result, skipped, regions) if parse_result else load_pdf(path, paper_trace, job / 'papers', args.only_painted)
                if doc.metadata.get('zerowall_mineru'):
                    findings.extend(convert_findings(figure_findings(doc), doc))
                    steps.append({'detector': 'mineru-ocr', 'ok': True, 'source': str(path), **doc.metadata['zerowall_mineru']})
                docs.append(doc)
            except Exception as error:
                skipped.append({'source': str(path), 'stage': 'pdf-analysis', 'reason': str(error)})
        get_bus().unsubscribe(listener)
        for index, doc in enumerate(docs):
            is_pdf_doc = doc.source_path.lower().endswith('.pdf')
            if doc.images and (args.mode == 'image' or not is_pdf_doc):
                found = image_detectors(doc, job / f'document-{index}', steps)
                findings.extend(convert_findings(calibrate_findings(found), doc))
        # Shared image collection makes cross-file comparisons real pairwise comparisons.
        all_images = []
        for paper_index, doc in enumerate(docs):
            for image in doc.images:
                source = image.exif.get('zerowall_source', doc.source_path)
                all_images.append(replace(image, page=image.page, index=len(all_images),
                    exif={**image.exif, 'zerowall_source': source,
                          'zerowall_page': image.exif.get('zerowall_page', image.page + 1),
                          'zerowall_index': image.index,
                          'zerowall_xref': image.xref,
                          'zerowall_document': paper_index}))
        if len(all_images) > args.limit:
            raise ValueError(f'{len(all_images)} extracted images exceed --limit {args.limit}.')
        if len(docs) > 1:
            from manusift.contracts import ParsedDoc
            combined = ParsedDoc(trace, str(job), [], all_images, {})
            os.environ['MANUSIFT_CROSS_DOCUMENT_ONLY'] = '1'
            os.environ['MANUSIFT_CROSS_SIFT_DIFFERENT_SOURCES'] = '0'
            found = image_detectors(combined, job / 'cross-document', steps)
            findings.extend(convert_findings(calibrate_findings(found), combined))
            os.environ['MANUSIFT_CROSS_DOCUMENT_ONLY'] = '0'
        cnn = {'enabled': False, 'status': 'disabled', 'candidates_count': 0}
        if args.cnn == 'on':
            from cnn_candidates import recall, verify_candidates
            cnn_inputs = [{'path': image.image_path, 'source_file': image.exif.get('zerowall_source', ''),
                           'page': image.exif.get('zerowall_page', image.page + 1),
                           'image_id': f"{image.exif.get('zerowall_document', 0)}:{image.page}:{image.exif.get('zerowall_index', image.index)}",
                           'width': image.width, 'height': image.height}
                          for image in all_images if image.image_path]
            cnn = recall(cnn_inputs, cache_dir=job / 'steps' / 'cnn-models', deadline=DEADLINE)
            cnn['candidates_count'] = len(cnn['candidates'])
            if cnn['candidates'] and cnn['status'] != 'failed':
                cnn['verification'] = verify_candidates(cnn['candidates'],
                    cache_dir=job / 'steps' / 'cnn-verification', deadline=DEADLINE, trace=trace)
                findings.extend(cnn['verification']['findings'])
                cnn['verification'] = {k: v for k, v in cnn['verification'].items() if k != 'findings'}
            save(output / 'cnn-candidates.json', cnn)
            if cnn['status'] != 'ready' or cnn.get('verification', {}).get('remaining'):
                skipped.append({'detector': 'imagededup-cnn', 'stage': 'cnn',
                                'reason': cnn.get('reason') or 'CNN candidate retrieval or geometry verification incomplete.'})
        # Use unique staged filenames: source files may share basenames across directories/PDFs.
        source_map, staged = {}, []
        for index, image in enumerate(all_images):
            if not image.image_path:
                continue
            target = job / 'inputs/images' / f'{index:05d}.png'
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(image.image_path, target)
            staged.append(str(target))
            source_map[target.name] = {**image_source(image, image.exif['zerowall_source']), 'raster': str(target)}
        report = None
        if staged:
            # Keep a share of each invocation for resumable OCR. Otherwise
            # region batches can exhaust the entire budget on every resume.
            region_budget = max(0, (total_deadline - time.monotonic()) * 0.65)
            report = batch_scan(staged, job, args.threshold, node_scan, save, region_budget, args.batch_size)
            save(output / 'region-evidence.json', report)
            findings.extend(worker_findings(report, source_map, trace, output))
            skipped.extend(report.get('skipped', []))
            steps.append({'detector': 'zerowall-region-adapter', 'ok': not report['partial'], 'progress': report['progress']})
        from local_ocr import scan_isolated as scan_local_ocr
        model_dir = Path(os.environ['EASYOCR_MODULE_PATH'])
        ocr_images = [{'path': image.image_path, 'source_file': image.exif.get('zerowall_source', ''),
                       'page': image.exif.get('zerowall_page', image.page + 1),
                       'image_id': f"{image.exif.get('zerowall_document', 0)}:{image.page}:{image.exif.get('zerowall_index', image.index)}"}
                      for image in all_images if image.image_path]
        ocr = scan_local_ocr(ocr_images, cache_dir=job / 'steps' / 'easyocr', model_dir=model_dir,
                             deadline=total_deadline, enabled=args.local_ocr == 'easyocr')
        save(output / 'local-ocr.json', ocr)
        if ocr['status'] in {'failed', 'incomplete'}:
            skipped.append({'detector': 'easyocr', 'stage': 'local-ocr', 'reason': ocr['reason'],
                            'remaining': ocr['remaining'], 'failed': ocr['failed']})

        from numeric_audit import audit as numeric_audit
        text_blocks = [{'source_file': doc.source_path, 'page': block.page + 1,
                        'bbox': list(block.bbox), 'text': block.text}
                       for doc in docs for block in doc.text_blocks]
        numeric = numeric_audit(included_companions + [p for p in primary_paths if p.suffix.lower() in {'.xlsx', '.csv', '.tsv'}],
                                tables=[table for doc in docs for table in doc.tables],
                                text_blocks=text_blocks, ocr_records=ocr['records'])
        save(output / 'numeric-audit.json', numeric)
        findings.extend(numeric_findings(numeric['findings'], trace))
        for detector, status in numeric['detectors'].items():
            if status == 'not_evaluated':
                skipped.append({'detector': detector, 'stage': 'numeric-audit',
                                'reason': 'Required source values, declared totals, or supported formula operands were unavailable; numeric claim not evaluated.'})
        skipped.extend({'detector': 'numeric-audit', 'source': issue['source_file'],
                        'stage': 'numeric-audit', 'reason': issue['reason']} for issue in numeric['errors'])
        steps.append({'detector': 'numeric-audit', 'ok': not numeric['errors'],
                      'stats': {'detectors': numeric['detectors'], 'numeric_cells': numeric['numeric_cells'],
                                'formula_cells': numeric['formula_cells'], 'cycle_occurrences': numeric['cycle_occurrences']}})
        skipped.extend(step for step in steps if not step['ok'])
        skipped.append({'detector': 'external-reference-verification', 'applicable': False, 'reason': 'Offline run; external references have not been verified.'})
        requests = [item for doc in docs for item in doc.metadata.get('zerowall_ocr_requests', [])]
        save(output / 'ocr-requests.json', requests)
        for doc in docs:
            if args.mode != 'image' and not doc.metadata.get('zerowall_mineru') and args.local_ocr == 'off':
                skipped.append({'detector': 'mineru-ocr', 'source': doc.source_path, 'reason': 'No MinerU parsing artifacts supplied; document/figure OCR was not executed.'})
        if args.cross_page_only:
            findings = [f for f in findings if len(f.get('sources', [])) == 2 and all(s.get('page') is not None for s in f['sources']) and len({(s.get('file'), s.get('page')) for s in f['sources']}) > 1]
        merged = merge_findings(findings)
        render_evidence(merged, output)
        folders = sorted({entry['folder'] for entry in entries})
        summary = [{'folder': folder, 'files': sum(e['folder'] == folder for e in entries),
                    'findings': sum(any(str(Path(src['file']).parent) == folder for src in f['sources']) for f in merged)} for folder in folders]
        scanned_files = {str(image.exif.get('zerowall_source', doc.source_path)) for doc in docs for image in doc.images}
        scanned_files.update(str(doc.source_path) for doc in docs)
        scanned_files.update(source['path'] for source in numeric['sources'] if source['status'] == 'scanned')
        companions = {'discovered': [str(p) for p in all_companion_files],
                      'scanned': [str(p) for p in included_companions if str(p) in scanned_files],
                      'failed': [str(p) for p in included_companions if str(p) not in scanned_files],
                      'excluded': excluded_companions,
                      'associations': {key: [str(p) for p in value] for key, value in companion_associations.items()}}
        coverage = coverage_from_steps(steps, report, ocr, companions, numeric, cnn, len(all_images))
        incomplete = (any(not step['ok'] for step in steps) or ocr['status'] in {'failed', 'incomplete'} or
                      any(coverage[key]['status'] != 'done' for key in ('image_pair', 'panel_pair', 'whole_image') if len(all_images) > 1) or
                      coverage['image_pair']['remaining'] > 0 or coverage['panel_pair']['remaining'] > 0 or
                      coverage['whole_image']['remaining'] > 0 or bool(companions['failed']) or
                      (cnn['enabled'] and (cnn['status'] != 'ready' or cnn.get('verification', {}).get('remaining', 0) > 0)) or
                      any(item.get('stage') in {'image-decode', 'pdf-analysis', 'region-batches', 'region-detection'} for item in skipped))
        payload = {'partial': any(item.get('applicable', True) for item in skipped) or incomplete,
                   'incomplete_execution': incomplete, 'ocr_requests': str(output / 'ocr-requests.json'),
                   'directory_summary': summary, 'coverage': coverage, 'companions': companions,
                   'numeric_audit': {'path': str(output / 'numeric-audit.json'), 'findings': len(numeric['findings'])},
                   'trace_id': trace, 'engine': VERSION, 'inputs': entries, 'steps': steps, 'skipped': skipped,
                   'findings': merged, 'generated_at': time.time()}
        write_report(output, payload)
        return {'ok': True, 'partial': payload['partial'], 'trace_id': trace,
                'incomplete_execution': payload['incomplete_execution'], 'ocr_requests': payload['ocr_requests'], 'findings': len(payload['findings']), 'report': str(output / 'report.html'), 'json': str(output / 'findings.json')}


def main():
    parser = argparse.ArgumentParser(description='ZeroWall scientific integrity analysis')
    parser.add_argument('mode', choices=['image', 'analyze', 'compare', 'report', 'doctor', 'setup'])
    parser.add_argument('inputs', nargs='*')
    parser.add_argument('--workspace', type=Path, default=Path('.zerowall/integrity'))
    parser.add_argument('--trace-id')
    parser.add_argument('--data', nargs='*', default=[])
    parser.add_argument('--parsed', action='append', default=[], help='Original PDF=MinerU parse-manifest.json; repeat per document')
    parser.add_argument('--recursive', action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument('--only-painted', action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument('--cross-page-only', action='store_true')
    parser.add_argument('--threshold', type=int, choices=range(0, 65), default=8)
    parser.add_argument('--limit', type=int, default=10000)
    parser.add_argument('--budget-seconds', type=int, default=480)
    parser.add_argument('--batch-size', type=int, default=16, choices=range(1, 65))
    parser.add_argument('--max-pairs', type=int, default=0, help='Maximum new local-image pairs to compare per invocation; 0 means complete all pairs.')
    parser.add_argument('--resume', action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument('--companion-mode', choices=['auto', 'explicit', 'none'], default='auto')
    parser.add_argument('--cnn', choices=['off', 'on'], default='off')
    parser.add_argument('--local-ocr', choices=['easyocr', 'off'], default='easyocr')
    parser.add_argument('--region-parsed', action='append', default=[], help='Extracted figure image=MinerU manifest; repeat per image')
    parser.add_argument('--rerun', action='store_true')
    args = parser.parse_args()
    if args.budget_seconds < 1 or args.limit < 1 or args.max_pairs < 0:
        parser.error('Budget and limit must be positive; max-pairs cannot be negative')
    if args.trace_id and not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', args.trace_id):
        parser.error('Invalid trace ID')
    if args.mode == 'report' and not args.trace_id:
        parser.error('report requires --trace-id')
    try:
        value = preflight() if args.mode == 'doctor' else run(args)
    except Exception as error:
        value = {'ok': False, 'error': str(error)}
    print(json.dumps(value, ensure_ascii=False))
    return 0 if value.get('ok') else 1


if __name__ == '__main__':
    raise SystemExit(main())
