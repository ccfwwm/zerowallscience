# @zerowall/dsh-plugin-mineru

[English](README.md) | 中文

面向 ZeroWallScience 的 MinerU 远程文档解析插件，要求 DSH 0.2.2-rc.1 和 Node.js 24.9 或更新版本。通过 DSH 插件管理器安装 npm 插件，或更新 Science 组合包。插件提供现有解析工具和可检索的 `mineru-document-parser` 技能；无需另行安装 Python MinerU。

密钥优先使用已保存的 MinerU Token，其次使用环境设置中的变量。未启用环境插件时，通过标准 DSH 凭据解析器和启动环境读取 `MINERU_API_TOKEN`（或 `tokenCredential` 指定的名称）。环境服务中的显式删除保持有效。密钥不进入工具参数、状态响应或产物。

`auto` 模式有 Token 时选择 Precision，无 Token 时通过 Agent 远程解析。Agent 最多支持 10 MB、20 页，返回 Markdown。Precision 最多支持 200 MB，并提供结构化内容、图片和额外导出格式。科研分析、比较和可信度核查显式使用 `mode: "precision", isOcr: true`；缺少凭据或结构化内容时停止依赖这些材料的解读。两种 API 均会远程上传或获取文档。

输入支持 HTTP(S) URL、会话工作区内的普通文件，或经当前会话用户消息核验的原生 `sha256:` 文件附件。无工作区会话接受已授权附件，产物保存在 `DSH_HOME` 或标准用户 DSH 目录下。工作区外的本地文件必须作为授权附件提供。

Precision 的 `pageRanges` 支持 `2,4-6` 等升序选页，可读取页数的本地 PDF 还支持 `2--2`。Agent 使用 `pageRange`，例如 `1-10`。本地 PDF 选择超过 200 页时按顺序分片提交，每片分别上传原文件。合并结果保留物理页码索引和图片路径。可选 `anchor: true` 在有结构化内容时生成含页码/块标记的 `document.md`，覆盖缺口通过警告说明。

上传前持久化任务和运行记录。中断后用 `mineru_task` 和原 `taskId` 恢复，长 PDF 使用 `runId`。`wait: false` 不提交尚未启动的分片。提交结果未知时保留状态，不会静默重复提交。复用已完成缓存前校验产物，文件被修改时报告错误。原有任务记录仍可读取。

Precision 真正批量请求每组最多 50 个文件，单次工具调用接受 1–1000 个来源。逐来源报告失败，并在可用时返回恢复编号。提交、查询和 UTC 日提交上限均可配置；计数属于插件进程，不能替代服务端配额。停用插件会取消并等待解析结束。结果保留 `parse-manifest.json` schema 1、规范化内容和校验和，供现有可信度脚本使用。

连接检测不发送文档，只检查接口路由。开发检查：`pnpm run build`、`pnpm run test` 和 `pnpm run typecheck`。上游适配组件的 MIT 声明保留在 [THIRD-PARTY-LICENSES](THIRD-PARTY-LICENSES)。
