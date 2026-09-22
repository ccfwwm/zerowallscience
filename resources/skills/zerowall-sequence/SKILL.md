---
name: zerowall-sequence
description: 查看核酸 FASTA/GenBank 和注释图谱，执行翻译、限制酶、SpCas9 候选、精确 PCR、Gibson 与 Golden Gate 模拟并导出可溯源产物。
metadata:
  zerowall:
    schema_version: 1
    version: 7.0.0-3
    source: bundled
---

# 序列查看与分析

发现并调用 `science_viewer`；工具使用当前会话绑定项目，不接受模型指定另一个项目或会话。普通查看和基础序列操作不要求创建研究或批准科研门禁。


## 实际操作

1. `science_viewer({"action":"list"})` 获取已登记资产和持久视图。远程文件先通过现有 `r_files` 取回并登记本地资产；不编造资产 ID。
2. `science_viewer({"action":"open","asset_id":"返回的资产ID"})` 打开核酸 FASTA/GenBank，取得 `viewer.id`、`viewer.version`、输入 SHA-256 和序列窗口。恢复已有视图用 `read` 加 `viewer_id`。GenBank 返回拓扑、注释分段和未映射注释警告；不得把 unsupported location 当作不存在注释。
3. 选择区域用 `save`，携带 `viewer_id`、`expected_revision` 及完整 `state`。`recordIndex` 从 0 开始；`start`、`selectionStart`、`selectionEnd` 从 1 开始且包含末端；`count` 是窗口长度。例如 `{"recordIndex":0,"start":1,"count":2400,"selectionStart":1,"selectionEnd":120}`，末端不得超过实际长度。
4. `analyze` 携带最新 `expected_revision`，`operation` 为 `reverse-complement`、`translate`、`restriction` 或 `crispr`。解释真实返回的结果，不自行补写数值或位点。CRISPR 可传 `crispr_target`（20 个明确 A/C/G/T）和 `crispr_max_mismatches`（0–3）；不传 target 表示枚举候选，不是脱靶验证。
5. `export` 使用同样参数重新计算并登记 Artifact，保存 `result.json` 和适用时的 `sequence.fasta`。引用返回的 Artifact ID、URI 和输入/输出哈希。产物存在不等于科学主张获得批准。

版本冲突先重新读取，再决定采用哪个选择，不无条件覆盖。源文件哈希改变后必须打开新视图，旧版本保留。

## 已实现范围与解释

- UTF-8 核酸 FASTA：最大 16 MiB、最多 10,000 条记录；窗口最多 10,000 碱基，分析选择最多 100,000 碱基。整基因组需要另外的索引工作流。
- 支持 IUPAC 模糊碱基；GC 百分比以确定的 A/C/G/T/U 为分母，全模糊时为未知。
- 翻译采用标准遗传密码表，自选择区域第一个碱基开始；不查找 ORF。终止为 `*`，不确定密码子为 `X`，不完整尾端不翻译。不适用于线粒体等非标准密码表。
- 酶切仅匹配 EcoRI、BamHI、HindIII、NotI、XhoI 的精确 DNA 位点；报告原记录坐标和正链切口。只处理线性选择区域，不模拟环状接头、甲基化、酶切效率或片段组装。
- GenBank 核验 LOCUS/ORIGIN 长度、字母、行坐标和注释范围；支持精确/部分边界、join/complement 分段，最多 20,000 条注释，交互图谱最多显示前 500 条。跨 accession、order 和碱基间位置保留警告。环形/线性布局可通过 state.mapMode 保存；布局不改变序列拓扑。点击分段注释选择其外边界，不自动拼接外显子或跨原点序列，不据此自动翻译 CDS。
- SpCas9/NGG 在源文件固定 SHA-256 的当前选区检索，坐标是源记录中包含 guide/PAM 的 23 bp 区间。未知 N 窗口跳过并报告覆盖限制；不将 N 视作精确匹配。它不是固定参考基因组的全基因组脱靶评估，不预测编辑效率。
- PCR/Gibson/Golden Gate 的参数见下；自动引物设计、热力学评估与整基因组索引搜索仍未接入，不能宣称已经执行。

## 构建模拟

相关操作仍为 `analyze` 或 `export`，`operation` 使用 `pcr/gibson/golden-gate`，`sequence_options` 为真实 schema 所声明的 JSON 字符串。运行前读取源记录与拓扑，不猜测序列、不自动为用户挑选引物或拼接方向。

- `pcr`：`forwardPrimer`、`reversePrimer` 都按 5′→3′ 提供，`forwardAnnealLength/reverseAnnealLength` 指定 3′ 退火长度（12–120，省略为全长）；余下 5′ 尾进入产物。`templateTopology` 为 `linear/circular`，环状必须选择整条记录；`maxProductLength` 24–100000。仅接受 A/C/G/T、各定向退火位点唯一的精确匹配；拒绝多解，不挑选“最好”产物。
- `gibson`：`fragments` 显式指定同文件记录顺序，如 `[{"recordIndex":0,"reverseComplement":false},{"recordIndex":1,"reverseComplement":true}]`；2–12 个不同线性片段，每片段≤100000 bp，总量≤500000 bp。`minimumOverlap` 12–80（默认20），`productTopology` 为 `linear/circular`（默认圆形）。只认可选定方向下唯一末端同源，不自动重排或修复。
- `golden-gate`：同样显式片段列表，`enzyme` 为 `BsaI/BsmBI`，只允许圆形产物。每片段必须恰有一正一反、向内的 Type IIS 位点，无内部位点；4 nt 末端须依序兼容，无重复、自互补或反向互补竞争。禁止忽略新建圆形接头上的酶位点。

模拟输出 `simulation` 包括固定算法版本、实际参数、源记录号、产物拓扑/长度、接头及引物位点。Gibson/Golden Gate 使用所选文件内完整记录，当前碱基选区不决定拼接输入。源文件哈希绑定所有记录，导出 JSON 和 FASTA 不覆盖原始序列。结果只代表所声明子集的计算构建，不代表引物特异性、反应效率或实验构建成功。


GenBank 注释解析已使用独立 Biopython 参考和合成数据核对；不等于任意真实记录、全基因组、实验成功或临床安全性已经验证。
