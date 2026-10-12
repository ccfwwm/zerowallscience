"""Explicit point/table bindings and immutable sidecar v1 export (no code execution)."""
from __future__ import annotations

import copy
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import re
import shutil
import tempfile

import matplotlib
import numpy as np
import pandas as pd
from matplotlib.collections import PathCollection
from matplotlib.markers import MarkerStyle
from PIL import Image

MAX_POINTS = 10_000
MAX_JSON_BYTES = 8 * 1024 * 1024
MAX_PNG_BYTES = 16 * 1024 * 1024


class FigviewError(ValueError):
    """Fail-closed contract, geometry or budget violation."""


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':'), allow_nan=False).encode('utf-8')


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def _value(v):
    if v is None or v is pd.NA or v is pd.NaT:
        return {'missing': 'NA'}
    if isinstance(v, (float, np.floating)) and not math.isfinite(v):
        return {'missing': 'NaN' if math.isnan(v) else '+Infinity' if v > 0 else '-Infinity'}
    if isinstance(v, (pd.Timestamp, np.datetime64)):
        return {'datetime': pd.Timestamp(v).isoformat()}
    if isinstance(v, np.generic):
        v = v.item()
    if isinstance(v, int) and not isinstance(v, bool) and abs(v) > 2 ** 53 - 1:
        return {'integer': str(v)}
    if isinstance(v, (str, bool, int, float)):
        return v
    raise FigviewError(f'Unsupported raw value type {type(v).__name__}; convert explicitly before binding.')


class FigureBinding:
    """Snapshot once, before sorting/filtering; bind artists by explicit positional groups.

    row_groups is one list of source positions per plotted point, allowing many-to-one
    aggregation. Caller records filter/sort/aggregate semantics in lineage.
    """
    def __init__(self, fig, table=None, *, id_column=None, source=None, parser=None,
                 lineage=None, units=None, redraw=None, provenance=None):
        self.fig = fig
        self.artists = []
        self.redraw = copy.deepcopy(redraw or {})
        self.provenance = copy.deepcopy(provenance or {})
        self.source = copy.deepcopy(source or {'kind': 'dataframe' if table is not None else 'none'})
        self.parser = copy.deepcopy(parser or {'kind': 'dataframe'})
        self.rows = None
        if table is not None:
            if not isinstance(table, pd.DataFrame) or not table.columns.is_unique:
                raise FigviewError('Source must be a DataFrame with unique string column names.')
            columns = []
            for name in table.columns:
                if not isinstance(name, str):
                    raise FigviewError('Column names must be strings.')
                dtype = table[name].dtype
                kind = ('categorical' if isinstance(dtype, pd.CategoricalDtype) else
                        'datetime' if pd.api.types.is_datetime64_any_dtype(dtype) else
                        'boolean' if pd.api.types.is_bool_dtype(dtype) else
                        'integer' if pd.api.types.is_integer_dtype(dtype) else
                        'number' if pd.api.types.is_numeric_dtype(dtype) else 'string')
                column = {'name': name, 'type': kind, 'dtype': str(dtype),
                          'unit': (units or {}).get(name), 'precision': 'lossless-json/typed-tags'}
                if kind == 'categorical':
                    column['categories'] = [_value(v) for v in dtype.categories]
                    column['ordered'] = dtype.ordered
                columns.append(column)
            raw = []
            counts = {}
            for i, values in enumerate(table.itertuples(index=False, name=None)):
                semantic = _value(table[id_column].iloc[i] if id_column else table.index[i])
                key = sha256(canonical(semantic))
                occurrence = counts.get(key, 0)
                counts[key] = occurrence + 1
                raw.append({'row_id': f'{key}:{occurrence}', 'semantic_id': semantic,
                            'occurrence': occurrence, 'values': dict(zip(table.columns, map(_value, values)))})
            snapshot = {'columns': columns, 'rows': raw}
            self.source['snapshot_sha256'] = sha256(canonical(snapshot))
            self.rows = {'schema_version': 1, **snapshot, 'source': self.source,
                         'parser': self.parser, 'lineage': copy.deepcopy(lineage or
                         {'filters': [], 'sort': [], 'aggregations': []})}

    def bind_points(self, artist, *, series_id, row_groups, plotted_values, semantics=None, point_indices=None):
        if self.rows is None:
            raise FigviewError('No source table: export preview-only without bindings.')
        if not isinstance(artist, PathCollection) or artist.figure is not self.fig:
            raise FigviewError('v1 bindings require a scatter PathCollection from this Figure.')
        if artist.axes not in self.fig.axes or artist not in artist.axes.get_children():
            raise FigviewError('Artist must be attached to a data axes.')
        if not re.fullmatch(r'[A-Za-z0-9_-]+', series_id) or any(b['series_id'] == series_id for b in self.artists):
            raise FigviewError('series_id must be safe and unique within the figure.')
        groups = [list(g) for g in row_groups]
        xy = np.ma.asarray(plotted_values, dtype=float).copy()
        indices = list(range(len(artist.get_offsets()))) if point_indices is None else list(point_indices)
        if (xy.shape != (len(groups), 2) or len(indices) != len(groups) or
                len(set(indices)) != len(indices) or any(type(i) is not int or
                not 0 <= i < len(artist.get_offsets()) for i in indices)):
            raise FigviewError('One explicit row group and plotted coordinate pair per artist offset required.')
        for group in groups:
            if not group or len(set(group)) != len(group) or any(
                    type(i) is not int or not 0 <= i < len(self.rows['rows']) for i in group):
                raise FigviewError('row_groups must reference distinct valid source positions.')
        circle = MarkerStyle('o').get_path().transformed(MarkerStyle('o').get_transform())
        paths = artist.get_paths()
        if len(paths) != 1 or not np.array_equal(paths[0].vertices, circle.vertices):
            raise FigviewError('v1 hit geometry supports circular scatter markers only.')
        self.artists.append({'artist': artist, 'series_id': series_id, 'groups': groups,
                             'xy': xy, 'indices': indices, 'semantics': copy.deepcopy(semantics or {})})
        return self


