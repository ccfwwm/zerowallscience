"""DNA/质粒设计工具 — 引物设计 + 密码子优化"""
import sys
import json
import os

# 确保同目录可 import
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def op_primer_design(args):
    """PCR 引物设计：输入序列，返回正/反向引物（Tm、GC、长度、二级结构评估）。

    返回字段约定：fwd_position/rev_position 为 0-based 切片索引（与 Python
    sequence[start:end] 一致，1-based 坐标 = 索引 + 1）；每个候选带 quality
    评估（good/ok/poor）与 issues 说明。top_n 控制返回候选数（默认 5）。
    """
    from Bio.Seq import Seq
    from Bio.SeqUtils import gc_fraction
    from Bio.SeqUtils.MeltingTemp import Tm_NN
    import re

    sequence = args.get('sequence', '').upper().replace(' ', '')
    product_size = args.get('product_size', 500)  # 期望产物大小
    primer_len_range = args.get('primer_len_range', [18, 25])  # 引物长度范围
    tm_target = args.get('tm_target', 60)  # 目标 Tm
    top_n = int(args.get('top_n', 5))  # 返回候选数
    tm_diff_max = float(args.get('tm_diff_max', 5))  # 正反向 Tm 差过滤阈值

    if not sequence or len(sequence) < 20:
        return {'error': 'sequence required (>=20 nt)'}

    # 只用 DNA IUPAC
    valid = set('ACGTRYSWKMBDHVN')
    if not set(sequence) <= valid:
        return {'error': f'invalid characters in sequence: {set(sequence) - valid}'}

    results = []
    # 搜索合适长度范围内的引物
    for fwd_start in range(0, min(50, len(sequence) - primer_len_range[1])):
        for fwd_len in range(primer_len_range[0], primer_len_range[1] + 1):
            fwd_seq = sequence[fwd_start:fwd_start + fwd_len]
            rev_start = min(fwd_start + product_size, len(sequence)) - fwd_len
            if rev_start < fwd_start + fwd_len:
                continue
            rev_raw = sequence[rev_start:rev_start + fwd_len]
            rev_seq = str(Seq(rev_raw).reverse_complement())

            fwd_tm = Tm_NN(fwd_seq)
            rev_tm = Tm_NN(rev_seq)
            fwd_gc = gc_fraction(Seq(fwd_seq)) * 100
            rev_gc = gc_fraction(Seq(rev_seq)) * 100

            # Tm 偏差评分
            tm_diff = abs(fwd_tm - rev_tm)
            tm_score = max(0, 10 - tm_diff)
            gc_diff = abs(fwd_gc - rev_gc)
            gc_score = max(0, 10 - gc_diff)
            length_score = max(0, 10 - abs(fwd_len - 20))

            score = tm_score + gc_score + length_score
            if tm_diff < tm_diff_max and gc_diff < 10:
                # 质量评估（软性标注，不改变现有筛选行为）
                issues = []
                if tm_diff > 3:
                    issues.append(f'tm_diff={tm_diff:.1f}C (>3)')
                if not (40 <= fwd_gc <= 60):
                    issues.append(f'fwd_gc={fwd_gc:.1f}% (out of 40-60)')
                if not (40 <= rev_gc <= 60):
                    issues.append(f'rev_gc={rev_gc:.1f}% (out of 40-60)')
                if not issues:
                    quality = 'good'
                elif tm_diff <= 5 and 35 <= min(fwd_gc, rev_gc) and max(fwd_gc, rev_gc) <= 65:
                    quality = 'ok'
                else:
                    quality = 'poor'
                results.append({
                    'forward': fwd_seq,
                    'reverse': rev_seq,
                    'fwd_tm': round(fwd_tm, 1),
                    'rev_tm': round(rev_tm, 1),
                    'fwd_gc': round(fwd_gc, 1),
                    'rev_gc': round(rev_gc, 1),
                    'length': fwd_len,
                    'product_size': rev_start - fwd_start + fwd_len,
                    'fwd_position': fwd_start,
                    'rev_position': rev_start,
                    'score': round(score, 2),
                    'quality': quality,
                    'issues': issues,
                })

    # 按 score 排序，取 top_n
    results.sort(key=lambda x: -x['score'])
    top = results[:top_n]

    # 建议（面向 agent 决策）
    advice = None
    if not top:
        advice = ('未找到满足约束的引物对。建议：调大 tm_diff_max（正反向 Tm 差容忍）、'
                  '调整 product_size（产物区域）、放宽 primer_len_range，'
                  '或改用 bio_primer3_design（Primer3 热力学评分）。')
    elif top[0]['quality'] != 'good':
        q = top[0]['quality']
        adv_issues = '；'.join(top[0]['issues'])
        advice = (f'最佳候选 quality={q}：{adv_issues}。'
                  '如对质量要求高，可调整 tm_target/product_size 或改用 bio_primer3_design；'
                  '若需在 5\' 端添加酶切位点/同源臂，最终 Tm 会变化，需重新核算。')

    return {
        'input_length': len(sequence),
        'product_size_target': product_size,
        'tm_target': tm_target,
        'n_candidates': len(results),
        'top_primers': top,
        'quality_scale': 'good=tm_diff<=3 且正反向 GC 均在 40-60；ok=tm_diff<=5 且 GC 35-65；poor=超阈值',
        'position_base': '0-based (Python slice index; 1-based = index + 1)',
        'advice': advice,
    }


