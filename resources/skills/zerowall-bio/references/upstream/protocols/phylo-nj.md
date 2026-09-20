---
name: bio-proto-phylo-nj
domain: phylogenetics
inputs: [多序列比对文件]
outputs: [距离矩阵、NJ/UPGMA 树、树文件]
requires_network: false
language: python
---

# 系统发育树构建协议（距离法）

**适用场景**：从 MSA 构建进化树（NJ/UPGMA）、读取 Newick 树做操作（剪枝/重根/画图）。

## 步骤

1. 读 MSA（用 msa-consensus 协议先检查比对质量）
2. 算距离矩阵（DNA 用 identity，蛋白用 BLOSUM62）
3. NJ（或 UPGMA）建树，写出 Newick

## 可执行模板（bio_python）

```python
from Bio import AlignIO, Phylo
from Bio.Phylo.TreeConstruction import DistanceCalculator, DistanceTreeConstructor
from Bio.Align import substitution_matrices
import io

msa = AlignIO.read("aln.fa", "fasta")          # 换成实际比对文件

calculator = DistanceCalculator("identity")     # DNA 用 identity
dist_matrix = calculator.get_distance(msa)

constructor = DistanceTreeConstructor()
tree = constructor.nj(dist_matrix)              # 或 .upgma(dist_matrix)

Phylo.write(tree, "tree.nwk", "newick")
print("tree saved -> tree.nwk")
print("terminals:", [t.name for t in tree.get_terminals()][:10])
print("total branch length:", round(tree.total_branch_length(), 4))
```

## 树操作变体

```python
tree = Phylo.read("tree.nwk", "newick")
tree.root_with_outgroup("seq_outgroup")         # 用外群重根
tree.prune("seq_to_remove")                     # 剪掉一条
print(tree)
```

## 常见坑

- NJ 要求无重复序列名，重复名会报错；先检查 ID 唯一
- 距离矩阵用 identity 时，gap 列按不同碱基计——比对里 gap 太多的序列先剔除
- `Phylo.write` 需要文件路径（不是已打开的 handle 的 content）
- 画图用 `Phylo.draw(tree)`（matplotlib 未装时用 `Phylo.draw_ascii(tree)`）

## 解读要点

- 分支支持度（bootstrap）距离法本身不提供，需要额外重采样——报告时说明
- 树只是假设：距离法假设恒定演化速率，长枝吸引会误导拓扑