def _scale(axis):
    name = axis.get_scale()
    if name not in ('linear', 'log'):
        raise FigviewError(f'Unsupported scale {name}; use linear/log or export preview without binding.')
    return {'name': name, 'base': float(axis.get_transform().base) if name == 'log' else None,
            'nonpositive': 'excluded' if name == 'log' else None}


def _capture(binding, event):
    # Renderer dimensions can be fractional after tight crop. Agg PNG floors them;
    # the y flip uses the fractional height (R1 spike), not the integer PNG height.
    height = float(event.renderer.height)
    axes = []
    elements = []
    series = []
    excluded = []
    all_order = {}
    order = 0
    for ax in sorted(binding.fig.axes, key=lambda a: a.get_zorder()):
        for child in sorted(ax.get_children(), key=lambda a: a.get_zorder()):
            all_order[child] = order
            order += 1
    for ax in binding.fig.axes:
        if not any(b['artist'].axes is ax for b in binding.artists):
            continue
        if ax.name != 'rectilinear':
            raise FigviewError('v1 only supports rectilinear axes.')
        axes_id = f'axes-{binding.fig.axes.index(ax)}'
        bbox = [float(ax.bbox.x0), height - float(ax.bbox.y1),
                float(ax.bbox.x1), height - float(ax.bbox.y0)]
        axes.append({'axes_id': axes_id, 'bbox': bbox,
                     'affine': ax.transData.get_affine().get_matrix().tolist(),
                     'xscale': _scale(ax.xaxis), 'yscale': _scale(ax.yaxis),
                     'xlim': list(ax.get_xlim()), 'ylim': list(ax.get_ylim()),
                     'inverted_x': bool(ax.xaxis_inverted()), 'inverted_y': bool(ax.yaxis_inverted())})
    for b in binding.artists:
        artist = b['artist']
        ax = artist.axes
        if artist.get_path_effects() or artist.get_sketch_params() or artist.get_hatch() or artist.get_rasterized():
            raise FigviewError('Path effects, sketch, hatch and nested rasterization are unsupported in v1.')
        if not artist.get_transform().is_affine or not np.array_equal(artist.get_transform().get_matrix(), np.eye(3)):
            raise FigviewError('Custom marker transforms are unsupported in v1.')
        transform = artist.get_offset_transform()
        if transform != ax.transData:
            raise FigviewError('v1 requires an explicitly supported data offset transform.')
        offsets = np.ma.asarray(artist.get_offsets())[b['indices']]
        if offsets.shape != b['xy'].shape or not np.ma.allequal(offsets, b['xy']):
            raise FigviewError('Artist offsets changed after binding; register a new binding.')
        clip_path = artist.get_clip_path()
        if clip_path is not None:
            raise FigviewError('Custom clipping paths are unsupported in v1; use rectangular axes clipping.')
        box = artist.get_clip_box() if artist.get_clip_on() else None
        clip = None if box is None else [float(box.x0), height - float(box.y1),
                                         float(box.x1), height - float(box.y0)]
        series.append({'series_id': b['series_id'], 'axes_id': f'axes-{binding.fig.axes.index(ax)}',
                       'semantics': b['semantics'], 'offset_affine': transform.get_affine().get_matrix().tolist()})
        display = transform.transform(offsets)
        sizes = artist.get_sizes()
        face = artist.get_facecolors()
        edge = artist.get_edgecolors()
        widths = artist.get_linewidths()
        for i, group in enumerate(b['groups']):
            artist_index = b['indices'][i]
            element_id = f"{b['series_id']}:{artist_index}"
            point = np.asarray(offsets[i].filled(np.nan))
            reason = None
            if not artist.get_visible() or not ax.get_visible():
                reason = 'invisible'
            elif np.ma.getmaskarray(offsets[i]).any() or not np.isfinite(point).all():
                reason = 'masked/nonfinite'
            elif (ax.get_xscale() == 'log' and point[0] <= 0) or (ax.get_yscale() == 'log' and point[1] <= 0):
                reason = 'outside-log-domain'
            elif artist.get_alpha() == 0 or not (len(face) and face[artist_index % len(face), 3] > 0 or
                    len(edge) and edge[artist_index % len(edge), 3] > 0 and len(widths) and widths[artist_index % len(widths)] > 0):
                reason = 'transparent'
            center = ([float(display[i, 0]), height - float(display[i, 1])]
                      if reason is None else [0.0, 0.0])
            if reason is None and not np.isfinite(center).all():
                reason = 'nonfinite-transform'
            if reason:
                excluded.append({'element_id': element_id, 'reason': reason,
                                 'row_ids': [binding.rows['rows'][j]['row_id'] for j in group]})
                continue
            size = float(sizes[artist_index % len(sizes)]) if len(sizes) else 0
            lw = float(widths[artist_index % len(widths)]) if len(widths) else 0
            radius = (math.sqrt(size) + lw) * binding.fig.dpi / 144
            if radius <= 0:
                excluded.append({'element_id': element_id, 'reason': 'zero-size',
                                 'row_ids': [binding.rows['rows'][j]['row_id'] for j in group]})
                continue
            elements.append({'axes_id': f'axes-{binding.fig.axes.index(ax)}',
                             'series_id': b['series_id'], 'element_id': element_id,
                             'geometry': {'kind': 'point', 'center': center, 'radius': radius},
                             'plotted_values': point.tolist(),
                             'row_ids': [binding.rows['rows'][j]['row_id'] for j in group],
                             'clip': clip, 'zorder': float(artist.get_zorder()),
                             'draw_order': all_order[artist], 'point_order': artist_index})
    if len(elements) > MAX_POINTS:
        raise FigviewError(f'Point budget exceeded: {len(elements)} > {MAX_POINTS}; filter, aggregate, split, or export preview-only.')
    return {'schema_version': 1, 'origin': 'top-left', 'units': 'image-pixels',
            'pixel_convention': 'continuous-boundaries', 'renderer_width': float(event.renderer.width),
            'renderer_height': height, 'dpi': float(binding.fig.dpi),
            'axes': axes, 'series': series, 'elements': elements, 'excluded': excluded}


