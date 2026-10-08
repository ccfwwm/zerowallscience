---
name: bio-proto-orf-annotation
domain: annotation
inputs: [DNA 序列]
outputs: [ORF 列表：位置/长度/翻译产物]
requires_network: false
language: python
---

# ORF 预测与注释协议

**适用场景**：新序列找编码区；验证 ORF 是否完整（有起始无终止 = 截断）；比较不同起始密码子策略。

## 步骤

1. 六框扫描（正 3 框 + 负 3 框），找 ATG 起始到终止密码子的完整 ORF
2. 按长度排序，标注完整/截断状态
3. 长 ORF 的翻译产物可送 BLAST 验证（接 blast-remote 协议）

## 可执行模板（bio_python）

```python
from Bio.Seq import Seq

seq = Seq("ATGAAACGCATTAGCACC...TAA")     # 换成实际序列
min_len = 90                              # 最少 30 aa
table = 11                                # 原核用 11，真核默认 1

stop = {"TAA", "TAG", "TGA"}
def find_orfs(s, strand, min_len, table):
    orfs = []
    for frame in range(3):
        i = frame
        while i < len(s) - 2:
            if s[i:i+3] != "ATG":
                i += 3
                continue
            j = i + 3
            while j < len(s) - 2:
                if s[j:j+3] in stop:
                    length = j + 3 - i
                    if length >= min_len:
                        orfs.append({
                            "strand": strand, "frame": frame + 1,
                            "start": i, "end": j + 3, "length_nt": length,
                            "protein": str(s[i:j+3].translate(table=table, to_stop=True)),
                        })
                    break
                j += 3
            i = j if j < len(s) - 2 else i + 3
    return orfs

rc = seq.reverse_complement()
orfs = find_orfs(seq, "+", min_len, table) + find_orfs(rc, "-", min_len, table)
orfs.sort(key=lambda o: -o["length_nt"])
for o in orfs[:10]:
    print(o["strand"], o["start"], "-", o["end"], o["length_nt"], "nt →", o["protein"][:30])

# 完整性检查：最长 ORF 之外，检查是否有起始无终止的长开放框
print("top ORF protein:", orfs[0]["protein"] if orfs else None)
```

## 常见坑

- 默认 ATG 起始会漏掉非标准起始（GTG/TTG，原核常见）——严格分析要扩展
- 密码子表编号：真核 1、细菌/古菌 11、线粒体 2；用错表翻译产物错误
- 语义工具 `bio_seq_find_orf` 只找**最长**一条 ORF；需要全部候选用本协议
- 短 ORF（<30 aa）多为噪声，默认过滤

## 解读要点

- 完整 ORF（ATG…stop）才有注释价值；截断 ORF 可能是测序不完整
- 与 GenBank 已知注释比对位置可交叉验证
