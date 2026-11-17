---
name: mineru-document-parser
description: 使用 MinerU 读取 PDF、Office、图片和 HTML，生成 Markdown、结构化内容、图片与页码锚点，并恢复未完成的解析任务。
---

# MinerU 文档解析

使用当前会话的 `mineru_parse`、`mineru_batch_parse` 和 `mineru_task`。解析由 Node 插件执行，不需要安装 Python MinerU、复制 API 脚本或读取 key。两种 API 都将文件发送至配置的远程 MinerU 服务。

## 选择解析方式

- 普通阅读使用 `mode: "auto"`：已配置 key 时使用 Precision；未配置时使用 Agent，最多 10 MB、20 页，仅返回 Markdown。
- 论文分析、对比、查重、提取表格或需要图片坐标时显式使用 `mode: "precision", isOcr: true`。缺少 key 时报告限制；轻量结果不能替代完整科研解析。
- 设置页保存的 key 优先于环境变量。默认变量名为 `MINERU_API_TOKEN`；状态只显示是否配置和来源，禁止索取或输出 key。
- 需要按页引用时增加 `anchor: true`，读取附加的 `document.md` 中 `<!-- pN bK -->`。页码是原文物理页序，不等同于印刷页码；缺少页码或内容列表时保留返回的警告。

## 输入与产物

`source` 接受当前工作区路径、当前会话用户上传的 `sha256:...` 附件 ID，或 HTTP(S) 文档 URL。工作区外文件必须作为当前会话附件提供，不拼造附件 ID 或安装目录。

Precision 使用 `pageRanges: "2,4-6"`；可读页数的本地 PDF 支持 `"2--2"`。本地 PDF 所选页数超过 200 页时自动按页分片，保留每片任务编号并合并结果。Agent 使用 `pageRange: "1-10"`，不自动分片。URL 和非 PDF 不支持自动分片；HTML 需要 Precision。

读取工具实际返回的 `artifacts`。`preview` 仅为截断预览；全文、图片、原始内容列表和 `parse-manifest.json` 位于返回的运行目录。科研脚本使用清单中的 `markdown`、`contentList`、`images` 和校验和，不根据文件名猜测路径。`content-list.normalized.json` 保留零基物理页码、bbox、表格和图片来源。

批量使用 `mineru_batch_parse`，每次 1 至 1000 项，插件按最多 50 项分组。逐项检查 `failures`，展示成功、失败和可恢复任务编号；批量中的长 PDF 改为单独调用 `mineru_parse`。

## 恢复与失败

超时或网络中断后使用原 `taskId` 调用 `mineru_task`；长文档使用 `runId`。`wait: false` 只查询，不创建新分片；`wait: true` 继续上传或收集结果。重启后在原会话、原工作区恢复。原文件改变、授权失效或提交结果未知时停止并说明原因，不重新提交以掩盖失败。

向用户交付全文或报告链接时说明实际 API、解析覆盖和缺失产物。Agent 不提供结构化图片、表格坐标和可核实的页码锚点；图注不代表图内文字已经识别。
