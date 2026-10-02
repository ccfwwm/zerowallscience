# ZeroWall Science 8.0.1

本地候选版本：融合 main 7.5.0 的附件预览、Office/GIS 修复和科研 PPT 工作流，以及 8.0.0 的独立插件、统一构建和 Python 恢复架构。

- 文件插件独立提供通用查看器、原生 Office 路由、结构化附件提取及带内容标识的离线 PDF/GIS 资源。
- 保留 Office→PDF、Excel Worker/白屏/缩放、LibreOffice 物理执行路径修复。
- 区分附件阅读与 PPT 制作，保留图片来源、可编辑文字/数据和逐页审查；模型、质量和尺寸继续使用用户配置。
- MinerU 任务支持持久化和续取；插件、Skills、MCP、环境变量和 Python 保留独立更新及回滚能力。
- zws doctor 显示 profile 与安装包插件的实际版本、来源和更新状态，不覆盖用户固定或移除的插件。
- 修复 GIS 侧栏切换时的 Leaflet 动画回调错误；同版本组件保留原发布归档与依赖合同。
- 默认包不携带完整 Python archive；正式产物统一进入 artifacts。

本版本不上传七牛、不创建 GitHub Release。实际构建提交、哈希、签名状态和测试结果见 8.0.1 验收报告。
