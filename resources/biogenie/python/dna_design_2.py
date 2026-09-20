"""DNA/质粒设计工具 — 组装策略 + 质粒图谱"""
import sys
import json
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def op_assembly_design(args):
    """组装策略设计：输入片段列表，推荐组装方法并计算接头/overhang。"""
    from Bio.Seq import Seq

    fragments = list(args.get('fragments', []) or [])
    method = args.get('method', 'auto')  # auto | gibson | golden_gate | restriction
    vector = args.get('vector', None)  # 可选载体序列

    # vector 真正参与组装：把线性化载体并入片段列表（作为环化起点）。
    # 此前 vector 是声明了却从未使用的死参数，导致「单个插入片段 + 载体」这种最常见的
    # 组装表达被 len<2 直接拒掉——v0.6.26 E2E 实测 agent 连续两次撞
    # 'at least 2 fragments required' 且无法从错误里自救。
    if vector:
        fragments = [vector] + fragments

    if len(fragments) < 2:
        return {'error': f'需要 ≥2 个片段用于组装（收到 {len(fragments)} 个）。'
                         '只有单个插入片段时：① 要算克隆接头与最终产物，用 bio_clone_simulate'
                         '（backbone + inserts）；② 或把线性化载体序列作为 vector 参数传入，'
                         '本工具会将其并入片段列表一起设计组装。'}

    # 计算总长度
    total_len = sum(len(f) for f in fragments)
    frag_info = []
    for i, seq in enumerate(fragments):
        s = seq.upper().replace(' ', '')
        frag_info.append({
            'index': i,
            'id': f'fragment_{i+1}',
            'length': len(s),
            'gc': round(sum(1 for c in s if c in 'GC') / len(s) * 100, 1) if s else 0,
            'sequence_preview': s[:30] + ('...' if len(s) > 30 else ''),
        })

    # 自动推荐方法
    if method == 'auto':
        if total_len < 15000 and len(fragments) <= 6:
            method = 'gibson'
        elif len(fragments) > 6:
            method = 'golden_gate'
        else:
            method = 'restriction'

    result = {
        'method': method,
        'n_fragments': len(fragments),
        'total_length': total_len,
        'fragments': frag_info,
    }

    if method == 'gibson':
        # 设计 Gibson Assembly 接头（15-40bp overlap）
        overlap_len = 20
        overlaps = []
        for i in range(len(fragments) - 1):
            fwd_end = fragments[i][-overlap_len:].upper().replace(' ', '')
            rev_start = fragments[i + 1][:overlap_len].upper().replace(' ', '')
            overlaps.append({
                'between': f'fragment_{i+1}_fragment_{i+2}',
                'overlap_length': overlap_len,
                'sequence': fwd_end,
                'note': '5\' 端 fragment 的 3\' 与下一个 fragment 的 5\' 重叠',
            })
        result['overlaps'] = overlaps
        result['protocol'] = {
            'name': 'Gibson Assembly',
            'enzymes': 'Gibson Assembly Master Mix (NEB E2621)',
            'temperature': '50°C',
            'time': '60 min (1-4 fragments) or overnight (>4 fragments)',
            'notes': '碎片等摩尔混合；总长度 <15kb 效率最高；建议 3:1 插入:载体摩尔比',
        }

    elif method == 'golden_gate':
        # 设计 Golden Gate overhangs（4bp scarless）
        overhangs = []
        for i in range(len(fragments) - 1):
            # 从每个片段末端取 4bp 作为 overhang
            end_4bp = fragments[i][-4:].upper().replace(' ', '') if len(fragments[i]) >= 4 else 'NNNN'
            overhangs.append({
                'position': f'junction_{i+1}',
                'overhang': end_4bp,
                'enzyme': 'BsaI (GCTCTTC)',
            })
        result['overhangs'] = overhangs
        result['protocol'] = {
            'name': 'Golden Gate Assembly',
            'enzymes': 'BsaI (Type IIS) + T4 DNA Ligase',
            'temperature': '37°C digestion + 16°C ligation (cycling)',
            'time': '25-50 cycles',
            'notes': '每个片段两端加 BsaI 位点；overhangs 必须唯一；可同时组装 >10 个片段',
        }

    elif method == 'restriction':
        result['protocol'] = {
            'name': 'Restriction-Ligation Cloning',
            'enzymes': '选择合适的限制酶 + T4 DNA Ligase',
            'notes': '需确保片段内部无酶切位点；建议双酶切提高定向性',
        }
        result['note'] = '限制酶克隆需手动选择酶；运行 bio_seq_restriction 检查位点可用性'

    result['next_step'] = (
        f'组装方案已设计。下一步：用 bio_clone_simulate(method={method}, backbone=载体序列, '
        'inserts=[{name, sequence}...]) 传入相同片段做环化组装模拟；模拟成功返回的 '
        'product_sequence 可直接传给 bio_plasmid_map（配合 features）出质粒图。')

    return result


