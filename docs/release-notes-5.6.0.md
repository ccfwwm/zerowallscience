# ZeroWall Science 5.6.0

5.6.0 改进了 DeepSeek Harness 工具结果中的媒体处理，并提供更新后的本地 Windows x64 桌面应用安装包。

## DeepSeek Harness 图片渲染

- 工具返回的图片块会使用现有消息图片渲染器直接显示在对话中，不再序列化为 JSON 工具卡片。
- 每张图片都会保留源文件名，并显示为可访问按钮；点击文件名即可在现有文件预览侧栏中打开附件。
- 非图片工具结果仍按 JSON 显示，合法的图片附件不会重复出现在 JSON 视图中。
- 内置的 `image-base64-render` Skill 说明了默认图片处理规则：优先使用原生附件；必须嵌入图片时使用符合标准的 Base64 数据 URL。

## FigureYa 成果本地化

- FigureYa 任务成功后会把完整 manifest 下载到当前项目的 `figureya/<run_id>/` 目录，并返回项目内的本地路径和简要元数据。
- manifest、结果和图片工具返回的成果都会保存为本地文件，图片不会作为模型输入发送，也不再需要在对话中处理 Base64。
- 保留 `run_id` 异步任务生命周期和结果兼容链路，便于继续读取指定成果。

## 附件展示

- 工具结果中的解析附件现在以文件列表显示，文件名可直接打开现有的文件预览侧栏。
- 图片附件保留原始文件名和可访问入口，非图片结果继续使用 JSON 展示。

## 对话重试与错误恢复

- 对话遇到终止性模型错误时会显示“重试本轮”按钮，并使用原始用户消息及其已保存附件重新提交该轮请求。
- OpenAI 兼容服务返回“服务繁忙”“服务器过载”或“暂时不可用”等错误时，会统一识别为可恢复的服务器错误，以便现有重试策略继续处理。

## 免费多引擎网页搜索

- 默认网页搜索已直接替换为 `dsh-free-search@0.4.24`，无需登录 AI Cloud 或配置 API Key 即可使用 Bing 中文搜索。
- 支持 Bing、DuckDuckGo、SearXNG、AnySearch、Exa、Tavily、Keenable、Perplexity 和 DeepSeek Official，并在首选引擎不可用时自动回退。
- 新增时间范围搜索、GitHub 等平台搜索、结果缓存、搜索引擎设置卡片和 `/free-search-engine` 快速切换命令。
- 可选付费引擎的密钥继续存放在 DSH Credentials 中；插件升级由 ZeroWall Science 版本统一管理。

## 桌面端打包

- Windows x64 安装包已在本地构建为 `zerowall-science-5.6.0-win-x64.exe`。
- 本次安装包采用打包时当前工作区的最新 DSH 代码，所有 ZeroWall 插件包版本已同步为 5.6.0。
