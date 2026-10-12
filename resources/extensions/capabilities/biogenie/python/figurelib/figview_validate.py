"""Schema/relational validator in the existing figurelib environment.

CLI: python -m figurelib.figview_validate MANIFEST.

Only the JSON Schema keywords present in the shipped v1 schemas are evaluated.
Reads bounded local bundle files; recipe/script references are hashed, never imported.
"""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path, PurePosixPath
import re
import struct
import sys

from .figview import (FigviewError, MAX_JSON_BYTES, MAX_PNG_BYTES, MAX_POINTS,
                      canonical, sha256)


def _error(path, message):
    raise FigviewError(f'{path}: {message}')


def validate_schema(value, schema, path='$'):
    """Validate the closed v1 schema dialect (including oneOf and finite numbers)."""
    if 'oneOf' in schema:
        valid = 0
        for candidate in schema['oneOf']:
            try:
                validate_schema(value, candidate, path)
                valid += 1
            except FigviewError:
                pass
        if valid != 1:
            _error(path, 'oneOf requires exactly one valid alternative')
    if 'not' in schema:
        try:
            validate_schema(value, schema['not'], path)
        except FigviewError:
            pass
        else:
            _error(path, 'matches prohibited type')
    checks = {'object': lambda: type(value) is dict, 'array': lambda: type(value) is list,
              'string': lambda: type(value) is str, 'integer': lambda: type(value) is int,
              'number': lambda: type(value) in (int, float) and math.isfinite(value),
              'boolean': lambda: type(value) is bool, 'null': lambda: value is None}
    if 'type' in schema and not checks[schema['type']]():
        _error(path, f"expected {schema['type']}")
    if 'const' in schema and (type(value) is not type(schema['const']) or value != schema['const']):
        _error(path, 'incorrect constant')
    if 'enum' in schema and value not in schema['enum']:
        _error(path, 'value outside enum')
    if type(value) is dict:
        properties = schema.get('properties', {})
        for k in schema.get('required', []):
            if k not in value:
                _error(path, f'missing required key {k}')
        extra = schema.get('additionalProperties', True)
        for k, v in value.items():
            if k not in properties and extra is False:
                _error(path, f'unknown key {k}')
            validate_schema(v, properties.get(k, extra if type(extra) is dict else {}), f'{path}.{k}')
    if type(value) is list:
        if len(value) < schema.get('minItems', 0) or len(value) > schema.get('maxItems', math.inf):
            _error(path, 'array length outside bounds')
        if schema.get('uniqueItems') and len({canonical(v) for v in value}) != len(value):
            _error(path, 'duplicate items')
        for i, v in enumerate(value):
            validate_schema(v, schema.get('items', {}), f'{path}[{i}]')
    if type(value) is str:
        if len(value) < schema.get('minLength', 0) or ('pattern' in schema and not re.search(schema['pattern'], value)):
            _error(path, 'invalid string')
    if type(value) in (int, float):
        if not math.isfinite(value) or value < schema.get('minimum', -math.inf) or value <= schema.get('exclusiveMinimum', -math.inf):
            _error(path, 'nonfinite or below numeric bound')


def _load(data):
    def reject(v):
        raise FigviewError(f'Forbidden JSON number {v}')
    def pairs(items):
        d = {}
        for k, v in items:
            if k in d:
                raise FigviewError(f'Duplicate JSON key {k}')
            d[k] = v
        return d
    try:
        value = json.loads(data.decode('utf-8'), parse_constant=reject, object_pairs_hook=pairs)
        canonical(value) # Also catches overflow such as 1e999 in arbitrary metadata.
        return value
    except (UnicodeError, ValueError, TypeError, RecursionError) as e:
        raise FigviewError(f'Invalid finite UTF-8 JSON: {e}') from e


def _read(path, cap):
    if path.is_symlink() or path.stat().st_size > cap:
        raise FigviewError(f'File is a link or exceeds budget: {path.name}; reduce data/DPI or split bundle.')
    with path.open('rb') as stream:
        data = stream.read(cap + 1)
    if len(data) > cap:
        raise FigviewError('File grew beyond budget while reading.')
    return data


def _resolve(root, path):
    # References are literal portable relative paths, never URLs or percent-decoded.
    if (not isinstance(path, str) or not path or '\\' in path or ':' in path or
            '%' in path or '\x00' in path or PurePosixPath(path).is_absolute() or
            any(p in ('', '.', '..') for p in path.split('/'))):
        raise FigviewError(f'Unsafe bundle-relative path: {path!r}')
    candidate = root / path
    current = root
    for part in path.split('/'):
        current = current / part
        if current.is_symlink() or current.resolve() != current.absolute():
            raise FigviewError('Symlink/junction references are forbidden.')
    if not candidate.resolve().is_relative_to(root.resolve()) or not candidate.is_file():
        raise FigviewError('Reference escapes bundle or is not a file.')
    return candidate


def _unique(items, key):
    values = [v[key] for v in items]
    if len(set(values)) != len(values):
        raise FigviewError(f'Duplicate {key}')
    return {v[key]: v for v in items}


