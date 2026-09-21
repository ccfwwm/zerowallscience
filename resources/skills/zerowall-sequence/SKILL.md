---
name: zerowall-sequence
description: 在 ZeroWall 中查看已登记核酸 FASTA、选择区域、反向互补、翻译、五种限制酶位点分析，并导出可溯源产物。
---

# 序列查看与分析

发现并调用 `science_viewer`；工具使用当前会话绑定项目，不接受模型指定另一个项目或会话。普通查看和基础序列操作不要求创建研究或批准科研门禁。


## 实际操作

1. `science_viewer({"action":"list"})` 获取已登记资产和持久视图。远程文件先通过现有 `r_files` 取回并登记本地资产；不编造资产 ID。
2. `science_viewer({"action":"open","asset_id":"返回的资产ID"})` 打开核酸 FASTA，取得 `viewer.id`、`viewer.version`、输入 SHA-256 和序列窗口。恢复已有视图用 `read` 加 `viewer_id`。
3. 选择区域用 `save`，携带 `viewer_id`、`expected_revision` 及完整 `state`。`recordIndex` 从 0 开始；`start`、`selectionStart`、`selectionEnd` 从 1 开始且包含末端；`count` 是窗口长度。例如 `{"recordIndex":0,"start":1,"count":2400,"selectionStart":1,"selectionEnd":120}`，末端不得超过实际长度。
4. `analyze` 携带最新 `expected_revision`，`operation` 为 `reverse-complement`、`translate` 或 `restriction`。解释真实返回的结果，不自行补写数值或位点。
5. `export` 使用同样参数重新计算并登记 Artifact，保存 `result.json` 和适用时的 `sequence.fasta`。引用返回的 Artifact ID、URI 和输入/输出哈希。产物存在不等于科学主张获得批准。

版本冲突先重新读取，再决定采用哪个选择，不无条件覆盖。源文件哈希改变后必须打开新视图，旧版本保留。

## 已实现范围与解释

- UTF-8 核酸 FASTA：最大 16 MiB、最多 10,000 条记录；窗口最多 10,000 碱基，分析选择最多 100,000 碱基。整基因组需要另外的索引工作流。
- 支持 IUPAC 模糊碱基；GC 百分比以确定的 A/C/G/T/U 为分母，全模糊时为未知。
- 翻译采用标准遗传密码表，自选择区域第一个碱基开始；不查找 ORF。终止为 `*`，不确定密码子为 `X`，不完整尾端不翻译。不适用于线粒体等非标准密码表。
- 酶切仅匹配 EcoRI、BamHI、HindIII、NotI、XhoI 的精确 DNA 位点；报告原记录坐标和正链切口。只处理线性选择区域，不模拟环状接头、甲基化、酶切效率或片段组装。
- GenBank 注释、引物、PCR、Gibson/Golden Gate、CRISPR 搜索尚未接入此工具，不宣称已经执行。未来 CRISPR 首版限定 SpCas9/NGG、固定参考版本及最多三错配，并报告搜索限制。


## 7.0.0 additions

The local viewer accepts bounded GenBank ORIGIN records and preserves basic feature coordinates. The `crispr` operation searches SpCas9 protospacers with NGG PAMs in the selected reference and allows 0–3 mismatches against an explicitly supplied 20-base target. This is a candidate locator only; it is not a genome-wide off-target or editing-efficiency assessment. PCR, Gibson/Golden Gate simulation and indexed genome search remain separate capabilities.
