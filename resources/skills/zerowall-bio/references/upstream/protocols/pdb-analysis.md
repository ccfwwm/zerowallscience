---
name: bio-proto-pdb-analysis
domain: structure
inputs: [PDB 文件（本地或按 ID 下载）]
outputs: [原子/残基信息、距离计算、结构比对 RMSD]
requires_network: false
language: python
---

# 蛋白结构分析协议（Bio.PDB）

**适用场景**：残基间距离、活性位点几何、两条结构叠加 RMSD、链间界面分析。

## 步骤

1. 解析 PDB（`PDBParser`，QUIET 模式抑制警告）
2. 按链/残基遍历，算原子距离
3. 需要时用 `Superimposer` 叠加两结构算 RMSD

## 可执行模板（bio_python）

```python
from Bio.PDB import PDBParser, Superimposer
import numpy as np

parser = PDBParser(QUIET=True)
s = parser.get_structure("s", "1abc.pdb")       # 换成实际 PDB 路径或下载的文件

# 残基距离：链 A 残基 10 与链 B 残基 25 的 CA 距离
res1 = s[0]["A"][10]
res2 = s[0]["B"][25]
d = res1["CA"] - res2["CA"]
print(f"CA distance A10-B25: {d:.2f} Å")

# 活性位点周围 5 Å 内的残基
center = s[0]["A"][15]["CA"]
nearby = []
for res in s[0]["A"]:
    if res.id[0] != " ":                     # 跳过水/异源残基
        continue
    if "CA" in res:
        if (res["CA"] - center) < 5.0:
            nearby.append((res.id[1], res.resname))
print("within 5A:", nearby)

# 两结构叠加 RMSD
s2 = parser.get_structure("s2", "1xyz.pdb")
fixed_atoms = [a for a in s[0].get_atoms() if a.name == "CA"]
moving_atoms = [a for a in s2[0].get_atoms() if a.name == "CA"]
n = min(len(fixed_atoms), len(moving_atoms))
sup = Superimposer()
sup.set_atoms(fixed_atoms[:n], moving_atoms[:n])
sup.apply(s2[0].get_atoms())
print(f"RMSD over {n} CA atoms: {sup.rms:.2f} Å")
```

## 常见坑

- PDB 残基编号有插入码（如 15A）：`res.id = (hetflag, 15, "A")`，直接 `[15]` 会 KeyError
- 水分子/配体的 hetflag 非空，遍历时先 `res.id[0] == " "` 过滤
- Superimposer 要求两组原子一一对应且顺序一致，先按 CA 提取
- 缺电子密度区没有原子，`"CA" in res` 检查防 KeyError
- 按 PDB ID 下载结构用 `PDBList().retrieve_pdb_file(id, pdir="pdb_data", file_format="pdb")`（返回含 `.ent` 后缀的旧格式文件；新版默认 mmCIF，需传 `file_format="pdb"` 或改用 `MmCIFParser`）
- ⚠️ **ResidueDepth 依赖外部 `msms` 二进制，DSSP 依赖 `dssp/mkdssp`**：插件环境不预装这些外部程序，`Bio.PDB.ResidueDepth` / `Bio.PDB.DSSP` 会直接抛错。**回退方案**：① 深度估算用 SASA 表面距离法——`Bio.PDB.SASA.ShrakeRupley`（Biopython 自带，无需第三方 freesasa）或简化原子到表面原子距离；② 二级结构从 PDB 文件自带的 HELIX/SHEET 记录读取，或 `cif` 注解（不要假设 DSSP 可用）。
- 可视化用 matplotlib（已随环境预装）：`matplotlib.use("Agg")` 无显示后端，CA 轨迹 3D 散点/折线即可输出 PNG。

## 解读要点

- 距离 < 3.5 Å 通常视为直接相互作用（氢键/范德华接触）
- RMSD < 2 Å 视为高度相似构象；报告时注明用的原子集合
- 二级结构组成（螺旋/折叠/卷曲比例）应写明确数据来源（PDB HELIX/SHEET 记录 vs DSSP 计算），两者口径可能不同
