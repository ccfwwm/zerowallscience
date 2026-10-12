---
language: python
---

# bio_python 编程指南

> bio_python 是兜底执行器：语义化工具覆盖不到的一切都在这里写代码完成。本指南让你写对、写快、少自愈。

## 1. 执行契约（务必背下来）

- **code**：完整 Python 源码。程序以**会话工作区**为工作目录（workdir 参数可覆盖）。
- `print()` → 返回的 `stdout`；异常 traceback → `stderr`，且 `needs_repair: true`。
- `result = <JSON 可序列化值>` → 直接作为结构化返回值给你（小结果用它；dict/list/数字/字符串都行）。
- **大输出写文件**（.fa/.tsv/.png/.csv），报告绝对路径——stdout 超过 1MB 会被截断。
- 超时默认 60s；大任务显式传 `timeoutMs`（如 180000）。
- 每次调用是**全新进程**：不能跨调用共享变量，也不能把 matplotlib Figure 对象传给别的工具（fig 工具都是文件级接口）。
- 隔离模式 `-I`：插件自己的 python 目录（含 `figurelib` 包）已在 sys.path，可直接 import；工作区目录**不在** sys.path（读文件用 open/相对路径没问题）。

## 2. 可用库矩阵（先调 bio_env 探测，以实际版本为准）

> 三层依赖：**builtin**（环境引导时预装）—— **auto**（首次调用对应工具时自动 uv pip install）—— **addon**（需在设置面板手动安装）。不确定某库是否可用时，先调 `bio_env` 查看 `libraries` 字段。

| 库 | 用途 | 层级 |
|---|---|---|
| `Bio.*` | Biopython 全模块（Seq/SeqIO/Align/Blast/Entrez/Phylo/PDB/motifs/Restriction/PopGen/Graphics/SearchIO…） | builtin |
| `numpy` / `pandas` | 数值/表格（pandas 3.x：read_csv/groupby/corr 均可用） | builtin |
| `scipy` | 统计检验、数值算法（ttest_ind/mannwhitneyu/pearsonr/…、`scipy.stats.false_discovery_control`） | builtin |
| `sklearn` / `statsmodels` | 机器学习 / 统计建模 | builtin |
| `matplotlib` | 底层绘图（Agg 后端自动可用，无需 display） | builtin |
| `seaborn` | 高层统计图（barplot/boxplot/violinplot/heatmap/pairplot） | builtin |
| `PIL`（Pillow） | 图像读写（灰度预览、DPI 读取） | builtin |
| `reportlab` + `rlPyCairo` | GenomeDiagram 渲染 PNG 的后端 | builtin |
| `cobra` | 代谢建模（FBA/FVA/pFBA/loopless/geometric/OptKnock、`cobra.io.read_sbml_model`） | builtin |
| `primer3` | 工业级引物设计（`primer3.bindings.design_primers`；首调自动装） | auto |
| `dnachisel` | 多约束 DNA 优化（`DnaOptimizationProblem` / `CodonOptimize` / `AvoidPattern`；**V2 与新 Spec 体系不兼容**；首调自动装） | auto |
| `dna_features_viewer` | 质粒图（`GraphicRecord` + `from_biopython_record`；首调自动装） | auto |
| `sbol3` / `tyto` | SBOL 3 读写 / 本体 URI 解析（`tyto.SO.get_term_by_uri`；首调自动装） | auto |
| `requests` | HTTP API（KEGG/Enrichr 等；`Bio.Entrez` 请勿手调——用 bio_entrez_* 工具） | builtin |
| `pydna` | 克隆模拟（Dseqrecord/Assembly；**注意 pyparsing>=3.1 冲突护栏**） | auto |
| `biocrnpyler` | 基因回路编译（部件→CRN→SBML；**自动 --no-deps 安装**） | auto |
| `bioscrape` | 回路动力学仿真（`py_simulate_model`） | auto |
| `networkx` | 网络/图分析 | auto |
| `scanpy` / `pysam` | 单细胞 / NGS（设置面板「高级模块」安装后可用） | addon |
| `figurelib.*` | **出版级绘图库**（吸收 scipilot）：`setup_style` / `profile_data` / `export_figure` / `check_figure` / `layout_tools` / `visual_qa` | builtin |

