---
name: bio-proto-restriction-cloning
domain: cloning
inputs: [载体序列 + 插入片段序列 + 目标酶]
outputs: [酶切位点位置、消化片段大小、克隆可行性判断]
requires_network: false
language: python
---

# 限制酶克隆设计协议

**适用场景**：分子克隆——检查目的片段是否含目标酶位点、预测酶切片段大小、验证载体-插入连接方案。

## 步骤

1. 查序列上的酶切位点（语义工具 `bio_seq_restriction` 或本模板）
2. 判断插入片段内部是否被目标酶切割（会被切 = 不可用）
3. 预测消化片段大小（环状 vs 线性影响结果）

## 可执行模板（bio_python）

```python
from Bio.Restriction import RestrictionBatch, CommOnly, EcoRI, BamHI, HindIII, XhoI
from Bio.Seq import Seq

vector = Seq("GAATTC...载体序列...")     # 换成实际序列
insert = Seq("...插入片段...")
enzymes = RestrictionBatch([EcoRI, BamHI, HindIII, XhoI])   # 目标酶

def digest_report(seq, label, linear):
    sites = {}
    for enz in enzymes:
        cuts = enz.search(seq, linear=linear)
        if cuts:
            frags = [cuts[0]] + [b - a for a, b in zip(cuts, cuts[1:])] + [len(seq) - cuts[-1]]
            sites[str(enz)] = {"cuts": [int(c) for c in cuts], "fragments": frags}
    return label, sites

for label, seq, linear in [("vector", vector, False), ("insert", insert, True)]:
    name, sites = digest_report(seq, label, linear)
    for enz, info in sites.items():
        internal = any(0 < c < len(seq) for c in info["cuts"])
        flag = " ⚠️ 内部切割，不可用于该酶克隆" if (label == "insert" and len(info["cuts"]) > 1) else ""
        print(f"{label} {enz}: {len(info['cuts'])} site(s), fragments={info['fragments']}{flag}")
```

## 常见坑

- 环状载体 `linear=False`：切点跨越 origin 的片段计算不同
- 双酶切克隆要两个酶都有位点且插入片段内部**零**切割
- `enz.search` 返回 1-based 切割坐标（切点后第一个碱基的位置），不是识别序列起点，报告时说明坐标体系
- 语义工具 `bio_seq_restriction` 默认查商业常用酶（~700 种），本协议适合自定义酶组合

## 解读要点

- 插入片段内部有目标酶位点 → 换酶或改用同尾酶/无缝克隆
- 载体切出的片段数 = 切点数（环状）+ 1 还是 -1 要对图验证
