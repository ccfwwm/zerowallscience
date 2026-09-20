"""合成生物学工具 - CRISPR 工具链
- bio_crispr_guide: sgRNA 设计（PAM 扫描 + off-target 评分 + 效率预测）
- bio_crispr_verify: 编辑验证（Sanger 测序分析 → indel/substitution 定量）
"""
import os
import sys
import re
from collections import defaultdict
from seq_util import clean_seq

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ============== PAM 配置 ==============
# Cas9 (SpCas9): PAM = NGG, 引导区 20nt
# Cas9 eSpCas9/HiFi: 同 NGG
# Cas12a (AsCas12a): PAM = TTTV, 引导区 20-23nt
# CasX (Cas12e): PAM = TTCN
PAM_CONFIG = {
    'spcas9':     {'pam_regex': r'[ATCG]GG', 'pam_pos': 'downstream', 'guide_len': 20, 'name': 'SpCas9 (NGG)'},
    'cas9_hifi':  {'pam_regex': r'[ATCG]GG', 'pam_pos': 'downstream', 'guide_len': 20, 'name': 'Cas9 HiFi (NGG)'},
    'espcas9':    {'pam_regex': r'[ATCG]GG', 'pam_pos': 'downstream', 'guide_len': 20, 'name': 'eSpCas9 (NGG)'},
    'cas12a':     {'pam_regex': r'TTT[ACG]', 'pam_pos': 'upstream', 'guide_len': 20, 'name': 'Cas12a (TTTV)'},
    'cas12e':     {'pam_regex': r'TTC[ATCG]', 'pam_pos': 'upstream', 'guide_len': 20, 'name': 'Cas12e (TTCN)'},
}




def _calc_gc(seq):
    """GC 含量（排除 N）。"""
    if not seq:
        return 0.0
    s = clean_seq(seq).replace('N', '')
    if not s:
        return 0.0
    return (s.count('G') + s.count('C')) / len(s) * 100


def _has_poly_run(seq, min_len=5):
    """检测连续同碱基（如 TTTTT）。"""
    for base in 'ATCG':
        if base * min_len in seq:
            return True
    return False


def _predict_efficiency_spcas9(guide_seq, pam):
    """Doench 2014 简化版效率预测。
    综合 GC 含量、PAM 强度、poly-run 惩罚等因子。
    返回 0-100 的预测效率分（仅供参考，非实验验证模型）。
    """
    gc = _calc_gc(guide_seq)
    score = 50.0  # baseline
    # 最佳 GC 范围 40-70%
    if 40 <= gc <= 70:
        score += 20
    elif 30 <= gc < 40 or 70 < gc <= 80:
        score += 5
    else:
        score -= 15
    # 末端 poly-N 严重降低效率
    if _has_poly_run(guide_seq[:6], 5):
        score -= 25
    elif _has_poly_run(guide_seq[-6:], 5):
        score -= 20
    # PAM = NGG 中 N 为 G 更优
    if pam[0] == 'G':
        score += 5
    return max(0, min(100, score))


def _count_offtargets(guide_seq, ref_seq, max_mismatches=3):
    """在 ref_seq 中查找 guide_seq 的近似匹配（滑动窗口 + 错配计数）。
    简化版：不实现全基因组扫描的种子匹配算法，对小质粒/单基因场景足够。
    返回 [(position, mismatches, strand)]。
    """
    guide = clean_seq(guide_seq)
    ref = clean_seq(ref_seq)
    guide_len = len(guide)
    targets = []
    # + 链扫描
    for i in range(len(ref) - guide_len + 1):
        window = ref[i:i + guide_len]
        mm = sum(1 for a, b in zip(guide, window) if a != b)
        if 0 < mm <= max_mismatches:
            targets.append((i, mm, '+'))
    # - 链扫描（取反向互补）
    rc_guide = _reverse_complement(guide)
    for i in range(len(ref) - guide_len + 1):
        window = ref[i:i + guide_len]
        mm = sum(1 for a, b in zip(rc_guide, window) if a != b)
        if 0 < mm <= max_mismatches:
            targets.append((i, mm, '-'))
    return targets


def _reverse_complement(seq):
    comp = {'A': 'T', 'T': 'A', 'G': 'C', 'C': 'G', 'N': 'N'}
    return ''.join(comp[b] for b in reversed(clean_seq(seq)))


