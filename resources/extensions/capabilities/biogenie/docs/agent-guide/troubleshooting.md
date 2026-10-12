---
language: none
---

# 故障排查与插件边界

> 出错了先看这里；用户要"超能力"时，先看边界表再如实回答。

## 1. 环境类故障

| 现象 | 原因 | 处理 |
|---|---|---|
| 首次调用几分钟没返回 | 正在引导环境（下载 uv/CPython/装包） | 告知用户等待，**不要重复调用**（重复调用只是排队） |
| `bio_env` ready=false | 引导失败（网络/磁盘） | 看 error 字段；建议 `bio_env reinstall=true` 重试一次 |
| ImportError（某个包） | 升级后新依赖未补装（或环境损坏） | **先跑 `bio_env` 看环境状态**：若环境已就绪却仍缺包，**是插件 bug 不是任务 bug**——停止自愈，报告插件 bug（不要自己 pip install，违反「零安装」原则）|
| 引导日志提到 GitHub 下载失败 | 官方源不可达 | 插件自动切国内镜像（无需你处理）；用户显式设过 DSH_BIO_UV_BASE 时要提醒检查其镜像 |

## 2. R 引擎（已移除）

R 执行器（bio_r / bio_r_env）已从插件移除；差异表达/GSEA 使用 Python 语义化工具 `bio_deseq2` / `bio_gsea`。`bio_deseq2` 默认使用经核验的 PyDESeq2 0.5.4 负二项 GLM/Wald 流程，**未执行 LFC 收缩**；显式 `legacy_welch` 才使用旧近似。它不是 R/Bioconductor DESeq2 的实现，不能声称跨实现数值完全一致。正式依赖缺失或版本不符时明确失败，不静默降级。`bio_gsea` 需要完整排序与真实 GMT 或解析成功的命名库，不默认 Hallmark 示例集。

## 3. bio_python 失败

`needs_repair: true` 时按 stderr 修复重试（最多 2 次修复），常见签名：

| stderr 签名 | 根因 | 修法 |
|---|---|---|
| `ModuleNotFoundError: No module named 'ete3' / 'scanpy' / ...` | 不在环境内 | 换 Biopython 等效实现（见边界表），不要 pip install |
| `TranslationError` | 模糊密码子（XXG/--A） | 翻译前 `seq.replace('X','N').replace('-','N').replace('.','N')` |
| `ValueError: Cannot read from ...` | SeqIO 格式不对 | 检查 format 参数/文件内容；先用 bio_seq_io_read 验证 |
| `UnicodeDecodeError` | 中文 Windows 文件 GBK 编码 | `open(path, encoding='utf-8', errors='replace')` 或先按字节读再降级 |
| `HTTPError: 429` | NCBI 限流 | `time.sleep(0.4)` 后重试；批量任务按 entrez-batch 协议分批 |
| `TimeoutError` / 网络超时 | 网络/代理问题 | 一次重试；仍失败如实报告网络问题 |
| `Process killed` / timedOut | 超时（默认 60s） | 传更大 `timeoutMs`；大数据改成写文件而非 print |

3 次尝试后仍失败：**停止并如实报告**（错误 + 已尝试的修复），绝不编造。

## 4. 自愈执行（ACR）— 插件与 agent 的职责边界

**核心原则**：开发时主动消除错误根源（修复插件 bug、补 requirements）；运行时只在「确定可解的失败」上自愈，其余交给 agent。**自愈与修复不是二选一，是分层协作**。

| 层 | 谁修 | 触发 | 动作 | 上限 |
|---|------|------|------|------|
| **L1 插件自愈** | 插件代码 | 当前**不实现任何自动重试**——所有失败透传到 stderr 让 agent 看见 | — | 0 次（占位） |
| **L2 记忆复用** | agent | stderr 错误签名若命中 `~/.dsh/dsh-bio-genie/memory/error_lessons.json` | `bio_memory action=lessons` 查 fix_hint，命中即套用再调 | 1 次 |
| **L3 agent 自愈** | agent | L1/L2 未覆盖的失败（代码逻辑、API 误用、路径、限流、数据结构） | 读 stderr → 改 code → 再调 | 最多 2 次（共 3 次尝试）|
| **终止** | — | 累计 3 次仍失败 | 如实报告：错误原文 + 已尝试的修复 + 残余不确定性 | — |

**绝对禁止**：

- 无限重试同一个失败
- `needs_repair=true` 后用同一份 code 再调一次（不读 stderr 不改码 = 浪费时间）
- 把 ImportError 当作「环境没引导好」自行 pip install（违反「零安装」原则；除非插件代码本身定义了白名单自动补装）

**L1 的边界**：插件自愈只对「确定的事」负责（环境缺包、venv 损坏、镜像切换）。**不要让插件自动改 code**——code 是模型写的，插件不应擅改。

## 5. 网络类

