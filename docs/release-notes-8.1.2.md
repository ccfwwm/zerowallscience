# ZeroWall Science 8.1.2

本版本修复 8.1.1 更新后受管 Python 科研依赖尚未安装时 Bio MCP 在初始化阶段断开的问题，并降低正式构建的重复磁盘占用。

- Bio MCP 现在只在实际调用科研能力时加载 529 个科研域模块；核心层可独立完成 MCP `initialize` 和 `tools/list`，缺少科研依赖时返回明确的缺失模块提示。
- Python 核心层和科研层重新生成并签名为 `3.12.10-r17`，保持 43 个核心包与 529 个科研包分层，避免启动时把科研层误报为 MCP transport 故障。
- 构建缓存命中时优先使用 NTFS 硬链接物化 runtime、stage 和离线 carrier，跨卷或权限不足时自动回退复制；GC 默认每版本保留最近两份成功 stage 和每类缓存最近两份。
- 新增轻量 `pnpm build:dev`，日常开发不创建完整发布 stage、离线 profile 或安装包载荷。

DSH 子模块保持 `86b6740d0e671cee0b3fd0168de484c0efbf46ea`。正式构建仍验证 runtime closure、安装包、签名和回滚收据。
