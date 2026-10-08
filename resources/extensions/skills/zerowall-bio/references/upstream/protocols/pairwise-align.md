---
name: bio-proto-pairwise-align
domain: alignment
inputs: [两条序列（DNA 或蛋白）]
outputs: [最优比对、打分、相似度/一致度]
requires_network: false
language: python
---

# 双序列比对协议（PairwiseAligner）

**适用场景**：两条序列相似度评估、突变定位、引物与模板比对、蛋白同源比较。

## 步骤

1. 选模式：DNA 用 global（全长比对）或 local（找保守区）；蛋白一般 local
2. 选打分：DNA 默认 match=2/mismatch=-1；蛋白用 BLOSUM62
3. 取最优比对，算一致度/相似度，定位差异位点

## 可执行模板（bio_python）

```python
from Bio.Align import PairwiseAligner

s1, s2 = "ATGAAACGCATTAGCACC", "ATGAAACGTATTAGCACT"   # 换成实际序列

aligner = PairwiseAligner()
aligner.mode = "global"                      # 或 "local"（局部保守区）
aligner.match_score, aligner.mismatch_score = 2, -1
aligner.open_gap_score, aligner.extend_gap_score = -5, -2

alns = aligner.align(s1, s2)
best = alns[0]                               # 已按分数降序
score, aligned1, aligned2 = best.score, str(best[0]), str(best[1])

# 一致度：同位置相同字符比例
matches = sum(a == b for a, b in zip(aligned1, aligned2) if a != "-" and b != "-")
ident = matches / min(len(s1.replace("-","")), len(s2.replace("-",""))) * 100

# 差异位点（1-based，相对 s1）
diffs = [(i+1, a, b) for i, (a, b) in enumerate(zip(s1, s2)) if a != b]

result = {"score": score, "identity_pct": round(ident, 2), "diff_positions": diffs,
          "aligned1": aligned1, "aligned2": aligned2}
print(json.dumps(result, ensure_ascii=False, indent=2))
```

## 蛋白比对变体

```python
from Bio.Align import PairwiseAligner, substitution_matrices
aligner = PairwiseAligner()
aligner.mode = "local"
aligner.substitution_matrix = substitution_matrices.load("BLOSUM62")
```

## 常见坑

- 分数是相对值：不同打分参数之间不可比，报告时注明参数
- DNA 局部比对短序列可能空比对（分数 ≤ 0），先试 global
- `best[0]`/`best[1]` 是含 gap 的对齐串；算一致度要排除 gap 列再归一化
- 旧 API `Bio.pairwise2` 已废弃，不要用

## 解读要点

- 一致度 > 90%（DNA）基本可判定同源/同一序列；30-60% 需结合蛋白层面（BLOSUM62 分数）
- 差异位点位置是 1-based 坐标，可直接对应到 GenBank 记录
