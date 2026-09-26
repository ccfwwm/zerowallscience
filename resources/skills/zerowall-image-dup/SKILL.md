---
name: zerowall-image-dup
description: 科研图片查重。检查图片、递归目录或 PDF 中的整图重复、翻转旋转、缩放压缩、单图局部复制和跨图区域复用，输出带来源与裁剪证据的本地报告。
---

# ZeroWall 科研图片查重

通过现有 `python` 工具执行本技能目录下的 `scripts/zerowall_integrity.py`。使用 ZeroWall Science 唯一共享 Python（`Python/python.exe`）和唯一的 `Python/Lib/site-packages`；不要创建 venv、overlay 或其他 Python 环境。不得为查重另装独立运行时或启动独立聊天界面。脚本的绝对路径以本技能实际加载路径为准。

先运行 `doctor`。缺少依赖时，使用 ZeroWall Science 的共享 Python 依赖更新功能检查签名清单、预览变更并应用更新；完成后重新运行 `doctor`。不要通过脚本 `setup` 或独立 pip 安装绕过清单。安装失败应报告错误，不能把未执行说成“无重复”。

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

- 图片与图内数字默认使用唯一共享 Python 依赖清单中的 EasyOCR；首次使用下载模型到隔离缓存，下载或识别失败必须标记为未评估。PDF 正文仍可通过 `mineru-document-parser` 解析，图内 OCR 覆盖以本地 EasyOCR 的实际结果为准。
- CNN 依赖随完整 7.1.0 Python 清单安装；默认检测时 CNN 关闭。用户显式指定 `--cnn on` 才执行候选召回，结果仍必须经过局部几何和像素复核。
- 检测使用同一托管 Python，工具 `timeoutMs: 600000`；脚本默认 `--budget-seconds 480`，到时保存报告与检查点。读取 `incomplete_execution`，为 true 时以相同输入和参数再次调用，直到完成或用户停止；不要反复增加超时或删除检查点。
- `partial` 表示筛查覆盖存在缺口，`incomplete_execution` 表示执行尚未完成。两者都要说明；无参考文献、伦理章节或适用表格属于材料限制，不等同于 Python 缺依赖。
- 分析返回 `ocr_requests` 时，可按需调用 `mineru_parse` 补充识别，并用 `--region-parsed "<图片绝对路径>=<parse-manifest.json绝对路径>"` 交给下一次分析。补充材料后生成新 trace，保留旧报告。图注不代表图内标注已识别。
- 只生成报告时不重复检测或提交 OCR。报告需附解析来源、已完成数量、待执行数量和未完成原因；没有页码/bbox 时明确标为未知。
- 依赖安装、doctor、检测、OCR 和一键终端均使用同一个共享 Python 可执行文件与同一个 site-packages 路径；不要创建或建议其他环境。
