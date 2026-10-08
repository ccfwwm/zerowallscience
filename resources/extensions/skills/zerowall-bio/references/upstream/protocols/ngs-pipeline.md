---
name: bio-proto-ngs-pipeline
domain: sequencing
inputs: [FASTQ/BAM 文件或 GEO/SRA 登录号, 参考基因组]
outputs: [表达矩阵 / VCF / peak 文件, MultiQC 质控报告, 流程日志]
requires_network: true
language: mixed
---

# NGS 流程协议（nf-core / Nextflow 重型流水线）

**适用场景**：批量测序数据的标准化分析——RNA-seq 表达定量与差异分析、WGS/WES 变异检出、
ATAC-seq 染色质可及性。数据可以是本地 FASTQ/BAM，也可以是从 GEO/SRA 下载的公开数据。

**⚠️ 本协议与其他协议的定位差异**：nf-core 流程是需要 Docker + Java + Nextflow、
单次运行数小时、输出数十 GB 的**重型外部流水线**，不是本插件的语义化工具能包装的。
本协议的作用是**引导 agent 把环境门、测试档、样本表、决策点、产物验证这几道关做对**，
避免在环境不齐时盲跑数小时才发现失败。默认口径：**先跑测试档，再碰真实数据**。

> 设计参考：Anthropic `life-sciences` 仓库的 `nextflow-development` 技能（Apache 2.0）
> 所采用的工作流检查单模式；本协议为面向本插件工具链与严谨性要求的独立实现。

## 工作流检查单

```
- [ ] 步骤 0：数据获取（仅 GEO/SRA；本地数据跳过）
- [ ] 步骤 1：环境门（必须全过，否则停）
- [ ] 步骤 2：选择流程（与用户确认）
- [ ] 步骤 3：跑测试档（必须通过，再碰真实数据）
- [ ] 步骤 4：生成并校验样本表
- [ ] 步骤 5：配置并运行（与用户确认基因组与关键参数）
- [ ] 步骤 6：验证产物（MultiQC + 日志 + 关键输出文件）
```

## 步骤 1：环境门（必须全过）

**这是唯一不可跳过的步骤。**环境不齐时后续必然失败，而失败发生在几小时之后。

```python
# 用 bio_python 执行：检查 NGS 流程的全部前置条件
import shutil
import subprocess

checks = []


def probe(name, cmd, arg, min_ver=None):
    exe = shutil.which(cmd)
    if not exe:
        checks.append({"tool": name, "ok": False, "detail": f"未找到 {cmd}（不在 PATH）"})
        return
    try:
        out = subprocess.run([exe, arg], capture_output=True, text=True, timeout=30)
        ver = (out.stdout or out.stderr).strip().splitlines()[0] if (out.stdout or out.stderr) else "?"
    except Exception as e:
        checks.append({"tool": name, "ok": False, "detail": f"{type(e).__name__}: {e}"})
        return
    checks.append({"tool": name, "ok": True, "detail": ver, "path": exe})


probe("Docker", "docker", "--version")
probe("Java", "java", "-version")
probe("Nextflow", "nextflow", "-version")

# Docker 守护进程是否真的在跑（仅有 CLI 不够）
daemon_ok = False
if shutil.which("docker"):
    try:
        r = subprocess.run(["docker", "info"], capture_output=True, text=True, timeout=60)
        daemon_ok = r.returncode == 0
    except Exception:
        daemon_ok = False
checks.append({"tool": "Docker daemon", "ok": daemon_ok,
               "detail": "守护进程在运行" if daemon_ok else "CLI 存在但守护进程不可用"})

result = {"checks": checks, "all_pass": all(c["ok"] for c in checks)}
print(result)
```

**判定**：`all_pass` 为 False 时**停下来**，按下方排障表给出修复指令让用户处理，
不要尝试自动安装 Docker（系统级操作，超出插件边界）。

## 步骤 0：数据获取（仅 GEO/SRA）

