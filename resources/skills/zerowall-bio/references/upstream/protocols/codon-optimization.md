---
name: bio-proto-codon-optimization
domain: codon-usage
inputs: [蛋白序列 + 目标物种密码子频率表]
outputs: [密码子使用统计、优化后的 DNA 序列]
requires_network: false
language: python
---

# 密码子使用与优化协议

**适用场景**：异源表达前优化密码子；分析某基因的密码子偏好是否符合宿主；计算 CAI。

## 步骤

1. 翻译框架检查（蛋白长度 = DNA/3）
2. 统计当前序列密码子频率 vs 宿主频率表
3. 按"宿主最高频密码子"回译生成优化序列

## 可执行模板（bio_python）

```python
from Bio.Seq import Seq
from Bio.Data import CodonTable
from collections import Counter

protein = Seq("MKTAYIAKQRQISFVKSHFSRQDILDLW")     # 换成实际蛋白序列
codon_freq = {   # 目标宿主高频密码子表（示例：大肠杆菌部分氨基酸）
    "A": "GCG", "R": "CGT", "N": "AAC", "D": "GAT", "C": "TGC",
    "Q": "CAG", "E": "GAA", "G": "GGC", "H": "CAC", "I": "ATT",
    "L": "CTG", "K": "AAA", "M": "ATG", "F": "TTC", "P": "CCG",
    "S": "AGC", "T": "ACC", "W": "TGG", "Y": "TAT", "V": "GTG", "*": "TAA",
}
optimized = Seq("".join(codon_freq.get(aa, "NNN") for aa in str(protein)))
print("optimized DNA:", optimized)
print("length check:", len(optimized), "nt =", len(protein), "aa x 3")

# 现有基因的密码子使用统计
dna = Seq("ATGAAAACCGCGTAT...")                  # 换成实际 CDS
usage = Counter(str(dna[i:i+3]) for i in range(0, len(dna) - 2, 3))
total = sum(usage.values())
print("codon usage:", {k: round(v/total, 3) for k, v in usage.most_common(10)})
```

## CAI 计算变体（需要参考基因集时）

```python
from Bio.SeqUtils import CodonUsage
# 完整 CAI 需要宿主高表达基因集；简单场景用上面的频率表足够
```

## 常见坑

- 蛋白序列含 "*"（终止）时回译成 TAA，通常保留 1 个终止密码子即可
- 频率表不同宿主差别大（人 vs 大肠杆菌 vs 酵母），拿错表优化适得其反
- 优化后**必须**回译验证：`optimized.translate() == protein`
- 注意排除稀有酶切位点：优化产物里若引入目标克隆酶位点要避开

## 解读要点

- 密码子适应指数（CAI）< 0.5 通常意味着表达量可能受限
- 稀有密码子簇（如 E. coli 的 AGG/AGA 连续出现）比单个稀有密码子影响更大
