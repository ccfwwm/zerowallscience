"""Circular plasmid maps, with measured external labels and vector feature arrows.

Coordinates are zero-based half-open internally (including GenBank conversion).
The origin is at twelve o'clock and coordinates increase clockwise. Source
features describe the record, rather than another biological element on the ring.
No dna-features-viewer objects or global pyplot figures are used here.
"""
import math
import os
import re
import textwrap

from seq_util import read_seq_input


COLORS = {
    'regulatory': '#009E73', 'promoter': '#009E73',
    'cds': '#56B4E9', 'reporter': '#56B4E9',
    'marker': '#0072B2', 'origin': '#CC79A7', 'rep_origin': '#CC79A7',
    'misc_feature': '#909AA6', 'other': '#909AA6',
}


def _union(spans):
    merged = []
    for start, end in sorted(spans):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else:
            merged.append((start, end))
    return merged


def _circular_span(spans, length):
    """Smallest circular envelope: omit the largest unoccupied gap."""
    spans = _union(spans)
    gaps = [(spans[(i + 1) % len(spans)][0] +
             (length if i == len(spans) - 1 else 0) - end, i)
            for i, (_, end) in enumerate(spans)]
    gap, index = max(gaps, key=lambda item: (item[0], -item[1]))
    start = spans[(index + 1) % len(spans)][0]
    return start, length - gap


def _feature(name, kind, spans, strand, length, color=None):
    if not spans or any(s < 0 or e < s or e > length for s, e in spans):
        raise ValueError(f'feature {name!r} has coordinates outside 0..{length}')
    start, size = _circular_span(spans, length)
    return {'name': str(name), 'type': str(kind).lower(), 'spans': _union(spans),
            'strand': strand, 'midpoint': (start + size / 2) % length,
            'start': start, 'size': size, 'color': color}


def _merge_features(features, length):
    """Deduplicate case/whitespace variants only at overlapping/nearby loci.

    Connected components also merge adjacent annotations across the origin.
    Distant copies and opposite strands stay distinct; all covered spans survive.
    """
    tolerance = max(2, round(length * 0.002))
    groups = []
    for feat in sorted(features, key=lambda f: (f['start'], f['name'].casefold(),
                                               f['type'], f['strand'])):
        key = re.sub(r'\s+', ' ', feat['name']).strip().casefold()
        matching = []
        for group in groups:
            if (group['key'], group['strand']) != (key, feat['strand']):
                continue
            if any(max(a, c + shift) - min(b, d + shift) <= tolerance
                   for a, b in group['spans'] for c, d in feat['spans']
                   for shift in (-length, 0, length)):
                matching.append(group)
        spans = list(feat['spans'])
        for group in matching:
            spans.extend(group['spans'])
            groups.remove(group)
        # Prefer the specific type over a generic duplicate, without inventing labels.
        candidates = matching + [feat]
        chosen = min(candidates, key=lambda f: (f['type'] in ('misc_feature', 'other'),
                                                f['start'], f['name']))
        merged = _feature(chosen['name'], chosen['type'], spans, feat['strand'],
                          length, chosen['color'])
        merged['key'] = key
        groups.append(merged)
    return sorted(groups, key=lambda f: (f['midpoint'], f['name'].casefold(),
                                        f['type'], f['strand']))


def _load_map(args, features):
    genbank = args.get('genbank_file')
    raw = []
    if genbank:
        from Bio import SeqIO
        record = SeqIO.read(genbank, 'genbank')
        length = len(record.seq)
        sequence = str(record.seq).upper() if record.seq.defined else ''
        name = args.get('name') or record.name or record.id
        source = f'{os.path.basename(genbank)} | accession {record.id}'
        for feat in record.features:
            if feat.type.lower() == 'source':
                continue
            qualifiers = feat.qualifiers
            label = next((str(qualifiers[k][0]) for k in
                          ('label', 'gene', 'product', 'note') if qualifiers.get(k)),
                         feat.type)
            if feat.location is None:
                raise ValueError(f'feature {label!r} has no location')
            spans = [(int(part.start), int(part.end)) for part in feat.location.parts]
            raw.append(_feature(label, feat.type, spans,
                                feat.location.strand or 0, length))
        coordinates = 'GenBank: 1-based inclusive; converted to 0-based half-open'
    else:
        sequence = read_seq_input(str(args.get('sequence', '')), 'sequence').upper()
        length = len(sequence)
        name = args.get('name', 'plasmid')
        value = str(args.get('sequence', ''))
        source = os.path.basename(value) if os.path.isfile(value) else 'user-supplied sequence/features'
        coordinates = 'features: 0-based half-open; start > end crosses the origin'
        for feat in features:
            if str(feat.get('type', '')).lower() == 'source':
                continue
            start, end = int(feat.get('start', 0)), int(feat.get('end', 0))
            if not (0 <= start <= length and 0 <= end <= length):
                raise ValueError(f'feature coordinates outside 0..{length}: {start}..{end}')
            spans = [(start, end)] if start <= end else [(start, length), (0, end)]
            direction = feat.get('direction', '+')
            strand = 1 if direction in ('+', 1) else -1 if direction in ('-', -1) else 0
            raw.append(_feature(feat.get('name', '?'), feat.get('type', 'other'),
                                spans, strand, length, feat.get('color')))
    if length <= 0:
        raise ValueError('circular map requires a positive sequence length')
    for region in args.get('highlight_regions') or []:
        start, end = int(region['start']), int(region['end'])
        spans = [(start, end)] if start <= end else [(start, length), (0, end)]
        raw.append(_feature(region.get('label', '') or 'highlight', 'highlight',
                            spans, 0, length, '#E5BF49'))
    return {'name': str(name), 'length': length, 'sequence': sequence,
            'source': source, 'coordinates': coordinates,
            'features': _merge_features(raw, length)}