本地已有 FASTQ/BAM 时跳过。公开数据用 SRA Toolkit（`prefetch` + `fasterq-dump`）或
`gdc-client`（TCGA）获取。**下载前必须与用户确认子集**——一个 GSE 常有数十个样本、
每个数 GB。

本插件已有的辅助能力：

- `bio_entrez_search` / `bio_entrez_fetch`（db=sra / db=gds）——查询研究的元数据（样本数、
  文库类型、平台、SRR 登录号列表）；**用于确认下什么，不用于下载原始数据**
- 下载本身用外部命令（SRA Toolkit），并把完整命令写进交付报告以便复现

**溯源要求**：记录 GSE/SRR 登录号、下载日期、样本筛选理由。报告中出现任何登录号都必须
来自 `bio_entrez_*` 的真实返回，**禁止凭记忆写 GEO/SRA 号**。

## 步骤 2：选择流程（决策点，须与用户确认）

| 数据类型 | 流程 | 典型版本 | 目标 |
|---|---|---|---|
| RNA-seq | `nf-core/rnaseq` | 3.22.x | 表达定量（counts/TPM）+ 差异分析输入 |
| WGS/WES | `nf-core/sarek` | 3.7.x | 胚系/体细胞变异检出（VCF） |
| ATAC-seq | `nf-core/atacseq` | 2.1.x | 染色质可及性（peak 调用） |

**版本必须固定**（`-r <version>`）。写 `-r` 缺省用 latest 会让结果无法复现，
也违反本插件的可溯源原则。

## 步骤 3：跑测试档（必须通过）

```bash
# 用极小内置测试数据验证环境与流程可用，通常 10-30 分钟
nextflow run nf-core/rnaseq -r 3.22.2 -profile test,docker --outdir test_rnaseq
```

通过判据（两条都要看）：

```bash
ls test_rnaseq/multiqc/multiqc_report.html     # 存在
grep "Pipeline completed successfully" .nextflow.log
```

测试档失败时**不要**直接换真实数据重试——按 `.nextflow.log` 定位，先解决。

## 步骤 4：样本表

样本表格式因流程而异，**必须与流程文档一致**（列名错会被流程直接拒绝）：

```csv
sample,fastq_1,fastq_2,strandedness
SAMPLE1,/abs/path/S1_R1.fastq.gz,/abs/path/S1_R2.fastq.gz,auto
```

校验要点（在 bio_python 里做，不要肉眼检查）：

```python
import csv
import os

required = ["sample", "fastq_1", "fastq_2", "strandedness"]
path = "samplesheet.csv"

problems = []
seen = set()
with open(path, newline="", encoding="utf-8") as fh:
    rows = list(csv.DictReader(fh))

header = set(rows[0].keys()) if rows else set()
missing_cols = [c for c in required if c not in header]
if missing_cols:
    problems.append(f"缺列: {missing_cols}")

for i, r in enumerate(rows, start=2):
    s = r.get("sample", "")
    if not s:
        problems.append(f"第 {i} 行 sample 为空")
    if s in seen:
        problems.append(f"第 {i} 行 sample 重复: {s}")
    seen.add(s)
    for key in ("fastq_1", "fastq_2"):
        v = r.get(key, "")
        if not v:
            problems.append(f"第 {i} 行 {key} 为空")
        elif not os.path.isabs(v):
            problems.append(f"第 {i} 行 {key} 不是绝对路径: {v}")
        elif not os.path.exists(v):
            problems.append(f"第 {i} 行 {key} 文件不存在: {v}")

result = {"rows": len(rows), "problems": problems, "ok": not problems}
print(result)
```

**路径必须是绝对路径**（Nextflow 在不同工作目录下解析相对路径会失败），
且 `-resume` 依赖样本表内容不变——改动样本表会让已完成步骤全部重跑。

## 步骤 5：配置并运行（决策点）

**须与用户确认的项**：

1. **参考基因组**：human `GRCh38`（旧数据 `GRCh37`）、mouse `GRCm39`、yeast `R64-1-1`
2. **流程特定参数**：
   - rnaseq：比对器（`star_salmon` 推荐；内存紧张用 `hisat2`）
   - sarek：`haplotypecaller`（胚系）/ `mutect2`（体细胞）
   - atacseq：`read_length`（50/75/100/150，须与实际测序一致）
