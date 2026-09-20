---
name: bio-proto-seq-qc
domain: sequence-qc
inputs: [FASTA/FASTQ 序列文件]
outputs: [统计表：长度/GC/N比例/碱基组成]
requires_network: false
language: python
---

# 序列质控协议（读文件 → 统计 → 判断）

**适用场景**：拿到一批新序列（测序 contig、下载的基因组片段、引物集合），先摸清数据质量再往下分析。

## 步骤

1. 用 `bio_seq_io_read` 快速看记录数/长度概况
2. 用 `bio_python` 跑完整统计：长度分布、GC、N 比例、碱基组成
3. 对照阈值判断质量：N 比例 > 5% 或极短序列要标记

## 可执行模板（bio_python）

```python
from Bio import SeqIO
from Bio.SeqUtils import gc_fraction
from collections import Counter

path = "seqs.fa"  # 换成实际路径
records = list(SeqIO.parse(path, "fasta"))

lengths = [len(r.seq) for r in records]
gc = [gc_fraction(r.seq) for r in records]
n_frac = [r.seq.upper().count("N") / len(r.seq) for r in records]
base_comp = Counter()
for r in records:
    base_comp.update(str(r.seq).upper())

result = {
    "count": len(records),
    "total_bp": sum(lengths),
    "len_min": min(lengths), "len_max": max(lengths), "len_avg": round(sum(lengths)/len(lengths), 1),
    "gc_min": round(min(gc)*100, 2), "gc_max": round(max(gc)*100, 2), "gc_avg": round(sum(gc)/len(gc)*100, 2),
    "n_total": round(sum(n_frac)/len(n_frac)*100, 2),
    "base_composition": dict(base_comp),
    "flagged": [r.id for r, n in zip(records, n_frac) if n > 0.05],  # N>5% 的序列
}
print(json.dumps(result, ensure_ascii=False, indent=2))
```

## 常见坑

- `SeqIO.parse` 是生成器，多轮统计先 `list()`
- 大小写混合时先 `.upper()` 再数 N
- 大文件（>1GB）不要 `list()`，改流式单遍循环累加统计量
- GC 用 `gc_fraction()`（Biopython ≥1.88 移除了旧名 `GC()`）

## 解读要点

- N 比例高 → 组装不完整或低质量区段，后续分析（ORF/比对）会受影响
- GC 异常（如 <30% 或 >70%）提示可能的污染（如质粒 vs 宿主）
- 极短序列 → 可能是接头/引物残留