def _plasmid_graphic(args, features):
    """dna-features-viewer 图形模式：GenBank 文件或 features+sequence → PNG/SVG。

    成功返回 dict（含 out_file 路径）；库缺失或无图形输入返回 None 走文本回退。
    """
    genbank_file = args.get('genbank_file')
    output_format = str(args.get('output_format', 'png')).lower()
    if not genbank_file and not args.get('sequence'):
        return None
    try:
        import matplotlib
        matplotlib.use('Agg')
        from dna_features_viewer import (
            BiopythonTranslator, CircularGraphicRecord, GraphicRecord, GraphicFeature,
        )
    except ImportError:
        return {'graphic': False,
                'graphic_note': 'dna_features_viewer 未安装，已回退文本模式'
                                '（可运行 bio_env reinstall=true 补装）'}

    name = args.get('name', 'plasmid')
    width = float(args.get('figure_width', 10))
    try:
        if genbank_file:
            record = BiopythonTranslator().translate_record(
                genbank_file, record_class=CircularGraphicRecord)
        else:
            seq = ''.join(str(args.get('sequence', '')).upper().split())
            gfeatures = [
                GraphicFeature(start=int(f.get('start', 0)), end=int(f.get('end', 0)),
                               strand=1 if f.get('direction', '+') == '+' else -1,
                               label=str(f.get('name', '?')))
                for f in features
            ]
            cls = CircularGraphicRecord if args.get('circular', True) else GraphicRecord
            seq_len = len(seq) if seq else int(max(1, args.get('size', 1000)))
            try:
                # 新版：CircularGraphicRecord 必须 sequence_length（若非零则一并传 sequence）
                record = cls(sequence_length=seq_len,
                             sequence=seq or None,
                             features=gfeatures)
            except TypeError:
                # 旧版/Linear 兼容：只收 sequence
                record = cls(sequence=seq or 'N' * seq_len, features=gfeatures)
        # 高亮区域（可选）
        for hl in args.get('highlight_regions') or []:
            record.features.append(GraphicFeature(
                start=int(hl['start']), end=int(hl['end']), strand=0,
                color='#fff3b0', label=str(hl.get('label', ''))))

        out_file = args.get('out_file') or os.path.join(
            os.getcwd(), f'{name}_map.{output_format}')
        ax, _ = record.plot(figure_width=width)
        ax.figure.savefig(out_file, bbox_inches='tight', dpi=300)
        import matplotlib.pyplot as plt
        plt.close(ax.figure)
        return {'graphic': True, 'out_file': os.path.abspath(out_file),
                'output_format': output_format, 'figure_width': width}
    except Exception as e:
        return {'graphic': False, 'graphic_note': f'图形渲染失败，已回退文本模式: {e}'}


