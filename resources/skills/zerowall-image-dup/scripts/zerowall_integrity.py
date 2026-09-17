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

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'vendor'))
VERSION = '2622d024ad27791196eb86bad51a9fe7bb0bb268+zerowall.3'
IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp', '.gif', '.webp', '.avif', '.heic', '.heif', '.jp2', '.j2k', '.svg'}
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
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temp.replace(path)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def preflight():
    missing, errors = [], {}
    for module, package in CORE.items():
        try:
            __import__(module)
            version(package)
        except Exception as error:
            missing.append(package)
            errors[package] = str(error)

    return {'ok': not missing, 'missing': missing, 'errors': errors, 'python': sys.executable, 'engine': VERSION,
            'ocr': importlib.util.find_spec('easyocr') is not None,
            'node': os.environ.get('ZEROWALL_NODE') or shutil.which('node'),
            'worker': str(worker_path())}


def worker_path():
    configured = os.environ.get('ZEROWALL_INTEGRITY_WORKER')
    if configured:
        return Path(configured)
    for parent in ROOT.parents:
        candidate = parent / 'packages/integrity-runtime/hash-worker.mjs'
        if candidate.is_file():
            return candidate
    raise RuntimeError('ZeroWall image worker is unavailable; repair the application runtime.')


def node_scan(config):
    node = os.environ.get('ZEROWALL_NODE') or shutil.which('node')
    if not node:
        raise RuntimeError('ZeroWall Node runtime is unavailable.')
    env = {k: v for k, v in os.environ.items() if not re.search('KEY|SECRET|TOKEN|PASSWORD', k, re.I)}
    env['ELECTRON_RUN_AS_NODE'] = '1'
    result = subprocess.run([node, str(worker_path()), '--stdin'], input=json.dumps(config),
                            text=True, encoding='utf-8', capture_output=True, timeout=300,
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


def image_detectors(doc, job, steps):
    from manusift.detectors import load_detector_class
    from manusift.checkpoint import read_step_silent, write_step
    names = ['ImageDuplicateDetector', 'ImageForensicsDetector', 'SiftCopyMoveDetector']
    if Path(doc.source_path).suffix.lower() == '.pdf':
        names.append('PanelDuplicateDetector')
    findings = []
    for name in names:
        try:
            cls = load_detector_class(name)
            checkpoint = job / 'steps' / f'{cls.name}.json'
            result = read_step_silent(checkpoint)
            if result is None or not result.ok:
                result = cls().run(doc)
                write_step(checkpoint, result)
            steps.append({'detector': result.detector, 'ok': result.ok, 'error': result.error})
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


def load_mineru(path, trace, workspace, manifest, skipped):
    from manusift.contracts import ParsedDoc, TextBlock
    records = json.loads(Path(manifest['contentList']).read_text(encoding='utf-8')) if manifest.get('contentList') else []
    if not isinstance(records, list):
        raise ValueError('MinerU content list must be an array')
    text = [TextBlock(int(row.get('page_idx', -1)), tuple(row.get('bbox', [0, 0, 0, 0])), str(row['text']))
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
    return replace(base, text_blocks=text, images=images)


def pair_sources(raw, doc):
    sources = []
    for key in ['image_a', 'image_b']:
        ref = raw.get(key)
        if not isinstance(ref, dict):
            continue
        record = next((i for i in doc.images if i.page == ref.get('page') and i.index == ref.get('index')), None)
        if record:
            sources.append({'file': record.exif.get('zerowall_source', doc.source_path),
                            'page': record.exif.get('zerowall_page', record.page + 1) if record.exif.get('zerowall_source', doc.source_path).lower().endswith('.pdf') else None, 'image': record.exif.get('zerowall_index', record.index),
                            'raster': record.image_path, 'pdf_rects': record.exif.get('zerowall_pdf_rects', [])})
    if not sources and 'image_index' in raw:
        index = raw['image_index']
        if isinstance(index, int) and 0 <= index < len(doc.images):
            record = doc.images[index]
            sources.append(image_source(record, doc.source_path))
    if not sources and 'page_a' in raw and 'page_b' in raw:
        sources = [{'file': doc.source_path, 'page': raw[key], 'panel': raw.get('panel_' + key[-1])}
                   for key in ['page_a', 'page_b']]
    if not sources:
        sources = [{'file': doc.source_path, 'location': raw.get('page', 'document')}]
    return sources


def image_source(image, fallback):
    source = image.exif.get('zerowall_source', fallback)
    return {'file': source, 'page': image.exif.get('zerowall_page', image.page + 1) if source.lower().endswith('.pdf') else None,
            'image': image.exif.get('zerowall_index', image.index), 'raster': image.image_path, 'pdf_rects': image.exif.get('zerowall_pdf_rects', [])}


def convert_findings(findings, doc):
    result = []
    for finding in findings:
        item = asdict(finding)
        item['sources'] = pair_sources(finding.raw, doc)
        item['engine'] = 'scientific-core'
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
    lines = ['# ZeroWall 科研分析报告', '', f"任务：{payload['trace_id']}", '',
             '检测结果是待人工复核的筛查信号。未检出不代表不存在问题。', '',
             f"发现 {len(payload['findings'])} 项；未完成/跳过 {len(payload['skipped'])} 项。", '']
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
    if args.mode == 'setup':
        overlay = os.environ.get('ZEROWALL_PYTHON_OVERLAY')
        if not overlay:
            raise RuntimeError('Use the ZeroWall managed python tool to install detector dependencies.')
        result = subprocess.run([sys.executable, '-m', 'pip', 'install', '--disable-pip-version-check',
            '--target', overlay, '--upgrade', '-r', str(ROOT / 'requirements.lock')],
            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=540,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        return {'ok': result.returncode == 0, 'output': result.stdout[-3000:], 'error': result.stderr[-3000:],
                'next': 'Run doctor in a new python tool call.'}
    if args.mode == 'report':
        output = args.workspace.resolve() / args.trace_id / 'output'
        payload = json.loads((output / 'findings.json').read_text(encoding='utf-8'))
        write_report(output, payload)
        return {'ok': True, 'trace_id': args.trace_id, 'report': str(output / 'report.html')}
    check = preflight()
    if not check['ok']:
        return check
    parsed = parsed_manifests(args.parsed)
    paths = input_paths(args.inputs, args.recursive)
    if not paths:
        raise ValueError('No supported input files were found.')
    if len(paths) > args.limit:
        raise ValueError(f'{len(paths)} inputs exceed --limit {args.limit}; split the task or raise the explicit limit.')
    if args.mode == 'compare' and sum(p.suffix.lower() == '.pdf' for p in paths) < 2:
        raise ValueError('Paper comparison requires at least two PDFs.')
    data_paths = sorted({p.resolve() for value in args.data for p in ([Path(value)] if Path(value).is_file() else Path(value).rglob('*')) if p.is_file()}, key=str)
    entries = [{'path': str(p), 'sha256': digest(p), 'folder': str(p.parent)} for p in paths]
    signature = hashlib.sha256(json.dumps([VERSION, args.mode, entries, args.threshold, args.cross_page_only, args.only_painted, parsed, {package: version(package) for package in CORE.values()}, [{'path': str(Path(d).resolve(strict=True)), 'sha256': digest(Path(d))} for d in data_paths]], sort_keys=True).encode()).hexdigest()
    trace = args.trace_id or 'zw-' + signature[:20]
    job = args.workspace.resolve() / trace
    output = job / 'output'
    job.mkdir(parents=True, exist_ok=True)
    with task_lock(job):
        manifest = job / 'manifest.json'
        if manifest.exists() and json.loads(manifest.read_text(encoding='utf-8'))['signature'] != signature:
            raise ValueError('Inputs or options changed; choose a new trace ID instead of reusing stale checkpoints.')
        if (output / 'findings.json').exists() and not args.rerun and not json.loads((output / 'findings.json').read_text(encoding='utf-8')).get('partial'):
            return {'ok': True, 'trace_id': trace, 'cached': True, 'report': str(output / 'report.html')}
        if args.rerun:
            # Only generated checkpoints inside this validated task directory.
            for checkpoint in job.rglob('steps/*.json'):
                checkpoint.unlink()
        save(manifest, {'signature': signature, 'version': VERSION, 'inputs': entries})
        output.mkdir(parents=True, exist_ok=True)
        steps, skipped, findings, docs = [], [], [], []
        os.environ.update({'MANUSIFT_CROSSREF_ENABLED': 'false', 'MANUSIFT_OPENALEX_ENABLED': 'false',
                           'MANUSIFT_DAS_RESOLUTION_ENABLED': 'false', 'MANUSIFT_LLM_MAX_CONCURRENCY': '0', 'MANUSIFT_OPENAI_API_KEY': '', 'MANUSIFT_ANTHROPIC_API_KEY': '',
                           'MANUSIFT_BENCHMARK_SKIP_DETECTORS': 'figure_stat_text,figure_grim,figure_table_ocr' if not check['ocr'] else '',
                           'MANUSIFT_WORKSPACE_DIR': str(job / 'papers'), 'MANUSIFT_CROSS_PAPER_IMAGE': '0'})
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
                    for data in args.data:
                        from manusift.cli import _copy_companions
                        _copy_companions(paper_paths.materials_dir, [Path(data)])
                    def record_step(result, state):
                        steps.append({'detector': result.detector, 'ok': result.ok, 'error': result.error, 'stats': result.stats, 'source': str(path)})
                    parse_result = parsed.get(str(path))
                    doc = load_mineru(path, paper_trace, job / 'papers', parse_result, skipped) if parse_result else load_pdf(path, paper_trace, job / 'papers', args.only_painted)
                    original_parse = pipeline._parse_pdf
                    try:
                        # Adapter scoped to this sequential document; detector workers receive the frozen result.
                        pipeline._parse_pdf = lambda *a, **kw: doc
                        result = run_pipeline(path, paper_paths, JobState(trace_id=paper_trace, status='queued', source_filename=path.name), on_step_complete=record_step)
                    finally:
                        pipeline._parse_pdf = original_parse
                    if parse_result:
                        save(output / f'paper-{i:03d}-mineru.json', parse_result)
                        shutil.copy2(parse_result['markdown'], output / f'paper-{i:03d}.md')
                    findings.extend(convert_findings(result.findings, doc))
                    save(output / f'paper-{i:03d}-text.json', [asdict(block) for block in doc.text_blocks])
                else:
                    doc = load_pdf(path, paper_trace, job / 'papers', args.only_painted)
                docs.append(doc)
            except Exception as error:
                skipped.append({'source': str(path), 'stage': 'pdf-analysis', 'reason': str(error)})
        get_bus().unsubscribe(listener)
        for index, doc in enumerate(docs):
            if args.mode == 'image' or not doc.source_path.lower().endswith('.pdf'):
                found = image_detectors(doc, job / f'document-{index}', steps)
                findings.extend(convert_findings(calibrate_findings(found), doc))
        # Shared image collection makes cross-paper comparisons real pairwise comparisons.
        all_images = []
        for paper_index, doc in enumerate(docs):
            for image in doc.images:
                all_images.append(replace(image, page=paper_index, index=len(all_images),
                    exif={**image.exif, 'zerowall_source': image.exif.get('zerowall_source', doc.source_path), 'zerowall_page': image.exif.get('zerowall_page', image.page + 1), 'zerowall_index': image.index}))
        if len(all_images) > args.limit:
            raise ValueError(f'{len(all_images)} extracted images exceed --limit {args.limit}.')
        if len(docs) > 1:
            from manusift.contracts import ParsedDoc
            combined = ParsedDoc(trace, str(job), [], all_images, {})
            found = image_detectors(combined, job / 'cross-document', steps)
            findings.extend(convert_findings(calibrate_findings(found), combined))
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
        if staged:
            try:
                report = node_scan({'paths': staged, 'threshold': args.threshold, 'limit': len(staged), 'thumb': 180, 'copyMove': True, 'crossImage': True})
                save(output / 'region-evidence.json', report)
                findings.extend(worker_findings(report, source_map, trace, output))
                skipped.extend(report.get('skipped', []))
                steps.append({'detector': 'zerowall-region-adapter', 'ok': True})
            except Exception as error:
                steps.append({'detector': 'zerowall-region-adapter', 'ok': False, 'error': str(error)})
        skipped.extend(step for step in steps if not step['ok'])
        skipped.append({'detector': 'external-reference-verification', 'reason': 'Offline run; external references have not been verified.'})
        if not check['ocr']:
            for name in ['figure_stat_text', 'figure_grim', 'figure_table_ocr']:
                skipped.append({'detector': name, 'reason': 'OCR dependency/models unavailable; not executed.'})
            skipped.append({'detector': 'ocr', 'reason': 'Optional EasyOCR models are not installed; image-table OCR checks were not completed.'})
        if args.cross_page_only:
            findings = [f for f in findings if len(f.get('sources', [])) == 2 and all(s.get('page') is not None for s in f['sources']) and len({(s.get('file'), s.get('page')) for s in f['sources']}) > 1]
        merged = merge_findings(findings)
        render_evidence(merged, output)
        folders = sorted({entry['folder'] for entry in entries})
        summary = [{'folder': folder, 'files': sum(e['folder'] == folder for e in entries),
                    'findings': sum(any(str(Path(src['file']).parent) == folder for src in f['sources']) for f in merged)} for folder in folders]
        payload = {'partial': any(not step['ok'] for step in steps) or any('stage' in item for item in skipped), 'directory_summary': summary, 'trace_id': trace, 'engine': VERSION, 'inputs': entries, 'steps': steps, 'skipped': skipped,
                   'findings': merged, 'generated_at': time.time()}
        write_report(output, payload)
        return {'ok': True, 'partial': payload['partial'], 'trace_id': trace,
                'findings': len(payload['findings']), 'report': str(output / 'report.html'), 'json': str(output / 'findings.json')}


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
    parser.add_argument('--limit', type=int, default=300)
    parser.add_argument('--rerun', action='store_true')
    args = parser.parse_args()
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
