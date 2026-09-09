# ZeroWall Science 5.14.0

本版本修复 TSG 凭据恢复和文献 PDF 下载回退，并默认启用 ZeroWall Literature 的 paper-download 扩展级联。

## TSG 凭据与下载回退

- 环境服务启动时恢复四个 TSG Cookie，并等待恢复完成后再返回配置状态。
- 已保存但未出现在旧设置清单中的 TSG Cookie 也会被恢复；启动环境变量和域名明确的浏览器 Cookie 导出可作为兼容来源。
- 每篇开放来源或 paper-download 未成功的论文都会继续进入 TSG 标题搜索；缺少 Cookie 时记录具体键名和阻塞原因，不再静默跳过。
- `paper-download` 每篇论文使用独立工作目录，避免并发任务覆盖 registry、日志和中间状态。
- ZeroWall Literature 调用 paper-download 时默认传入 `RESEARCH_ENABLE_SHADOW_LIBS=1`；设置为 `0` 可显式关闭。

## 发布信息

- Windows x64 Stable 安装包版本为 5.14.0。
- 托管 MCP 环境继续独立使用线上签名清单。