def _tick_positions(length):
    """Start at 500 bp; choose a nearby divisor if it gives 4..8 major ticks.

    Short/long records use a 1/2/5 decade step. Never label both 0 and length.
    """
    step = 500
    if not 4 <= length / step <= 8:
        target = length / 6
        decade = 10 ** math.floor(math.log10(max(1, target)))
        step = max(1, min((m * decade for m in (1, 2, 5, 10)),
                          key=lambda candidate: abs(length / candidate - 6)))
    divisors = [length // count for count in range(4, 9) if length % count == 0]
    if divisors:
        nearby = min(divisors, key=lambda value: abs(value - step))
        if abs(nearby - step) <= step * 0.12:
            step = nearby
    return list(range(0, length, int(step))), int(step)


def _xy(angle, radius):
    return radius * math.sin(angle), radius * math.cos(angle)


def _wrap(value, width=26):
    # No shortening; breaking an unspaced identifier keeps every character.
    return '\n'.join(textwrap.wrap(str(value), width=width, break_long_words=True,
                                   break_on_hyphens=True)) or '?'


def _spread_labels(items, radius, gap):
    """Angle-sorted greedy pushing, followed by measured vertical separation."""
    low, high = 0.18, math.pi - 0.18
    minimum_angle = min(0.045, (high - low) / max(1, len(items) - 1))
    angles = []
    for item in items:
        angle = max(low, min(high, item['side_angle']))
        angles.append(max(angle, angles[-1] + minimum_angle) if angles else angle)
    if angles and angles[-1] > high:
        angles[-1] = high
        for i in range(len(angles) - 2, -1, -1):
            angles[i] = min(angles[i], angles[i + 1] - minimum_angle)
    bound = radius * math.cos(low)
    ys = []
    for i, (item, angle) in enumerate(zip(items, angles)):
        y = min(bound - item['height'] / 2, radius * math.cos(angle))
        if i:
            y = min(y, ys[-1] - (items[i - 1]['height'] + item['height']) / 2 - gap)
        ys.append(y)
    if ys:
        ys[-1] = max(ys[-1], -bound + items[-1]['height'] / 2)
        for i in range(len(ys) - 2, -1, -1):
            ys[i] = max(ys[i], ys[i + 1] + (items[i]['height'] + items[i + 1]['height']) / 2 + gap)
    for item, y in zip(items, ys):
        item['y'] = y
        angle = math.acos(max(-1, min(1, y / radius)))
        item['label_angle'] = angle if item['side'] == 1 else 2 * math.pi - angle


def _assign_tracks(features):
    tracks = []
    for feat in sorted(features, key=lambda f: (f['type'] in ('misc_feature', 'other'),
                                               f['start'], f['size'], f['name'])):
        for index, occupied in enumerate(tracks):
            if not any(a < d and c < b for a, b in feat['spans'] for c, d in occupied):
                break
        else:
            index = len(tracks)
            tracks.append([])
        tracks[index].extend(feat['spans'])
        feat['track'] = index
    return max(1, len(tracks))


def _draw_feature(ax, feat, index, length, radius, thickness):
    from matplotlib.patches import Polygon
    ordered = sorted(feat['spans'], key=lambda span: (span[0] - feat['start']) % length)
    terminal = len(ordered) - 1 if feat['strand'] == 1 else 0
    for part, (start, end) in enumerate(ordered):
        a, b = 2 * math.pi * start / length, 2 * math.pi * end / length
        # Tiny sites stay visible; their label anchor retains the exact coordinate.
        if b - a < 0.009:
            middle = (a + b) / 2
            a, b = middle - 0.0045, middle + 0.0045
        strand = feat['strand'] if part == terminal else 0
        head = min(0.075, (b - a) * 0.45)
        left = a + head if strand == -1 else a
        right = b - head if strand == 1 else b
        n = max(2, math.ceil((right - left) / 0.025))
        arc = [left + (right - left) * i / n for i in range(n + 1)]
        points = [_xy(angle, radius) for angle in arc]
        if strand == 1:
            points.append(_xy(b, radius - thickness / 2))
        points.extend(_xy(angle, radius - thickness) for angle in reversed(arc))
        if strand == -1:
            points.append(_xy(a, radius - thickness / 2))
        patch = Polygon(points, closed=True, facecolor=feat['color'],
                        edgecolor='white', linewidth=0.6, zorder=3)
        patch.set_gid(f'feature:{index}:{part}:strand:{strand}')
        ax.add_patch(patch)


def _build_figure(args, features):
    """Build a Figure and scene data for geometry verification, without saving."""
    from matplotlib.figure import Figure
    from matplotlib.backends.backend_agg import FigureCanvasAgg
    from matplotlib.patches import Circle

    data = _load_map(args, features)
    width = float(args.get('figure_width', 10))
    if not math.isfinite(width) or width <= 0:
        raise ValueError('figure_width must be positive and finite')
    groups, length = data['features'], data['length']
    for feat in groups:
        cloning_site = re.search(r'\bmcs\b|polylinker|cloning site', feat['name'], re.I)
        default_color = '#E69F00' if cloning_site else COLORS.get(feat['type'], COLORS['other'])
        feat['color'] = feat['color'] or default_color
    tracks = _assign_tracks(groups)
    pitch = min(0.105, 0.43 / tracks)
    thickness = pitch * 0.76
    fontsize = min(9.5, width * 2.4)
    # A fixed horizontal scale keeps measured text sizes stable as dense maps grow
    # vertically. The requested width remains the nominal Figure width.
    x_extent = 3.65
    fig = Figure(figsize=(width, width * 0.78), dpi=100, facecolor='white')
    canvas = FigureCanvasAgg(fig)
    renderer = canvas.get_renderer()
    units_per_pixel = 2 * x_extent / (width * fig.dpi * 0.92)
    labels = []
    for i, feat in enumerate(groups):
        angle = 2 * math.pi * feat['midpoint'] / length
        side = 1 if angle <= math.pi else -1
        text = _wrap(feat['name'])
        probe = fig.text(0, 0, text, fontsize=fontsize, linespacing=1.3, parse_math=False)
        box = probe.get_window_extent(renderer)
        probe.remove()
        labels.append({'index': i, 'text': text, 'angle': angle, 'side': side,
                       'side_angle': angle if side == 1 else 2 * math.pi - angle,
                       'height': box.height * units_per_pixel,
                       'width': box.width * units_per_pixel})
    # Include long labels in the canvas instead of clipping them or shortening.
    width_fraction = max((item['width'] / (2 * x_extent) for item in labels), default=0)
    needed_x = max(x_extent, 1.73 / max(0.05, 1 - 2 * width_fraction))
    if needed_x > x_extent:
        ratio = needed_x / x_extent
        x_extent = needed_x
        for item in labels:
            item['height'] *= ratio
            item['width'] *= ratio
    gap = 7 * units_per_pixel * (x_extent / 3.65)
    sides = [sorted([item for item in labels if item['side'] == side],
                    key=lambda item: (item['side_angle'], item['index'])) for side in (1, -1)]
    required = max([0] + [sum(item['height'] for item in items) + gap * max(0, len(items) - 1)
                          for items in sides])
    label_radius = max(1.53, (required + 0.12) / (2 * math.cos(0.18)))
    for items in sides:
        _spread_labels(items, label_radius, gap)
    footer_width = max(24, int(width * 13))
    footer = (_wrap(f"Source: {data['source']}", footer_width) + '\n' +
              _wrap(f"Coordinates: {data['coordinates']}; 0 at top, clockwise; "
                    'arrows indicate annotated strand.', footer_width))
    footer_height = 0.16 * len(footer.splitlines()) + 0.22
    y_extent = label_radius + 0.22
    plot_height = width * 0.92 * y_extent / x_extent
    height = plot_height + footer_height + 0.20
    fig.set_size_inches(width, height)
    ax = fig.add_axes([0.04, footer_height / height, 0.92, plot_height / height])
    ax.set(xlim=(-x_extent, x_extent), ylim=(-y_extent, y_extent), aspect='equal')
    ax.axis('off')
    ax.add_patch(Circle((0, 0), 1.10, fill=False, edgecolor='#D7DDE3', linewidth=5))
    ax.add_patch(Circle((0, 0), 1.0, fill=False, edgecolor='#E3E7EB', linewidth=0.8))
    for i, feat in enumerate(groups):
        _draw_feature(ax, feat, i, length, 1.0 - feat['track'] * pitch, thickness)
    ticks, step = _tick_positions(length)
    for position in ticks:
        angle = 2 * math.pi * position / length
        x0, y0 = _xy(angle, 1.105)
        x1, y1 = _xy(angle, 1.15)
        ax.plot([x0, x1], [y0, y1], color='#59636E', linewidth=0.85, zorder=4)
        x, y = _xy(angle, 1.205)
        tick = ax.text(x, y, str(position), fontsize=8, color='#59636E',
                       ha='center', va='center', parse_math=False)
        tick.set_gid(f'tick-label:{position}')
    # Leaders begin outside the tick labels and follow the exterior before
    # departing toward the text. No chord can cut through the feature ring.
    guard = 1.30
    for item in labels:
        i = item['index']
        feat = groups[i]
        angle, target = item['angle'], item['label_angle']
        n = max(2, math.ceil(abs(target - angle) / 0.025))
        points = [_xy(angle + (target - angle) * k / n, guard) for k in range(n + 1)]
        points.append((item['side'] * 1.49, item['y']))
        leader, = ax.plot([p[0] for p in points], [p[1] for p in points],
                          color=feat['color'], linewidth=0.85, zorder=2)
        leader.set_gid(f'leader:{i}')
        x, y = _xy(angle, 1.025)
        ax.plot([x], [y], marker='o', markersize=2.5, color=feat['color'], zorder=4)
        text = ax.text(item['side'] * 1.53, item['y'], item['text'],
                       ha='left' if item['side'] == 1 else 'right', va='center',
                       fontsize=fontsize, linespacing=1.3, color=feat['color'], parse_math=False)
        text.set_gid(f'label:{i}')
    center_size = min(14, width * 1.65)
    center_name = ax.text(0, 0.13, _wrap(data['name'], 18), ha='center', va='center',
                          fontsize=center_size, weight='bold', color='#273440', parse_math=False)
    center_name.set_gid('center:name')
    info = f"{length:,} bp"
    if data['sequence']:
        gc = sum(base in 'GC' for base in data['sequence']) / length * 100
        info += f'\nGC {gc:.2f}%'
    center_info = ax.text(0, -0.14, info, ha='center', va='center',
                          fontsize=center_size * 0.8, linespacing=1.6, color='#59636E', parse_math=False)
    center_info.set_gid('center:info')
    source_text = fig.text(0.5, footer_height / height / 2, footer, ha='center', va='center',
                           fontsize=8, linespacing=1.4, color='#59636E', parse_math=False)
    source_text.set_gid('source')
    canvas.draw()
    # Fit the complete center block inside the innermost track and place the
    # title/info using measured heights rather than fixed offsets.
    renderer = canvas.get_renderer()
    scale = ax.transData.transform((1, 0))[0] - ax.transData.transform((0, 0))[0]
    title_box = center_name.get_window_extent(renderer)
    info_box = center_info.get_window_extent(renderer)
    total_height = (title_box.height + info_box.height) / scale
    factor = min(1, 0.64 / total_height, 0.72 * scale / max(title_box.width, info_box.width))
    center_name.set_fontsize(center_size * factor)
    center_info.set_fontsize(center_size * 0.8 * factor)
    title_height = center_name.get_window_extent(renderer).height / scale
    info_height = center_info.get_window_extent(renderer).height / scale
    center_name.set_y((info_height + 0.07) / 2)
    center_info.set_y(-(title_height + 0.07) / 2)
    canvas.draw()
    data.update({'labels': labels, 'label_radius': label_radius,
                 'leader_guard': guard, 'tick_step': step, 'tracks': tracks})
    return fig, data


def render_circular_map(args, features):
    """Save PNG/SVG and return the existing graphic result contract."""
    import matplotlib
    output_format = str(args.get('output_format', 'png')).lower()
    name = args.get('name', 'plasmid')
    out_file = args.get('out_file') or os.path.join(os.getcwd(), f'{name}_map.{output_format}')
    fig, _ = _build_figure(args, features)
    try:
        with matplotlib.rc_context({'svg.fonttype': 'none'}):
            fig.savefig(out_file, format=output_format, bbox_inches='tight', dpi=300)
    finally:
        fig.clear()
    return {'graphic': True, 'out_file': os.path.abspath(out_file),
            'output_format': output_format, 'figure_width': float(args.get('figure_width', 10))}
