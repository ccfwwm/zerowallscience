# ZeroWall Science 5.0.2

- 升级 DeepSeek Harness 至 `dsh-v0.1.2-alpha.5`，修复旧 projection cache 和会话标题恢复。
- MinerU 或本地解析结果以完整 `full.md`/Markdown 正文进入模型上下文，避免重复调用 PDF 解析工具。
- 附件原件与解析件分离：原件和解析结果均可在 Better Sidebar 中打开，解析结果使用真实 Markdown 文件。
- 修复无工作区会话的附件解析预览、附件拖拽/复制和解析进度展示。
- 移除首页“预览版”徽标，避免开发渠道文案出现在正式包中。
- 修复启动及分批模型健康检测，已完成状态不会被旧批次覆盖。
