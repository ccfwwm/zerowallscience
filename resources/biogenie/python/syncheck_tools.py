"""DNA 合成约束检查工具
检查序列是否能被 DNA 合成公司（如 Twist/IDT/GeneScript）成功合成。
"""
import os
import sys
import re
from seq_util import clean_seq

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))




def _gc_percent(seq):
    s = clean_seq(seq).replace('N', '')
    if not s:
        return 0.0
    return (s.count('G') + s.count('C')) / len(s) * 100


def _find_repeats(seq, min_len=4, window=50):
    """查找窗口内的连续重复（如 ATATAT 或 GTGTGT）。"""
    issues = []
    for i in range(len(seq) - min_len * 2):
        window_seq = seq[i:i + min_len]
        # 检查窗口内是否出现 2+ 次同一单元
        count = seq.count(window_seq, i + min_len, i + window)
        if count >= 2:
            issues.append({'type': 'direct_repeat', 'sequence': window_seq, 'count': count + 1, 'position': i})
            break  # 同位置不重复报告
    return issues


def _find_poly_runs(seq, min_len=6):
    """查找连续同碱基（poly-G/poly-A 等，易造成合成错误）。"""
    issues = []
    pattern = re.compile(r'(.)\1{' + str(min_len - 1) + ',}')
    for m in pattern.finditer(seq):
        issues.append({
            'type': 'poly_run',
            'sequence': m.group(0),
            'length': len(m.group(0)),
            'position': m.start(),
        })
    return issues