def export_bundle(binding, output_dir, *, figure_id, parent_revision=None,
                  dpi=300, size_inches=None, tight=True, pad_inches=0.05, transparent=False):
    """Export an independent final viewer PNG via the unchanged exporter; publish last.

    Returns manifest path. No lookup by filename, OCR, automatic registration, or
    execution of recipe/script contents. Source and Artist changes fail closed.
    """
    from .export_figure import export_figure
    from .figview_validate import validate_bundle
    if not re.fullmatch(r'[A-Za-z0-9_-]+', figure_id):
        raise FigviewError('figure_id must contain only ASCII letters, digits, underscores or hyphens.')
    root = Path(output_dir).resolve() / figure_id
    root.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.pending-', dir=root))
    captured = []
    render_state = []
    for b in binding.artists:
        artist = b['artist']
        render_state.append((artist, artist.get_urls(), artist.get_snap()))
        # Agg's cached draw_markers fast path quantizes offsets to integer pixels.
        # Two inert URLs select draw_path_collection without changing style/data.
        # This independent opt-in PNG uses subpixel rendering, as in the R1 spike.
        if len(artist.get_urls()) == 1:
            artist.set_urls(artist.get_urls() * 2)
        artist.set_snap(False)
    handle = binding.fig.canvas.mpl_connect('draw_event', lambda e: captured.append(_capture(binding, e)))
    try:
        export_figure(binding.fig, str(staging / figure_id), formats=['png'], dpi=dpi,
                      size_inches=size_inches, tight=tight, pad_inches=pad_inches, transparent=transparent)
        if not captured:
            raise FigviewError('Final PNG draw was not captured; Agg backend required.')
        hits = captured[-1]
        png = staging / f'{figure_id}.png'
        png_bytes = png.read_bytes()
        if len(png_bytes) > MAX_PNG_BYTES:
            raise FigviewError(f'PNG exceeds 16 MiB: {len(png_bytes)} > {MAX_PNG_BYTES} bytes; reduce DPI/dimensions or split the figure.')
        with Image.open(png) as image:
            w, h = image.size
        if (w, h) != (int(hits['renderer_width']), int(hits['renderer_height'])):
            raise FigviewError('Captured final draw dimensions do not match PNG.')
        source = copy.deepcopy(binding.source)
        redraw = copy.deepcopy(binding.redraw)
        script = redraw.pop('script_path', None)
        if script:
            script_bytes = Path(script).read_bytes()
            (staging / 'recipe.py').write_bytes(script_bytes)
            redraw['script'] = {'path': 'recipe.py', 'sha256': sha256(script_bytes)}
        redraw.setdefault('recipe_id', None)
        redraw.setdefault('parameters', {})
        redraw.setdefault('allowed_parameters', [])
        redraw.setdefault('seed', None)
        redraw['libraries'] = {'python': platform.python_version(), 'matplotlib': matplotlib.__version__,
                               'numpy': np.__version__, 'pandas': pd.__version__}
        from importlib.metadata import version, PackageNotFoundError
        for library in ('Pillow', 'adjustText'):
            try:
                redraw['libraries'][library] = version(library)
            except PackageNotFoundError:
                redraw['libraries'][library] = 'not-installed'
        redraw['export'] = {'dpi': dpi, 'size_inches': size_inches, 'tight': tight,
                            'pad_inches': pad_inches, 'transparent': transparent}
        manifest = {'schema_version': 1, 'figure_id': figure_id, 'parent_revision': parent_revision,
                    'image': {'path': png.name, 'sha256': sha256(png_bytes), 'width': w, 'height': h, 'dpi': float(dpi)},
                    'data': None, 'hitmap': None,
                    'capabilities': {'inspect': 'preview', 'request_redraw': bool(redraw['recipe_id'] or script),
                                     'reason': 'no-source-table' if binding.rows is None else 'no-bound-points'},
                    'source': source, 'recipe': {'recipe_id': redraw['recipe_id']},
                    'provenance': binding.provenance, 'redraw': redraw}
        if binding.rows is not None:
            data_bytes = canonical(binding.rows)
            (staging / f'{figure_id}.rows.json').write_bytes(data_bytes)
            manifest['data'] = {'path': f'{figure_id}.rows.json', 'sha256': sha256(data_bytes)}
        if binding.artists:
            hit_bytes = canonical(hits)
            (staging / f'{figure_id}.hits.json').write_bytes(hit_bytes)
            manifest['hitmap'] = {'path': f'{figure_id}.hits.json', 'sha256': sha256(hit_bytes),
                                  'origin': 'top-left', 'units': 'image-pixels'}
            if hits['elements']:
                manifest['capabilities'].update(inspect='points', reason=None)
        manifest['revision'] = sha256(canonical(manifest))
        entry = staging / f'{figure_id}.figview.json'
        entry.write_bytes(canonical(manifest))
        validate_bundle(entry)
        final = root / manifest['revision']
        if final.exists():
            validate_bundle(final / entry.name)
            # Existing revision must be byte identical, including unreferenced files.
            if {p.name: p.read_bytes() for p in final.iterdir()} != {p.name: p.read_bytes() for p in staging.iterdir()}:
                raise FigviewError('Immutable revision collision; existing bundle differs.')
        else:
            os.rename(staging, final)
        return str(final / entry.name)
    finally:
        binding.fig.canvas.mpl_disconnect(handle)
        for artist, urls, snap in render_state:
            artist.set_urls(urls)
            artist.set_snap(snap)
        if staging.exists():
            shutil.rmtree(staging)