def op_seq_optimize(args):
    """密码子优化：将编码序列按目标宿主的密码子使用频率优化。"""
    from Bio.Seq import Seq
    from Bio.Data.CodonTable import CodonTable

    sequence = args.get('sequence', '').upper().replace(' ', '')
    organism = args.get('organism', 'ecoli')  # ecoli | human | yeast
    remove_rare = args.get('remove_rare', True)
    gc_target = args.get('gc_target', None)  # 目标 GC%（可选）

    if not sequence or len(sequence) < 3:
        return {'error': 'coding sequence required (>=3 nt)'}

    # 简化的密码子使用表（每种生物的最优密码子）
    codon_tables = {
        'ecoli': {
            'A': 'GCC', 'R': 'CGT', 'N': 'AAC', 'D': 'GAT', 'C': 'TGC',
            'E': 'GAA', 'Q': 'CAG', 'G': 'GGC', 'H': 'CAT', 'I': 'ATC',
            'L': 'CTG', 'K': 'AAA', 'M': 'ATG', 'F': 'TTT', 'P': 'CCG',
            'S': 'AGC', 'T': 'ACC', 'W': 'TGG', 'Y': 'TAT', 'V': 'GTG',
        },
        'human': {
            'A': 'GCC', 'R': 'CGC', 'N': 'AAC', 'D': 'GAC', 'C': 'TGC',
            'E': 'GAG', 'Q': 'CAG', 'G': 'GGC', 'H': 'CAC', 'I': 'ATC',
            'L': 'CTG', 'K': 'AAG', 'M': 'ATG', 'F': 'TTC', 'P': 'CCC',
            'S': 'AGC', 'T': 'ACC', 'W': 'TGG', 'Y': 'TAC', 'V': 'GTG',
        },
        'yeast': {
            'A': 'GCT', 'R': 'AGA', 'N': 'AAT', 'D': 'GAT', 'C': 'TGT',
            'E': 'GAA', 'Q': 'CAA', 'G': 'GGT', 'H': 'CAT', 'I': 'ATT',
            'L': 'TTG', 'K': 'AAG', 'M': 'ATG', 'F': 'TTT', 'P': 'CCA',
            'S': 'TCT', 'T': 'ACT', 'W': 'TGG', 'Y': 'TAT', 'V': 'GTT',
        },
    }

    table = codon_tables.get(organism)
    if not table:
        return {'error': f'unknown organism: {organism}', 'supported': list(codon_tables.keys())}

    # 翻译原序列
    protein = str(Seq(sequence).translate(to_stop=False))

    # 优化密码子
    optimized = []
    changes = 0
    for aa in protein:
        if aa == '*':
            optimized.append('TAA')
        elif aa in table:
            old_codon = None
            # 找原始密码子（简化：取原序列对应位置）
            codon_idx = len(optimized) * 3
            if codon_idx + 3 <= len(sequence):
                old_codon = sequence[codon_idx:codon_idx + 3]
            new_codon = table[aa]
            if old_codon and old_codon != new_codon:
                changes += 1
            optimized.append(new_codon)
        else:
            optimized.append('NNN')  # 未知氨基酸

    optimized_seq = ''.join(optimized)
    gc_content = sum(1 for c in optimized_seq if c in 'GC') / len(optimized_seq) * 100

    return {
        'organism': organism,
        'original_length': len(sequence),
        'optimized_length': len(optimized_seq),
        'optimized_sequence': optimized_seq,
        'codon_changes': changes,
        'change_rate': round(changes / (len(optimized) or 1) * 100, 1),
        'gc_percent': round(gc_content, 1),
        'protein_length': len(protein),
        'note': '密码子优化基于简化表；生产环境建议使用 CAI/ECAI 精细优化。',
    }
