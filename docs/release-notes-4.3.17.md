# ZeroWall Science 4.3.17

- 新增 `r_upload_workspace_file`，可将当前工作区中的代码、数据和图片安全上传到 rdatalinux R 平台，支持大文件并校验 SHA-256。
- 修复 singlecell 插件 Remote 契约未生成的问题，并完善 scTenifoldKnk 工具在打包运行时的注册校验。
- 改进 singlecell 公共数据下载的超时、重试、重定向和 curl 回退处理。
- rdatalinux R MCP 使用 8099 端口，继续支持异步 R 任务、日志、结果文件和图片返回。
