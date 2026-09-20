---
name: bio-proto-blast-remote
domain: homology
inputs: [查询序列]
outputs: [BLAST hit 表：描述/长度/E-value/得分]
requires_network: true
language: python
---

# 远程 BLAST 协议（NCBIWWW + 解析）

**适用场景**：序列注释未知时查同源；判断"这段序列是什么"（严谨性要求：序列来源判断必须基于 BLAST 证据）。

## 步骤

1. 选程序：DNA 对 nt 库用 `blastn`；蛋白对蛋白用 `blastp`；DNA 翻译比对用 `blastx`
2. `NCBIWWW.qblast` 提交（约 10s~2min，结果通过 handle 流式返回）
3. `NCBIXML.parse` 解析，取 top hits + 统计描述

## 可执行模板（bio_python）

```python
from Bio.Blast import NCBIWWW, NCBIXML

seq = "ATGAAACGCATTAGCACCACCATTACCAC"  # 换成实际序列（或从文件读）
program, database = "blastn", "nt"     # blastp 配 "nr"；blastx 配 "nr"

print("submitting...")
handle = NCBIWWW.qblast(program, database, seq, hitlist_size=10, expect=10.0)
records = list(NCBIXML.parse(handle))[0]   # 只有一个查询则取第一条

hits = []
for aln in records.alignments[:10]:
    hsp = aln.hsps[0]                      # 每个 hit 取最佳 HSP
    hits.append({
        "accession": aln.accession,
        "title": aln.title[:80],
        "length": aln.length,
        "e_value": hsp.expect,
        "score": hsp.score,
        "identity_pct": round(hsp.identities / hsp.align_length * 100, 1),
        "align_length": hsp.align_length,
    })
result = {"program": program, "database": database, "hits": hits}
print(json.dumps(result, ensure_ascii=False, indent=2))
```

## 常见坑

- qblast 是远程 HTTP 提交，慢且受 NCBI 限流：一次任务只提交 1-2 条查询，批量任务加 `time.sleep(10)`
- **qblast 返回的 handle 是文本流**（`StringIO`，`.read()` 得到 str 非 bytes）——如要写盘保存原始 XML，务必用**文本模式** `open("x.xml", "w")`；用 `wb` 会抛 `TypeError: a bytes-like object is required`（Biopython 1.88 实测）。解析时直接 `NCBIXML.parse(handle)`，无需 read
- `NCBIXML.parse` 返回生成器，`list()[0]` 取第一条查询结果
- 序列太短（<20 nt）blastn 可能无 hit，改用蛋白库或加长序列
- 网络失败会抛 URLError / IncompleteRead：重试一次（sleep 5-10s），仍失败如实报告（不编造 hit）；qblast 提交本身较慢（10s~2min），给足超时
- 查询序列含低复杂度重复（poly-A、串联重复）容易命中假阳性——报告时说明并建议用"低复杂度过滤"或分段查询

## 解读要点

- E-value < 1e-10 才算强同源；identity < 70% 的 hit 只能说"相似"，不能说"就是"
- 命中"uncultured/environmental/vector"类描述要警惕污染
- 结论必须写"BLAST 证据：accession + E-value"，符合科学严谨性约束