3. **资源上限**：避免流程吃满机器

```bash
nextflow run nf-core/rnaseq \
    -r 3.22.2 \
    -profile docker \
    --input samplesheet.csv \
    --outdir results \
    --genome GRCh38 \
    -resume \
    --max_cpus 8 --max_memory '32.GB' --max_time '24.h'
```

## 步骤 6：验证产物

```bash
ls results/multiqc/multiqc_report.html
grep "Pipeline completed successfully" .nextflow.log
```

关键产物位置：

| 流程 | 产物 | 用途 |
|---|---|---|
| rnaseq | `results/star_salmon/salmon.merged.gene_counts.tsv` | 表达矩阵 → 接 `bio_deseq2` |
| rnaseq | `results/star_salmon/salmon.merged.gene_tpm.tsv` | TPM 定量 |
| sarek | `results/variant_calling/*/*.vcf.gz` | 变异 → 接 `bio_variant_*` 分析 |
| atacseq | `results/macs2/narrowPeak/*.narrowPeak` | peak 区间 |

**验证纪律**：产物存在 + 日志有成功标志 + MultiQC 打开看关键指标（比对率、重复率、
rRNA 比例）**三条都要**。只看文件存在就当成功，会把"跑到一半失败"误判为成功。

## 与插件下游的衔接

NGS 流程产出的是**文件**，可直接喂给本插件的语义化工具：

- rnaseq 表达矩阵 → `bio_deseq2`（差异表达）→ `bio_gsea`（通路富集）→ 绘图协议
- sarek VCF → `bio_variant_analysis` skill 的分析路径
- 任何结果表 → `bio_fig_profile` 剖析 → `bio-proto-pub-figure` 出图 → `bio_fig_export` 审计

## 常见坑

| 症状 | 原因 | 处理 |
|---|---|---|
| `Cannot connect to the Docker daemon` | 守护进程未启动 | 启动 Docker Desktop 后重试 |
| 流程启动即报 process 失败 | 容器镜像拉取被墙 | 配置镜像加速，或在 `-profile` 里换 `singularity` |
| 内存被杀（exit 137） | `--max_memory` 高于物理内存 | 下调上限；或换低内存比对器 |
| 样本表被拒 | 列名/表头与流程不符 | 对照该流程文档的 samplesheet schema 逐列核对 |
| `-resume` 没生效 | 样本表或参数变了 | 属预期：内容变化即失效，重跑是正确行为 |
| 运行数小时后失败 | 未先跑测试档 | 下次先跑步骤 3 |

## 严谨性与溯源要求

1. **流程版本必须固定**并在报告中写明；用 latest 的结果不可复现。
2. **报告里出现的每个数字**（比对率、差异基因数、peak 数）必须来自 MultiQC/输出文件
   的真实读取，不得凭印象描述。数值要经工具读出来落进溯源台账。
3. **样本元数据**（分组、批次、疾病状态）来自 GEO/SRA 时必须经 `bio_entrez_*` 核验。
4. **交付物**：流程命令、流程版本、样本表、MultiQC 路径、关键产物路径、已知限制——
   缺一项读者就无法复现。
5. 参考文献时引用该 nf-core 流程自身的 CITATIONS.md，不要引用本协议。

## 验收标准

- [ ] 环境门脚本已跑，`all_pass` 为 true（或已明确告知用户缺什么并停下）
- [ ] 流程版本用 `-r` 固定并在报告中写明
- [ ] 测试档已通过（`Pipeline completed successfully` 出现在日志）
- [ ] 样本表经脚本校验：无缺列、无重复 sample、路径全为绝对路径且文件存在
- [ ] 基因组与关键参数经用户确认（决策点记录在报告里）
- [ ] 关键产物文件存在**且** MultiQC 关键指标已读并写入报告
- [ ] 报告含完整可复现命令（含 profile、版本、参数）
- [ ] 所有对外数字来自真实文件读取，未使用印象值
