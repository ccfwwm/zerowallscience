---
name: zerowall-image-dup
description: 科研图片查重。检查图片、递归目录或 PDF 中的整图重复、翻转旋转、缩放压缩、单图局部复制和跨图区域复用，输出带来源与裁剪证据的本地报告。
---

# ZeroWall 科研图片查重

通过现有 `python` 工具执行本技能目录下的 `scripts/zerowall_integrity.py`。使用该工具的托管 Python，不安装另一个应用或启动独立聊天界面。脚本的绝对路径以本技能实际加载路径为准。

先运行 `doctor`；缺失核心依赖时明确报告具体包，通过同一 Python 工具运行脚本 `setup`（timeoutMs 600000），把随附锁定依赖安装到托管 Python 的用户扩展目录；随后新建一次 Python 调用运行 `doctor`。修复失败应报告错误，不能把未执行说成“无重复”。

调用示例（将 script 和输入替换为实际绝对路径）：

```python
import subprocess, sys
result = subprocess.run([sys.executable, script, "image", image_or_directory_or_pdf,
    "--workspace", workspace_output], text=True, encoding="utf-8", capture_output=True)
print(result.stdout)
print(result.stderr[-4000:])
```

- 支持多个输入，目录默认递归。PDF 默认忽略未绘制图片；仅关注跨页时加 `--cross-page-only`。
- 阈值默认 8，用户要求时使用 `--threshold`。输入默认最多 10000 个，超出时用明确的 `--limit`；脚本自动保存分批检查点，不能手动切开后遗漏跨批次匹配。
- 上传附件先通过现有文件能力取得真实本地路径。无项目会话也将结果写入明确的用户可访问输出目录。
- 同一输入和参数会复用已有任务；可用 `--trace-id` 继续已有任务。输入或参数变化必须使用新任务。
- 读取返回的 findings JSON，检查 `steps` 和 `skipped`，展示实际检出、未能检测和证据路径。不同算法的分数分别解释，不能当成统一概率。
- 返回 HTML/Markdown 报告和局部裁剪证据的文件链接，使用现有文件预览打开；不打开独立查重侧栏。
- 筛查信号需要人工复核，不能据此认定造假；无告警也不等于已证明无问题。

需要论文内容解读时使用 `zerowall-paper-analysis`；多篇文献比较使用 `zerowall-paper-compare`；已有结果只生成报告时使用 `zerowall-integrity-report`。

## OCR 与任务续跑

- PDF/文档默认由 `mineru-document-parser` 的 Precision VLM 解析，显式传 `isOcr: true`，保留 Markdown、图片、表格、页码与坐标。不需要安装本地 MinerU、EasyOCR 或 Torch。
- 检测使用同一托管 Python，工具 `timeoutMs: 600000`；脚本默认 `--budget-seconds 480`，到时保存报告与检查点。读取 `incomplete_execution`，为 true 时以相同输入和参数再次调用，直到完成或用户停止；不要反复增加超时或删除检查点。
- `partial` 表示筛查覆盖存在缺口，`incomplete_execution` 表示执行尚未完成。两者都要说明；无参考文献、伦理章节或适用表格属于材料限制，不等同于 Python 缺依赖。
- 分析返回 `ocr_requests` 指向需补充识别的图像列表。按列表对图片调用 `mineru_parse`（`precision`、`isOcr: true`）；将每个结果用 `--region-parsed "<图片绝对路径>=<parse-manifest.json绝对路径>"` 交给下一次分析。增加解析材料后生成新 trace，保留旧报告。图注不代表图内标注已识别。
- 只生成报告时不重复检测或提交 OCR。报告需附解析来源、已完成数量、待执行数量和未完成原因；没有页码/bbox 时明确标为未知。
