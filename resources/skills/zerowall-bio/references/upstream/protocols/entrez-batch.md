---
name: bio-proto-entrez-batch
domain: database
inputs: [关键词或 accession 列表]
outputs: [序列文件/元数据/FASTA]
requires_network: true
language: python
---

# Entrez 批量数据获取协议（bio_python 版）

**适用场景**：需要批量取序列（几十条以上）、取 GenBank 完整记录、esearch/esummary/efetch 组合流程。**注意**：高频单条查询优先用语义化工具 `bio_entrez_search` / `bio_entrez_fetch`（内置限流缓存），本协议用于它们覆盖不到的批量/组合场景。

## 步骤

1. 设 `Entrez.email`（必做）
2. esearch 拿 ID 列表 → 分批 efetch（每批 ≤ 50 条，批间 sleep 0.4s 合规 3 req/s）
3. 写出 FASTA / 解析元数据

## 可执行模板（bio_python）

```python
from Bio import Entrez, SeqIO
import io, time

Entrez.email = "user@example.com"          # 换成真实邮箱更稳妥

term, db, retmax = "TP53[Gene Name] AND human[Organism]", "nucleotide", 100
handle = Entrez.esearch(db=db, term=term, retmax=retmax)
ids = Entrez.read(handle)["IdList"]
handle.close()
print(f"found {len(ids)} ids")

# 分批 efetch（NCBI 要求每请求 ≤200 条、≥3 req/s 间隔）
records = []
for i in range(0, len(ids), 50):
    batch = ids[i:i+50]
    fh = Entrez.efetch(db=db, id=",".join(batch), rettype="fasta", retmode="text")
    records.extend(list(SeqIO.parse(io.StringIO(fh.read()), "fasta")))
    fh.close()
    time.sleep(0.4)

SeqIO.write(records, "batch.fa", "fasta")
print(f"saved {len(records)} records -> batch.fa")
```

## GenBank 完整记录 + 元数据变体

```python
fh = Entrez.efetch(db="nucleotide", id="NM_007294", rettype="gb", retmode="text")
rec = SeqIO.read(io.StringIO(fh.read()), "genbank")
for f in rec.features[:10]:
    print(f.type, f.location, dict(f.qualifiers).get("gene", ""))
```

## 常见坑

- 不设 email 会被警告甚至限流封禁；bio_python 里**没有**插件内置限流，`time.sleep(0.4)` 自己加
- efetch 的 text 结果用 `io.StringIO` 包成文件对象再喂 SeqIO
- 一次 efetch 不要超 200 条，多了分批
- 429 错误 → 加大 sleep 重试；连续失败停止并报告

## 解读要点

- 下载的序列建议先跑 `seq-qc` 协议确认质量
- 记录 accession 与检索式，保证可复现（配合 bio_log 回溯）