def data_to_pixel(axis, xy, renderer_height):
    """Reference consumer transform; PNG coordinates use the captured float height."""
    import numpy as np
    v = np.array(xy, dtype=float)
    for i, name in enumerate(('xscale', 'yscale')):
        scale = axis[name]
        if scale['name'] == 'log':
            if v[i] <= 0:
                raise FigviewError('Nonpositive log coordinate')
            v[i] = math.log(v[i], scale['base'])
    q = np.asarray(axis['affine']) @ [*v, 1]
    return np.array([q[0], renderer_height - q[1]])


def pixel_to_data(axis, pixel, renderer_height):
    import numpy as np
    v = np.linalg.solve(np.asarray(axis['affine']), [pixel[0], renderer_height - pixel[1], 1])[:2]
    for i, name in enumerate(('xscale', 'yscale')):
        scale = axis[name]
        if scale['name'] == 'log':
            v[i] = scale['base'] ** v[i]
    return v


def hit_candidates(hits, pixel, radius=0):
    """Image-space reference hit selection; consumer converts CSS radius through V."""
    matches = []
    for hit in hits['elements']:
        clip = hit['clip']
        if clip and not (clip[0] <= pixel[0] <= clip[2] and clip[1] <= pixel[1] <= clip[3]):
            continue
        center = hit['geometry']['center']
        distance = math.hypot(center[0] - pixel[0], center[1] - pixel[1])
        if distance <= hit['geometry']['radius'] + radius:
            matches.append((hit, distance))
    matches.sort(key=lambda h: (-h[0]['zorder'], -h[0]['draw_order'], -h[0]['point_order'], h[1], h[0]['element_id']))
    return [h for h, _ in matches]