def op_plasmid_map(args):
    """质粒图谱：GenBank/features → 图形（dna-features-viewer）或文本注释图。

    传入 genbank_file 或（features + sequence）时优先输出 PNG/SVG 图形文件；
    dna_features_viewer 缺失或渲染失败时自动回退到原有文本模式。
    """
    features = args.get('features', [])
    name = args.get('name', 'plasmid')
    total_size = args.get('size', None)

    graphic_result = None
    if args.get('genbank_file') or (args.get('sequence') and features):
        graphic_result = _plasmid_graphic(args, features)

    if not features:
        # 仅 GenBank 图形模式不需要 features 列表
        if args.get('genbank_file') and graphic_result and graphic_result.get('graphic'):
            return {'name': name, **graphic_result}
        return {'error': 'features list required (e.g. [{"name":"promoter","start":0,"end":200,"type":"regulatory"}])'}

    # 构建图谱
    max_pos = total_size or max(f.get('end', 0) for f in features)
    scale = 60  # 每行显示的碱基数

    # 按位置排序
    features_sorted = sorted(features, key=lambda x: x.get('start', 0))

    # 特征类型颜色符号
    type_symbols = {
        'regulatory': '═══',  # 启动子等调控元件
        'cds': '═══',         # 编码序列
        'origin': '─ ─ ─',   # 复制起点
        'marker': '▓▓▓',     # 筛选标记
        'reporter': '░░░',   # 报告基因
        'other': '───',
    }

    # 文本图谱
    map_lines = [
        f'╔══ {name} ({max_pos} bp) ══╗',
        '',
    ]

    for feat in features_sorted:
        start = feat.get('start', 0)
        end = feat.get('end', 0)
        feat_type = feat.get('type', 'other')
        feat_name = feat.get('name', '?')
        direction = feat.get('direction', '+')
        symbol = type_symbols.get(feat_type, '───')
        arrow = '→' if direction == '+' else '←'
        size = end - start

        map_lines.append(
            f'  {start:>6}..{end:<6} │{symbol}│ {arrow} {feat_name} ({feat_type}, {size}bp)'
        )

    # 统计：按区间并集算覆盖碱基数，避免重叠特征被重复计数。
    # （E2E 实测：eGFP 720bp 图上有 CDS(0-720) + 两端引物 + 起始/终止密码子等
    #   子区间，简单求和得 776bp > 720bp → unannotated_bp = -56 这种无意义的负值。）
    spans = sorted((max(0, int(f.get('start', 0))), min(max_pos, int(f.get('end', 0))))
                   for f in features
                   if int(f.get('end', 0)) > int(f.get('start', 0)))
    covered = 0
    cur_start = cur_end = None
    for s, e in spans:
        if cur_end is None or s > cur_end:
            if cur_end is not None:
                covered += cur_end - cur_start
            cur_start, cur_end = s, e
        elif e > cur_end:
            cur_end = e
    if cur_end is not None:
        covered += cur_end - cur_start
    feature_bp = covered
    remaining = max(0, max_pos - feature_bp)

    map_lines.extend([
        '',
        f'  未注释区域: {remaining} bp ({round(remaining/max_pos*100, 1)}%)',
        f'  特征总数: {len(features)}',
        f'  总大小: {max_pos} bp',
        '',
        '╚' + '═' * 40 + '╝',
        '',
        '特征列表:',
    ])

    for i, feat in enumerate(features_sorted, 1):
        arrow = '→' if feat.get('direction', '+') == '+' else '←'
        map_lines.append(
            f'  {i}. {feat.get("name", "?")} [{feat.get("type", "?")}] {feat.get("start")}-{feat.get("end")} {arrow}'
        )

    result = {
        'name': name,
        'size': max_pos,
        'features': features_sorted,
        'n_features': len(features),
        'feature_bp': feature_bp,
        'unannotated_bp': remaining,
        'map_text': '\n'.join(map_lines),
    }
    if graphic_result and graphic_result.get('graphic'):
        result['mode'] = 'graphic'
        result['output_file'] = graphic_result.get('out_file')
        result.update(graphic_result)
    else:
        result['mode'] = 'text'
        result['output_file'] = None
        if graphic_result:
            result['graphic_note'] = graphic_result.get('graphic_note', '')
        result['note'] = ('未生成图形文件：需传入 sequence（与 features 配合）或 genbank_file '
                          '才输出 PNG/SVG 图形（dna-features-viewer）；out_file 可指定落盘路径，'
                          '默认工作区 <name>_map.<format>。当前返回为文本注释图（见 map_text），'
                          '不要声称已生成图形文件。')
    return result