- NCBI/Enrichr/PubMed 的限流与缓存已由插件内置（语义化工具）；bio_python 内直接调 API 时自己 sleep。
- Ensembl REST（ref_genome）：直连优先、代理回退已内置；报错时如实转达。
- 中国网络：引导器自动镜像切换；BLAST qblast 偶发超时→重试一次。
- OpenAlex/OLS4（协议内模板）：api.openalex.org 与 ebi.ac.uk 需网络，直连失败可在 bio_python 里加 ProxyHandler({}) 直连优先。

## 6. 插件边界（用户要超能力时——如实说明 + 给替代方案）

| 用户想要 | 插件现状 | 替代方案（你可以做的） |
|---|---|---|
| 单细胞分析（scanpy/Seurat） | ❌ 不内置（numba/torch 体积 1GB+） | 建议用在线平台；插件可做下游基因列表富集（bio_enrichr） |
| RNA-seq 上游（STAR/Salmon/FastQC） | ❌ 外部二进制不可装 | 用户给 counts 矩阵，插件用 `bio_deseq2`（Python 实现）做差异表达 |
| MAFFT/IQ-TREE 精确建树 | ❌ 外部工具 | Bio.Phylo 距离法 NJ（小数据集够用），如实说明近似 |
| 分子对接/蛋白结构预测（AlphaFold 等） | ❌ GPU 级 | 建议云平台；插件可做 Bio.PDB 结构分析 |
| 化学信息学（RDKit/SMILES） | ❌ 明确排除 | 建议其他工具链 |
| 物种注释库 | ❌ 未内置（体积大） | 用 Python bio_enrichr 富集，或如实说明边界 |
| 交互式图（plotly） | ❌ 未内置 | matplotlib/figurelib 静态图完全够期刊投稿 |
| 图像 AI 读图复核 | ⚠️ 依赖 dsh 模型多模态 | 无多模态时用程序自检（audit_layout）+ 清单核对 |

原则：**说"做不到"时，永远跟一个"但你可以……"**；绝不让用户手动装东西（违反对"零安装"的承诺时，改成推荐替代路径）。

## 7. 数据安全与文件位置

- 所有分析在本地进行（除显式网络查询）；产出文件写在工作区，报告绝对路径。
- 插件运行数据在 `~/.dsh/dsh-bio-genie/`（环境/日志/记忆）——不要当作用户数据目录。
- 日志可回溯：`bio_log action=search query=<错误信息>`。

## 8. 新工具常见问题（ML/DNA/代谢）

### ML 工具

| 现象 | 原因 | 处理 |
|---|---|---|
| `bio_ml_pipeline` 报 "no numeric features" | CSV 中所有列都是字符串 | 检查 CSV 内容，确保目标列以外有数值列 |
| `bio_ml_pipeline` accuracy=0.5 | 二分类随机猜测水平 | 数据可能无预测力；尝试 bio_ml_feature 看特征重要性 |
| `bio_stats_test` 报 NaN | 数据有缺失值 | 先用 bio_fig_profile 检查缺失比例 |
| CSV 路径报错 | 路径格式问题 | 用绝对路径；Windows 路径用 `/` 而非 `\` |

### DNA 设计工具

| 现象 | 原因 | 处理 |
|---|---|---|
| `bio_primer_design` candidates=0 | 模板太短（<产品大小） | 提供更长模板，或减小 product_size |
| `bio_primer_design` Tm 偏差大 | 正反向引物 Tm 差 >5°C | 选择评分更高的引物对 |
| `bio_assembly_design` 选了 restriction | 片段太长/太多 | 指定 method="gibson" 或 "golden_gate" |
| `bio_plasmid_map` 报错 | features JSON 格式错误 | 确保每个特征有 name/start/end/type |

### 代谢工具

| 现象 | 原因 | 处理 |
|---|---|---|
| `bio_fba` 报 "infeasible" | 模型无解（约束矛盾） | 检查培养基条件；用 textbook 模型测试 |
| `bio_gene_knockout` KeyError | 基因 ID 不存在 | 先 `bio_metabolic_model action=info` 查看可用基因 |
| `bio_pathway_search` 结果为空 | KEGG 无匹配通路 | 换关键词；检查 organism 代码 |
| `bio_metabolic_model` 报错 | SBML 格式问题 | 用 textbook 内置模型；自定义模型确保格式正确 |

## 9. 序列分析常见错误

| stderr 签名 | 根因 | 修法 |
|---|---|---|
| `TranslationError` | 含终止密码子或模糊密码子 | 翻译前 `seq.replace('X','N').replace('-','N')` |
| `gc_fraction` 返回 NaN | 序列为空或全 N | 检查输入序列 |
| `bio_seq_io_read` 格式错误 | format 参数与文件不匹配 | 设 `format="fasta"` 显式指定 |
| `bio_entrez_search` 无结果 | 检索式语法错误 | 检查字段名拼写；用 `[Gene Name]` 等限定符 |
