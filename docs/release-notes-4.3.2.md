# ZeroWall Science 4.3.2

## Dream Skin 与界面融合

- 默认嵌入固定版本 `dsh-dream-skin@0.4.14`（`ed74cf17d9d83ab5bcd022866c663340a58350a7`）。
- 首次启动且没有用户主题选择时使用 `ivory`；已有主题和后续手动切换不会被覆盖。
- 保留原生 Windows 标题栏，通过 ivory 内容区基底和 DSH token 统一 ZeroWall 自有 UI。
- GitHub 项目入口移到 sidebar footer 顶部，展开时居中显示“GitHub 项目”。

## 环境配置

- 修复生图模型远程方法名，使用公开的 `getImageModelSelection` 合约。
- Reviewer、SciMaster、环境变量和生图模型分开加载；单个服务不可用时其余配置仍正常渲染并显示中文状态。
- 变量值不返回 Renderer，仍由 Host 安全存储。

本版本作为 Stable Windows x64 正式版本发布，安装包同步提供于七牛云更新通道和 GitHub Release。