def validate_bundle(manifest_path):
    entry = Path(manifest_path).absolute()
    if entry.is_symlink() or entry.parent.resolve() != entry.parent:
        raise FigviewError('Manifest parent must be canonical without symlink/junction aliases.')
    root = entry.parent
    schema_dir = Path(__file__).parent / 'assets'
    json_total = 0
    documents = {}
    def document(name, path, raw=None):
        nonlocal json_total
        data = _read(path, MAX_JSON_BYTES) if raw is None else raw
        value = _load(data)
        # Budget both wire UTF-8 bytes and canonical parsed JSON bytes, summed across files.
        json_total += max(len(data), len(canonical(value)))
        if json_total > MAX_JSON_BYTES:
            raise FigviewError('JSON exceeds combined 8 MiB budget; filter, aggregate or split bundle.')
        validate_schema(value, _load((schema_dir / f'{name}.schema.v1.json').read_bytes()))
        documents[name] = value
        return value
    manifest = document('figview', entry)
    revision_payload = {k: v for k, v in manifest.items() if k != 'revision'}
    if manifest['revision'] != sha256(canonical(revision_payload)):
        raise FigviewError('Immutable revision digest mismatch.')
    used = {entry.name}
    for key in ('image', 'data', 'hitmap'):
        ref = manifest[key]
        if ref is None:
            continue
        if ref['path'] in used:
            raise FigviewError('Artifact references must be distinct.')
        used.add(ref['path'])
        path = _resolve(root, ref['path'])
        raw = _read(path, MAX_PNG_BYTES if key == 'image' else MAX_JSON_BYTES)
        if sha256(raw) != ref['sha256']:
            raise FigviewError(f'{key} SHA-256 mismatch.')
        if key == 'image':
            if len(raw) < 24 or raw[:8] != b'\x89PNG\r\n\x1a\n' or raw[12:16] != b'IHDR':
                raise FigviewError('Image must be PNG with IHDR.')
            if struct.unpack('>II', raw[16:24]) != (ref['width'], ref['height']):
                raise FigviewError('PNG dimensions mismatch.')
        else:
            document('rows' if key == 'data' else 'hits', path, raw)
    script = manifest['redraw'].get('script')
    if script:
        if script['path'] in used:
            raise FigviewError('Script must be a distinct artifact.')
        if sha256(_read(_resolve(root, script['path']), MAX_JSON_BYTES)) != script['sha256']:
            raise FigviewError('Script SHA-256 mismatch.')
    if manifest['recipe']['recipe_id'] != manifest['redraw']['recipe_id']:
        raise FigviewError('Recipe identity mismatch.')
    caps = manifest['capabilities']
    if caps['request_redraw'] != bool(manifest['redraw']['recipe_id'] or script):
        raise FigviewError('Redraw capability contradicts provenance.')
    rows = documents.get('rows')
    hits = documents.get('hits')
    source = manifest['source']
    if source['kind'] == 'file' and not all(k in source for k in ('file_sha256', 'label', 'snapshot_sha256')):
        raise FigviewError('File source requires hash, label and snapshot hash.')
    if bool(rows) != (source['kind'] != 'none'):
        raise FigviewError('Source identity contradicts snapshot presence.')
    row_map = {}
    if rows:
        columns = _unique(rows['columns'], 'name')
        row_map = _unique(rows['rows'], 'row_id')
        occurrences = {}
        for row in rows['rows']:
            key = sha256(canonical(row['semantic_id']))
            expected = occurrences.get(key, 0)
            if row['occurrence'] != expected or row['row_id'] != f'{key}:{expected}':
                raise FigviewError('Unstable semantic row_id/occurrence.')
            occurrences[key] = expected + 1
            if set(row['values']) != set(columns):
                raise FigviewError('Raw row does not match column schema.')
            for name, value in row['values'].items():
                kind = columns[name]['type']
                if isinstance(value, dict) and 'missing' in value:
                    continue
                valid = {'string': type(value) is str, 'boolean': type(value) is bool,
                         'integer': type(value) is int or isinstance(value, dict) and 'integer' in value,
                         'number': type(value) in (int, float),
                         'datetime': isinstance(value, dict) and 'datetime' in value,
                         'categorical': value in columns[name].get('categories', [])}
                if not valid[kind]:
                    raise FigviewError(f'Type mismatch for column {name}')
        snapshot_hash = sha256(canonical({'columns': rows['columns'], 'rows': rows['rows']}))
        if rows['source'] != manifest['source'] or rows['source'].get('snapshot_sha256') != snapshot_hash:
            raise FigviewError('Source snapshot consistency mismatch.')
    max_error = 0.0
    if hits:
        if not rows:
            raise FigviewError('Hitmap requires source rows.')
        axes = _unique(hits['axes'], 'axes_id')
        series = _unique(hits['series'], 'series_id')
        _unique(hits['elements'] + hits['excluded'], 'element_id')
        if len(hits['elements']) > MAX_POINTS:
            raise FigviewError('Point budget exceeded; filter, aggregate or split.')
        if (int(hits['renderer_width']), int(hits['renderer_height'])) != (manifest['image']['width'], manifest['image']['height']) or hits['dpi'] != manifest['image']['dpi']:
            raise FigviewError('Hitmap renderer/image dimensions or DPI mismatch.')
        for axis in axes.values():
            import numpy as np
            matrix = np.asarray(axis['affine'])
            if list(matrix[2]) != [0, 0, 1] or abs(np.linalg.det(matrix)) < 1e-15:
                raise FigviewError('Invalid/singular affine matrix.')
            if axis['bbox'][0] >= axis['bbox'][2] or axis['bbox'][1] >= axis['bbox'][3]:
                raise FigviewError('Invalid axes bounding box.')
            if axis['inverted_x'] != (axis['xlim'][0] > axis['xlim'][1]) or axis['inverted_y'] != (axis['ylim'][0] > axis['ylim'][1]):
                raise FigviewError('Axes inversion/limits mismatch.')
            for name in ('xscale', 'yscale'):
                scale = axis[name]
                if scale['name'] == 'log' and (scale['base'] is None or scale['base'] <= 0 or scale['base'] == 1 or scale['nonpositive'] != 'excluded'):
                    raise FigviewError('Invalid logarithmic scale metadata.')
                if scale['name'] == 'linear' and (scale['base'] is not None or scale['nonpositive'] is not None):
                    raise FigviewError('Invalid linear scale metadata.')
        for s in series.values():
            if s['axes_id'] not in axes or s['offset_affine'] != axes[s['axes_id']]['affine']:
                raise FigviewError('Series transform/axes mismatch.')
        for e in hits['elements'] + hits['excluded']:
            if any(r not in row_map for r in e['row_ids']):
                raise FigviewError('Dangling row reference.')
        for e in hits['elements']:
            if e['clip'] and (e['clip'][0] >= e['clip'][2] or e['clip'][1] >= e['clip'][3]):
                raise FigviewError('Invalid rectangular clip.')
            if e['axes_id'] not in axes or e['series_id'] not in series or series[e['series_id']]['axes_id'] != e['axes_id']:
                raise FigviewError('Dangling axes/series reference.')
            a = axes[e['axes_id']]
            predicted = data_to_pixel(a, e['plotted_values'], hits['renderer_height'])
            error = math.dist(predicted, e['geometry']['center'])
            restored = pixel_to_data(a, e['geometry']['center'], hits['renderer_height'])
            reverse_error = math.dist(data_to_pixel(a, restored, hits['renderer_height']), e['geometry']['center'])
            max_error = max(max_error, error, reverse_error)
        if max_error > 0.01:
            raise FigviewError(f'Serialized coordinate inconsistency: {max_error} px.')
    inspect = 'points' if hits and hits['elements'] else 'preview'
    if caps['inspect'] != inspect or (inspect == 'points' and caps['reason'] is not None) or (inspect == 'preview' and not caps['reason']):
        raise FigviewError('Inspect capability contradicts bundle contents.')
    return {'valid': True, 'schema_version': 1, 'revision': manifest['revision'],
            'rows': len(row_map), 'points': len(hits['elements']) if hits else 0,
            'json_bytes': json_total, 'max_transform_error_px': max_error, 'capabilities': caps}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest')
    args = parser.parse_args()
    try:
        print(json.dumps(validate_bundle(args.manifest), ensure_ascii=False, sort_keys=True))
    except (FigviewError, OSError, KeyError, OverflowError, ArithmeticError) as e:
        print(f'figview invalid: {e}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
