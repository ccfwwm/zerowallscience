---
name: bio-proto-format-convert
domain: sequence-io
inputs: [序列文件（任意 Biopython 支持格式）]
outputs: [转换后的文件 + 记录数]
requires_network: false
language: python
---

# 序列格式批量转换协议（流式，大文件安全）

**适用场景**：FASTA ↔ GenBank ↔ EMBL ↔ FASTQ 互转；批量提取子序列；过滤短序列。

## 步骤

1. 确认输入格式与目标格式（扩展名推断或显式指定）
2. 流式 `SeqIO.parse` → `SeqIO.write`（不用 list，内存安全）
3. 需要过滤时加条件（长度、ID 匹配、物种）

## 可执行模板（bio_python）

```python
from Bio import SeqIO

src, dst = "input.gbk", "output.fa"       # 换成实际路径
fmt_in, fmt_out = "genbank", "fasta"      # 可改为 embl/fastq 等

def keep(rec):
    """过滤条件：示例为长度 >= 200。按需修改。"""
    return len(rec.seq) >= 200

kept = (r for r in SeqIO.parse(src, fmt_in) if keep(r))
n = SeqIO.write(kept, dst, fmt_out)
print(f"converted {n} records -> {dst}")
```

## 变体：只提取指定 ID

```python
wanted = {"seq1", "seq3"}
with open("subset.fa", "w") as out:
    n = SeqIO.write((r for r in SeqIO.parse("all.fa", "fasta") if r.id in wanted), out, "fasta")
print(f"subset {n} records")
```

## 常见坑

- 生成器 + `SeqIO.write` 才是流式；`list()` 会把整文件吃进内存
- FASTA 转 GenBank 会丢失 features（GenBank 是注解格式，纯序列转过去 features 为空，属正常）
- FASTQ 转 FASTA 会丢质量值，下游组装/变异软件不要用
- 输出文件已存在会被覆盖，先确认路径

## 解读要点

- 转换后核对记录数一致（如过滤，则等于满足条件的数量）
- GenBank → FASTA 时 header 会变（description 字段拼接），比对软件一般只看 ID
