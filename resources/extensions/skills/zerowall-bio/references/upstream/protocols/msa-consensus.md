---
name: bio-proto-msa-consensus
domain: alignment
inputs: [多序列比对文件（fasta/clustal/stockholm）]
outputs: [比对概况、保守性、consensus 序列]
requires_network: false
language: python
---

# 多序列比对解析与保守性协议

**适用场景**：已有 MSA 文件（Clustal/MUSCLE/MAFFT 输出），分析保守位点、生成 consensus、评估序列间差异。

## 步骤

1. `Bio.AlignIO` 读入比对（注意它是生成器）
2. 按列统计保守性（完全保守 / 半保守位点比例）
3. 手工生成 consensus（版本无关，不用已废弃的 dumb_consensus）
4. 需要时提取保守区段（连续高保守列）

## 可执行模板（bio_python）

```python
from Bio import AlignIO
from collections import Counter

msa = list(AlignIO.parse("aln.fa", "fasta"))[0]     # 或 "clustal"/"stockholm"
n_seq, n_col = len(msa), msa.get_alignment_length()

def column(msa, i):
    return "".join(r.seq[i] for r in msa)

conserved = 0
consensus = []
for i in range(n_col):
    chars = [c.upper() for c in column(msa, i) if c != "-"]
    if not chars:
        consensus.append("-")
        continue
    top, cnt = Counter(chars).most_common(1)[0]
    if cnt == len(chars):          # 完全保守（忽略 gap）
        conserved += 1
    consensus.append(top)

result = {
    "sequences": n_seq, "length": n_col,
    "fully_conserved_pct": round(conserved / n_col * 100, 2),
    "consensus": "".join(consensus),
}
print(json.dumps(result, ensure_ascii=False, indent=2))

# 保守区段：连续 ≥10 列完全保守的区间
runs, start = [], None
for i in range(n_col):
    chars = {c.upper() for c in column(msa, i) if c != "-"}
    is_con = len(chars) == 1
    if is_con and start is None: start = i
    if not is_con and start is not None:
        if i - start >= 10: runs.append((start+1, i))
        start = None
print("conserved_regions(1-based):", runs)
```

## 常见坑

- `AlignIO.parse` 返回生成器，即使文件只有一个比对也要 `list()[0]` 或 `AlignIO.read`
- 列统计要把 `-` 排除，否则 gap 参与计数会低估保守性
- consensus 大写化后输出，避免大小写不一致导致假"不保守"
- `SummaryInfo.dumb_consensus()` 在新版已废弃，用上面的 Counter 方案

## 解读要点

- 完全保守位点常对应功能关键残基（催化位点、结合位点）
- 保守区段 → 可用于设计 PCR 引物 / 保守 motif 提取
