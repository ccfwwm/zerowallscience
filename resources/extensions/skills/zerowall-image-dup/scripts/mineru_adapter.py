"""MinerU v1/v2 ingestion; OCR observations keep page, region and source provenance."""
import json
import re
from pathlib import Path


def plain(value):
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return ' '.join(plain(item) for item in value)
    if isinstance(value, dict):
        return plain(value.get('content', value.get('item_content', '')))
    return ''


def normalize(value):
    if not isinstance(value, list):
        raise ValueError('MinerU content list must be an array')
    pages = any(isinstance(item, list) for item in value)
    rows = []
    for page_idx, page in enumerate(value):
        for raw in page if pages else [page]:
            if not isinstance(raw, dict):
                raise ValueError('Invalid MinerU content block')
            row = {**raw, 'page_idx': raw.get('page_idx', page_idx if pages else -1)}
            if pages:
                c = raw.get('content', {})
                row.update(text=plain(c.get(raw['type'] + '_content', c.get('text', c.get('content', '')))),
                    img_path=c.get('image_source', {}).get('path', c.get('img_path')),
                    table_body=c.get('html'), image_caption=plain(c.get('image_caption', c.get('chart_caption', ''))),
                    table_caption=plain(c.get('table_caption', '')))
                if raw['type'] == 'list':
                    row['text'] = plain(c.get('list_items', c.get('list_content', '')))
            rows.append(row)
    return rows


def grid_from_html(value):
    from lxml import html
    table = html.fromstring(value)
    cells = {}
    for y, tr in enumerate(table.xpath('.//tr')):
        x = 0
        for cell in tr.xpath('./th|./td'):
            while (y, x) in cells:
                x += 1
            rs, cs = min(1000, int(cell.get('rowspan', '1'))), min(1000, int(cell.get('colspan', '1')))
            for dy in range(rs):
                for dx in range(cs):
                    cells[y + dy, x + dx] = cell.text_content().strip()
            x += cs
    if not cells:
        return []
    return [[cells.get((y, x), '') for x in range(max(c[1] for c in cells)+1)] for y in range(max(c[0] for c in cells)+1)]


def extracted_tables(rows, source, skipped):
    from manusift.contracts import ExtractedTable
    result = []
    for row in rows:
        if not row.get('table_body'):
            continue
        try:
            grid = grid_from_html(row['table_body'])
            if len(grid) < 2:
                continue
            box = row.get('bbox')
            result.append(ExtractedTable(table_id=f'mineru-{len(result):04d}', source_kind='ocr', source_path=str(source), sheet_name='',
                source_index=row.get('page_idx', -1), headers=grid[0], rows=grid[1:],
                fig_name=plain(row.get('table_caption', '')),
                bbox=dict(zip(['left', 'top', 'right', 'bottom'], box)) if box else None))
        except Exception as error:
            skipped.append({'stage': 'mineru-table', 'source': str(source), 'reason': str(error)})
    return result


def region_records(rows, manifest, mappings, source, skipped):
    """A paper caption is not figure-body OCR. Only use supplied region OCR/body text."""
    root = Path(manifest['markdown']).parent
    requests, recognized = [], []
    for row in rows:
        if not row.get('img_path') or row.get('type') == 'table':
            continue
        image = (root / row['img_path']).resolve()
        if str(image) not in {str(Path(p).resolve()) for p in manifest['images']}:
            continue
        blocks = []
        if str(image) in mappings:
            region = mappings[str(image)]
            if region.get('contentList'):
                blocks = normalize(json.loads(Path(region['contentList']).read_text(encoding='utf-8')))
            if not blocks:
                blocks = [{'text': Path(region['markdown']).read_text(encoding='utf-8')}]
        elif row.get('text'):
            blocks = [row]
        if not blocks:
            requests.append({'image': str(image), 'source': str(source), 'page': row.get('page_idx', -1)+1,
                'bbox': row.get('bbox'), 'reason': 'MinerU returned a figure image without figure-body text; parse this image with isOcr=true.'})
            continue
        for block in blocks:
            recognized.append({**block, 'page_idx': row.get('page_idx', -1), 'bbox': row.get('bbox'),
                'region_bbox': block.get('bbox'), 'image': str(image), 'source': str(source)})
    for request in requests:
        skipped.append({'stage': 'figure-ocr', **request})
    return recognized, requests


def figure_findings(doc):
    from manusift.contracts import Finding
    from manusift.detectors.figure_stat_text import _looks_like_stat
    from manusift.detectors.figure_grim import _grim_check
    findings = []
    for row in doc.metadata.get('zerowall_figure_ocr', []):
        text = row.get('text', '')
        location = f"{doc.source_path} p{row.get('page_idx', -1)+1} bbox={row.get('bbox')}"
        raw = {'kind': 'mineru_figure_ocr', 'page': row.get('page_idx', -1)+1, 'bbox': row.get('bbox'),
            'region_bbox': row.get('region_bbox'), 'image': row.get('image'), 'provider': 'mineru', 'text': text}
        if _looks_like_stat(text):
            findings.append(Finding.make(trace_id=doc.trace_id, detector='mineru_figure_stat_text', severity='low',
                title='Statistical descriptor recognised in figure body', evidence=text, location=location, raw=raw))
        # Only test a percentage when its region supplies an explicit sample size.
        n = re.search(r'\b[nN]\s*=\s*(\d+)\b', text)
        if n and int(n[1]) > 0:
            for percentage in re.findall(r'(\d+(?:\.\d+)?)\s*%', text):
                value = float(percentage)
                if 0 <= value <= 100 and _grim_check(value, int(n[1]), [int(n[1])]) is not None:
                    findings.append(Finding.make(trace_id=doc.trace_id, detector='mineru_figure_grim', severity='medium',
                        title='Percentage and explicit sample size require review', evidence=text, location=location, raw=raw))
    return findings
