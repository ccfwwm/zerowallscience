# ZeroWall Science 6.7.0

- 修复 Ketcher Chemistry 远程服务访问及原生侧栏标签 ID 变化造成的编辑器无法挂载；打开失败后可重试。
- 集成 Ketcher 3.18.0，支持结构读取、编辑、原子高亮、立体化学和 MOL/V3000 导出。
- 统一 Skills、MCP、BioGenie 和 Python 环境管理入口。
- 使用 DeepSeek Harness `fcf35ae8707237f7d7963a8182652ef706f08fb5` 重新构建运行时。
- 打包前核对 Harness 提交、构建记录、应用版本及插件产物，阻止旧运行时进入新安装包；包内保留构建记录。

适用平台：Windows x64。托管 Python 运行时保持 3.12.10。
