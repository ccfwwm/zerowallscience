# ZeroWall Science 4.3.6

## 修复

- 独立生图和 PPT 生图现在统一读取环境中的 `imageQuality`，正常默认发送 `medium`，配置缺失或不可用时发送 `auto`，用户明确值始终优先。
- PPT 图片生成默认最多 10 页并发；每页成功后立即持久化并刷新预览，单页失败不再删除或重新生成其他成功页面。
- 演示文稿工作台按页序显示真实缩略图和主预览，支持失败页单独重试、复制图片路径/引用，以及把页面图片加入当前对话草稿。
- PPT 预览在对话 attachment 不可读时会安全回退到项目内的 `slide-NN.png`，旧记录也能恢复真实缩略图；空白和失败状态改为浅色背景。
- 单页重试不再依赖客户端与 Host 的瞬时状态完全一致，任意已存在页面都可独立重新生成，不影响其他页面。
- 空白对话页中英文标题统一为 `ZeroWall Science`。
- Windows 默认工具提示和 PPT preset 明确使用 `pwsh`/PowerShell，不再把 Bash 作为 Windows 默认执行工具。

## 发布

- Windows Stable 安装包、blockmap、更新 YAML 和 JSON metadata 同步发布到 GitHub Release 与七牛云。
- 保留 4.3.5 及更早版本的不可变历史文件，Stable 指针仅在 4.3.6 完成校验后更新。