def op_crispr_guide(args):
    """CRISPR sgRNA 设计。
    args:
      sequence: 模板序列（必填，DNA）
      cas: Cas 蛋白类型（默认 spcas9）
      gc_min, gc_max: GC 范围筛选（默认 30, 80）
      max_offtargets: off-target 容忍数（默认 10）
      max_mismatches: off-target 错配上限（默认 3）
      top_n: 返回候选数（默认 10）
    """
    sequence = clean_seq(args.get('sequence', ''))
    if not sequence:
        raise ValueError('sequence 必填（DNA 模板序列）')
    if len(sequence) < 23:
        raise ValueError(f'模板太短（{len(sequence)} bp），至少需要 23bp')

    cas_key = str(args.get('cas', 'spcas9')).lower()
    if cas_key not in PAM_CONFIG:
        raise ValueError(f'cas 仅支持 {list(PAM_CONFIG.keys())}，收到: {cas_key}')
    pam_cfg = PAM_CONFIG[cas_key]

    gc_min = float(args.get('gc_min', 30))
    gc_max = float(args.get('gc_max', 80))
    max_offtargets = int(args.get('max_offtargets', 10))
    max_mismatches = int(args.get('max_mismatches', 3))
    top_n = int(args.get('top_n', 10))
    guide_len = pam_cfg['guide_len']
    pam_re = pam_cfg['pam_regex']
    pam_pos = pam_cfg['pam_pos']

    candidates = []
    if pam_pos == 'downstream':
        # SpCas9: [20nt guide][PAM NGG]，guide 在 PAM 上游
        for i in range(len(sequence) - guide_len - 2):
            guide = sequence[i:i + guide_len]
            pam = sequence[i + guide_len:i + guide_len + 3]
            if not re.match(pam_re, pam):
                continue
            gc = _calc_gc(guide)
            if not (gc_min <= gc <= gc_max):
                continue
            # off-target 扫描（在整个模板内查）
            offtargets = _count_offtargets(guide, sequence, max_mismatches)
            eff_score = _predict_efficiency_spcas9(guide, pam)
            candidates.append({
                'position': i,
                'strand': '+',
                'guide_sequence': guide,
                'pam': pam,
                'gc_percent': round(gc, 1),
                'efficiency_score': round(eff_score, 1),
                'offtarget_count': len(offtargets),
                'offtargets': offtargets[:5],  # 只返回前 5 个明细
            })
        # - 链：扫描反向互补后的 PAM（即 ref 上找 NGG 然后 - 链 guide 在其上游）
        for i in range(3, len(sequence) - guide_len):
            guide_rc_window = sequence[i - 3:i - 3 + guide_len]
            # 反向：- 链 guide = revcomp(seq[i - guide_len - 3 : i - 3])
            guide = _reverse_complement(sequence[i - guide_len - 3:i - 3])
            pam = _reverse_complement(sequence[i - 3:i])
            if not re.match(pam_re, pam):
                continue
            gc = _calc_gc(guide)
            if not (gc_min <= gc <= gc_max):
                continue
            offtargets = _count_offtargets(guide, sequence, max_mismatches)
            eff_score = _predict_efficiency_spcas9(guide, pam)
            candidates.append({
                'position': i - guide_len - 3,
                'strand': '-',
                'guide_sequence': guide,
                'pam': pam,
                'gc_percent': round(gc, 1),
                'efficiency_score': round(eff_score, 1),
                'offtarget_count': len(offtargets),
                'offtargets': offtargets[:5],
            })
    else:
        # Cas12a/Cas12e: [PAM TTTV][20nt guide]，guide 在 PAM 下游
        for i in range(len(sequence) - 3 - guide_len):
            pam = sequence[i:i + 3]
            guide = sequence[i + 3:i + 3 + guide_len]
            if not re.match(pam_re, pam):
                continue
            gc = _calc_gc(guide)
            if not (gc_min <= gc <= gc_max):
                continue
            offtargets = _count_offtargets(guide, sequence, max_mismatches)
            # Cas12a 无成熟效率预测模型，用简化 GC 评分
            eff_score = 50 + (20 if 40 <= gc <= 70 else -10)
            if _has_poly_run(guide, 5):
                eff_score -= 20
            candidates.append({
                'position': i,
                'strand': '+',
                'guide_sequence': guide,
                'pam': pam,
                'gc_percent': round(gc, 1),
                'efficiency_score': max(0, min(100, eff_score)),
                'offtarget_count': len(offtargets),
                'offtargets': offtargets[:5],
            })
        # - 链
        for i in range(3 + guide_len, len(sequence)):
            guide = _reverse_complement(sequence[i - guide_len:i])
            pam = _reverse_complement(sequence[i - guide_len - 3:i - guide_len])
            if not re.match(pam_re, pam):
                continue
            gc = _calc_gc(guide)
            if not (gc_min <= gc <= gc_max):
                continue
            offtargets = _count_offtargets(guide, sequence, max_mismatches)
            eff_score = 50 + (20 if 40 <= gc <= 70 else -10)
            if _has_poly_run(guide, 5):
                eff_score -= 20
            candidates.append({
                'position': i - guide_len - 3,
                'strand': '-',
                'guide_sequence': guide,
                'pam': pam,
                'gc_percent': round(gc, 1),
                'efficiency_score': max(0, min(100, eff_score)),
                'offtarget_count': len(offtargets),
                'offtargets': offtargets[:5],
            })

    # 排序：效率分降序、off-target 数升序
    candidates.sort(key=lambda c: (-c['efficiency_score'], c['offtarget_count']))
    # 过滤 off-target 超限
    filtered = [c for c in candidates if c['offtarget_count'] <= max_offtargets]

    return {
        'cas': pam_cfg['name'],
        'guide_length': guide_len,
        'total_candidates': len(candidates),
        'passed_filter': len(filtered),
        'recommendations': filtered[:top_n],
        'filter_criteria': {
            'gc_range': [gc_min, gc_max],
            'max_offtargets': max_offtargets,
            'max_mismatches': max_mismatches,
        },
        'note': 'efficiency_score 为基于 GC/末端 poly-run/PAM 的简化预测（0-100，非实验验证）；off-target 扫描针对输入模板，如需全基因组扫描请用 Cas-OFFinder 等专业工具。',
    }