**不应假定常驻环境已安装**：torch/scanpy(未装时)/rdkit/ete3/plotly/esmfold 等重依赖——见 troubleshooting 的边界表。PyDESeq2 0.5.4 与 GSEApy 1.3.1 分别由 `bio_deseq2`/`bio_gsea` 首调按需检查和安装；显式 `legacy_welch` 不要求 PyDESeq2。需要其他按需后端时使用对应语义化工具（如 `bio_circuit_simulate` 首调自动装 bioscrape）。

### 常见「库存在但 API 变」陷阱

- **Biopython ≥1.88**：`SeqUtils.GC()` 已改名 `gc_fraction()`；`DNA` 类拆到 `Bio.Seq.DNA`；`pydna` 依赖的 `Bio.Seq` 行为可能随版本漂移。
- **cobra 0.32+**：`optknock` 已从 `cobra.flux_analysis` 移除（插件内部用贪心版）；`flux_variability_analysis` 在 Windows 需 `processes=1`。
- **dnachisel**：不要用旧 `V2` 入口（v3.x 用 `DnaOptimizationProblem`，`resolve_constraints()` + `optimize()`）。
- **pydna**：传递依赖会把 `pyparsing` 降级到 2.4.7 破坏 matplotlib——若你写 bio_python 同时 import pydna 和 matplotlib，先确认 `pip show pyparsing` ≥3.1。


## 3. 代码模板速查

```python
# 读文件（绝对路径）
from Bio import SeqIO
records = list(SeqIO.parse(r'D:/data/genes.fasta', 'fasta'))   # parse 是生成器，先 list()

# 写文件
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord
from Bio import SeqIO
SeqIO.write([SeqRecord(Seq('ACGT'), id='x1', description='demo')], r'D:/data/out.fasta', 'fasta')

# 双序列比对
from Bio.Align import PairwiseAligner
aln = PairwiseAligner().align('ACGTACGT', 'ACGTTCGT')[0]
print(aln)

# 批量统计 + 结构化返回
stats = [{'id': r.id, 'gc': round(sum(1 for c in r.seq.upper() if c in 'GC') / len(r.seq) * 100, 2)}
         for r in records if len(r.seq) > 0]
result = {'n': len(stats), 'stats': stats[:20]}

# NCBI（bio_python 里直接调时必须自己守规矩）
from Bio import Entrez
Entrez.email = 'your.email@example.com'     # 必设！填你自己的邮箱
Entrez.tool = 'dsh-bio-genie'
import time
handle = Entrez.esearch(db='nucleotide', term='NM_007294', retmax=1)
time.sleep(0.4)                            # 3 req/s 限流：请求间留间隔
```

## 4. 自动代码修复（ACR）

失败返回 `needs_repair: true` 时，读 stderr 修复重试，**不要第一次失败就放弃**（最多修 2 次、共 3 次尝试）：

| stderr 信号 | 修法 |
|---|---|
| `ModuleNotFoundError: No module named 'xxx'` | 拼写错误就改；若是真缺包先 `bio_env`（reinstall=true） |
| `ImportError: cannot import name 'X'` | 现代 Biopython 无 alphabet：直接用 `Seq.translate()`；别用 `from Bio.Alphabet import ...` |
| `HTTPError: 429` / `ConnectionError` | 代码里 `time.sleep(0.4)` 后重试；NCBI 3 req/s |
| `FileNotFoundError` | 路径问题：相对路径基于工作区；不确定就用绝对路径 |
| `KeyError` / `AttributeError` / `IndexError` | 读 stderr 行号检查数据结构（如 esummary 的包装层） |
| `TranslationError`（模糊密码子） | 翻译前把 X/gap 替换为 N |

3 次尝试后仍失败：停止，如实向用户报告错误与已尝试的修复，**绝不编造结果**。

## 5. 会话记忆（越用越聪明）

- 写非平凡代码前：`bio_memory action=patterns query=...` 查有无同类成功模板。
- 失败时：`bio_memory action=lessons` 查错误签名，命中直接套 fix_hint。
- 你的成功代码与失败→修复配对会被自动沉淀，下次同类任务直接受益。

## 6. 网络与限流（代码内自查）

- 语义化工具的限流插件已内置；**bio_python 代码里的网络请求自己守规矩**。
- NCBI：`Entrez.email` 必设；3 req/s（sleep ≥0.34s）；批量任务用 `bio-proto-entrez-batch` 模板。
- Ensembl REST：需要 User-Agent 头；直连优先、失败回退代理（见 ref_genome op 的写法）。
- 代理环境部分域名（rest.ensembl.org）对代理失效——直连 `urllib.request.ProxyHandler({})` 优先。
- 大数据下载（基因组 FASTA）如实告知用户体积，走 `bio_ref_genome` 的 download_urls。