def _find_hairpins(seq, min_stem=8, max_loop=20):
    """查找潜在发夹结构（回文序列 → 二级结构 → 影响合成/扩增）。
    简化检测：查找 ≥8bp 的反向互补区。
    """
    issues = []
    n = len(seq)
    for i in range(n - min_stem * 2 - max_loop):
        # 取候选茎，检测是否与下游某片段反向互补
        for stem_len in range(min_stem, min(15, (n - i) // 2)):
            candidate = seq[i:i + stem_len]
            rc = candidate.translate(str.maketrans('ACGT', 'TGCA'))[::-1]
            # 在 ±loop 范围内查找匹配
            search_start = i + stem_len + 3
            search_end = min(n, search_start + max_loop)
            pos = seq.find(rc, search_start, search_end)
            if pos > 0:
                issues.append({
                    'type': 'hairpin',
                    'stem_length': stem_len,
                    'loop_length': pos - i - stem_len,
                    'position': i,
                })
                return issues  # 只报告第一个
    return issues


def _find_gc_extremes(seq, window=50, min_gc=25.0, max_gc=65.0):
    """滑动窗口检测 GC 极端区。"""
    issues = []
    for i in range(0, len(seq) - window + 1, window // 2):
        w = seq[i:i + window]
        gc = _gc_percent(w)
        if gc < min_gc:
            issues.append({'type': 'low_gc_window', 'start': i, 'end': i + window, 'gc_percent': round(gc, 1)})
        elif gc > max_gc:
            issues.append({'type': 'high_gc_window', 'start': i, 'end': i + window, 'gc_percent': round(gc, 1)})
    return issues


def _find_homopolymers(seq, threshold=8):
    """检测长同聚物（>threshold 易造成合成错误）。"""
    issues = []
    for m in re.finditer(r'(.)\1{' + str(threshold - 1) + ',}', seq):
        issues.append({
            'type': 'homopolymer',
            'base': m.group(1),
            'length': len(m.group(0)),
            'position': m.start(),
        })
    return issues


def _find_restriction_in_frame(seq):
    """检测序列中是否含常见限制性位点（用户后续需要切的话会用到，提前预警）。"""
    # 仅检查最常用的 8 种
    common_sites = {
        'EcoRI': 'GAATTC', 'BamHI': 'GGATCC', 'HindIII': 'AAGCTT',
        'SalI': 'GTCGAC', 'XhoI': 'CTCGAG', 'PstI': 'CTGCAG',
        'NotI': 'GCGGCCGC', 'XbaI': 'TCTAGA',
    }
    found = []
    for name, site in common_sites.items():
        pos = seq.find(site)
        if pos >= 0:
            found.append({'enzyme': name, 'site': site, 'position': pos})
    return found


def op_dna_syncheck(args):
    """DNA 合成约束检查。
    args:
      sequence: DNA 序列（必填）
      host: 宿主（用于密码子检查，默认 e_coli）
      min_gc_window, max_gc_window: 窗口 GC 边界（默认 25, 65）
      homopolymer_threshold: 同聚物报警阈值（默认 8）
      poly_run_min: 连续重复报警阈值（默认 6）
    返回：各约束检查结果 + 综合可合成性评估。
    """
    sequence = clean_seq(args.get('sequence', ''))
    if not sequence:
        raise ValueError('sequence 必填')
    if not re.match(r'^[ACGTN]+$', sequence):
        invalid = set(c for c in sequence if c not in 'ACGTN')
        return {'error': f'序列含非法碱基 {invalid}，仅支持 A/C/G/T/N'}

    length = len(sequence)
    overall_gc = _gc_percent(sequence)

    # 收集所有问题
    issues = {
        'critical': [],   # 不可合成
        'warning': [],    # 难合成/有风险
        'info': [],       # 信息提示
    }
    score = 100  # 可合成性评分（0-100）

    # 1. 长度检查
    if length > 6000:
        issues['critical'].append({
            'type': 'length_too_long',
            'message': f'序列 {length}bp 超过常规合成上限（6000bp），需分段或分级组装',
            'length': length,
        })
        score -= 30
    elif length < 50:
        issues['info'].append({'type': 'short_sequence', 'length': length})

    # 2. 全局 GC
    if overall_gc < 25 or overall_gc > 65:
        issues['warning'].append({
            'type': 'overall_gc_extreme',
            'gc_percent': round(overall_gc, 1),
            'message': f'全局 GC {overall_gc:.1f}% 超出合成友好范围（25-65%）',
        })
        score -= 10

    # 3. 窗口 GC
    for issue in _find_gc_extremes(sequence, min_gc=float(args.get('min_gc_window', 25)),
                                    max_gc=float(args.get('max_gc_window', 65))):
        issues['warning'].append(issue)
        score -= 5

    # 4. 同聚物
    threshold = int(args.get('homopolymer_threshold', 8))
    for issue in _find_homopolymers(sequence, threshold):
        issues['critical'].append({**issue, 'message': f"同聚物 {issue['base']}×{issue['length']} 超过阈值 {threshold}，易造成合成错误"})
        score -= 15

    # 5. poly-run
    poly_min = int(args.get('poly_run_min', 6))
    for issue in _find_poly_runs(sequence, poly_min):
        if issue['length'] < threshold:
            issues['warning'].append({**issue, 'message': f"连续重复 {issue['sequence']}（{issue['length']}bp），可能影响合成"})
            score -= 5

    # 6. 发夹结构
    hairpins = _find_hairpins(sequence)
    for h in hairpins:
        issues['warning'].append({**h, 'message': f"潜在发夹结构：茎 {h['stem_length']}bp + 环 {h['loop_length']}bp，可能影响扩增"})
        score -= 8

    # 7. 直接重复
    for r in _find_repeats(sequence):
        issues['warning'].append({**r, 'message': f"直接重复序列 {r['sequence']} 在 50bp 内出现 {r['count']} 次"})
        score -= 5

    # 8. 限制性位点预警
    sites = _find_restriction_in_frame(sequence)
    if sites:
        issues['info'].append({
            'type': 'restriction_sites',
            'count': len(sites),
            'sites': sites,
            'message': f'检测到 {len(sites)} 个常用限制性位点',
        })

    # 综合判定
    if score >= 85:
        verdict = 'excellent'
    elif score >= 70:
        verdict = 'good'
    elif score >= 50:
        verdict = 'challenging'
    else:
        verdict = 'likely_fail'

    return {
        'length': length,
        'gc_percent': round(overall_gc, 1),
        'synthesizability_score': max(0, score),
        'verdict': verdict,
        'issue_summary': {
            'critical': len(issues['critical']),
            'warning': len(issues['warning']),
            'info': len(issues['info']),
        },
        'issues': issues,
        'note': '评分基于常见合成约束（GC/同聚物/发夹/重复等），实际可合成性需合成公司确认；限制性位点仅作信息提示，不扣分。',
    }