def op_crispr_verify(args):
    """CRISPR 编辑验证：Sanger 测序 trace 比对 → indel/substitution 定量。
    args:
      wild_type: 野生型参考序列（必填）
      edited: 编辑后序列（必填，或 trace_file）
      trace_file: .ab1 测序文件路径（与 edited 二选一）
    返回：alignment + 突变类型 + 频率
    注：纯 indel 检测，不调用 trace 解析（避免额外依赖）。如需 .ab1 解析可后续扩展。
    """
    wt = clean_seq(args.get('wild_type', ''))
    ed = clean_seq(args.get('edited', ''))
    if not wt or not ed:
        raise ValueError('wild_type 与 edited 均必填')

    # 简单全局对齐（Needleman-Wunsch）
    align = _needleman_wunsch(wt, ed)

    # 分析 indel/substitution
    mutations = []
    insertions = 0
    deletions = 0
    substitutions = 0
    i = 0
    aligned_wt, aligned_ed = align['aligned_wt'], align['aligned_ed']
    pos_wt = 0
    while i < len(aligned_wt):
        if aligned_wt[i] == '-':
            insertions += 1
            mutations.append({'type': 'insertion', 'position': pos_wt, 'bases': aligned_ed[i]})
            i += 1
        elif aligned_ed[i] == '-':
            deletions += 1
            mutations.append({'type': 'deletion', 'position': pos_wt, 'bases': aligned_wt[i]})
            pos_wt += 1
            i += 1
        elif aligned_wt[i] != aligned_ed[i]:
            substitutions += 1
            mutations.append({'type': 'substitution', 'position': pos_wt, 'wt': aligned_wt[i], 'ed': aligned_ed[i]})
            pos_wt += 1
            i += 1
        else:
            pos_wt += 1
            i += 1

    return {
        'alignment_length': len(aligned_wt),
        'identity': round(sum(1 for a, b in zip(aligned_wt, aligned_ed) if a == b and a != '-') / max(len(wt), len(ed)) * 100, 2),
        'edit_summary': {
            'insertions': insertions,
            'deletions': deletions,
            'substitutions': substitutions,
            'total_indels': insertions + deletions,
        },
        'editing_efficiency': round((insertions + deletions + substitutions) / max(len(wt), len(ed)) * 100, 2),
        'mutations': mutations[:50],  # 限制返回数量
        'note': '此工具仅做两序列比对。对于 .ab1 trace 文件的峰图解码与编辑频率定量，建议使用第三方工具（CRISPResso2/ICE）或扩展本工具的 trace 解析能力。',
    }


def _needleman_wunsch(s1, s2, match=1, mismatch=-1, gap=-2):
    """经典 Needleman-Wunsch 全局比对。"""
    n, m = len(s1), len(s2)
    # DP matrix
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        dp[i][0] = i * gap
    for j in range(m + 1):
        dp[0][j] = j * gap
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            score_diag = dp[i-1][j-1] + (match if s1[i-1] == s2[j-1] else mismatch)
            score_up = dp[i-1][j] + gap
            score_left = dp[i][j-1] + gap
            dp[i][j] = max(score_diag, score_up, score_left)
    # 回溯
    aligned_wt, aligned_ed = [], []
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0:
            score_diag = dp[i-1][j-1] + (match if s1[i-1] == s2[j-1] else mismatch)
            if dp[i][j] == score_diag:
                aligned_wt.append(s1[i-1])
                aligned_ed.append(s2[j-1])
                i -= 1; j -= 1
                continue
        if i > 0 and dp[i][j] == dp[i-1][j] + gap:
            aligned_wt.append(s1[i-1])
            aligned_ed.append('-')
            i -= 1
        else:
            aligned_wt.append('-')
            aligned_ed.append(s2[j-1])
            j -= 1
    return {'aligned_wt': ''.join(reversed(aligned_wt)), 'aligned_ed': ''.join(reversed(aligned_ed)), 'score': dp[n][m]}