## 7. 高频陷阱

- `SeqIO.parse()` 是生成器，复用前 `list()`。
- 现代 Biopython `Seq` 无 alphabet；`GC()` 已改名 `gc_fraction()`（返回 0-1 小数）。
- `SeqIO.write` 需要 SeqRecord 列表，不能直接传 Seq。
- 中文 Windows 下文件可能 GBK 编码——读写用 `encoding='utf-8', errors='replace'` 或先按字节读再降级解码（bio_seq_io_read 已内置容错）。
- matplotlib 保存中文图：先 `from figurelib.setup_style import setup_style; setup_style(lang='zh')`（找不到 CJK 字体会抛清晰错误，先 `bio_fig_qa` 探测）。
- 统计结论必须带检验（scipy）+ 校正（见 bio-proto-statistics）；误差棒图注写 SD/SEM/CI+n。

## 8. Biopython 1.88 常见 API 陷阱

> 三条都来自真实报错现场，已在本机 1.88 上逐条实测复现（`uv run --with biopython --with reportlab --with rlPyCairo`，输出见下方各条）。撞上 `ImportError` / `TypeError` 先对照本节，按下面的正确写法改，别反复试错。与 §2「库存在但 API 变」互补。

### 8.1 Tm 计算

- ❌ `from Bio.SeqUtils import melting_temp` → `ImportError: cannot import name 'melting_temp' from 'Bio.SeqUtils'`
- ✅ `from Bio.SeqUtils import MeltingTemp`；`MeltingTemp.Tm_NN(seq)`（实测 27nt 序列 → `57.413`，返回值单位 ℃）
- 原因：Tm 计算的入口是 `Bio.SeqUtils.MeltingTemp` 子模块，`melting_temp` 这个名字不存在（也不是模块名）。

### 8.2 SeqFeature 的 strand

- ❌ `SeqFeature(location=..., type='CDS', strand=-1)` → `TypeError: SeqFeature.__init__() got an unexpected keyword argument 'strand'`（1.88 的 `__init__` 只剩 `location / type / id / qualifiers / sub_features`）
- ✅ `SeqFeature(location=SimpleLocation(start, end, strand=-1), type='CDS')`；方向用 `feature.location.strand` 读（实测 -1；旧的 `feature.strand` 属性已移除 → `AttributeError`，`start`/`end` 同样从 `feature.location` 取）
- 原因：1.88 的特征坐标统一由 `Location` 对象（`SimpleLocation` 等）承载，strand 必须建在 location 上，不再是 SeqFeature 自己的构造参数。

### 8.3 GenomeDiagram 的线宽

- ❌ `diagram.draw(format='linear', linewidth=2)` → `TypeError: Diagram.draw() got an unexpected keyword argument 'linewidth'`（`draw()` 只接布局参数：`format / pagesize / orientation / x…yb / start / end / tracklines / fragments / fragment_size / track_size / circular / circle_core / cross_track_links`）
- ✅ 线宽属于轨道里的 Graph 对象：`gset = track.new_set(type='graph')` → `graph = gset.new_graph(data, style='line', linewidth=5)`（或建好后 `graph.linewidth = 5`）——实测该值真的进入输出（渲染出的 reportlab 图形里出现 `strokeWidth=5`）
- 🕳 同轮实测的两个连带坑：① 在 `GraphSet` 上赋值 `gset.linewidth = 5` **静默无效**（graph 仍是默认 1，图上不出现 5）；② `FeatureSet`/`Feature` 没有 `linewidth` 属性（特征框线宽在渲染器里硬编码 1）——特征框线宽不可调，要可控线宽就用 graph。
- 原因：线宽是 `GraphData`（`style='line'`）自己的属性，不是 Diagram 的绘制参数。

### 8.4 附带：GenomeDiagram 导出 PNG 的后端

- ❌ 环境缺 `rlPyCairo` 时 `diagram.write('x.png', 'PNG')` → `RenderPMError: cannot import desired renderPM backend rlPyCairo`
- ✅ 插件自带环境已预装 `reportlab + rlPyCairo`（见 §2 库矩阵 builtin），直接 `write(path, 'PNG')` 即可（实测 44KB PNG 正常落盘）；自建 venv 时要补装 `rlPyCairo`。
- 原因：reportlab 渲染 PNG 的后端是 rlPyCairo，缺它时渲染直接失败（不是静默降级）。
