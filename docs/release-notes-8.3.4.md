# ZeroWall Science 8.3.4

- 修复 CDN 图片获取慢、下载中断和超时后错误结束的问题：使用分段并发下载、断点恢复和分段重试，完整响应后再交给后续流程。
- 修复 `PI_AI_ERROR`、流断开和截断 JSON 导致会话直接中断的问题：在同一轮会话中保留模型与参数并执行持久重试，失败时记录可恢复状态。
- 修复插件更新因旧 lock/override 指向公共 npm 导致 404 的问题；候选 profile 固定使用 `profiles/zerowall`，活动配置固定使用 `profiles/web`，失败候选归档到 `resources/history`。
- 集成已验证资源：AI Cloud 0.1.23、Images 0.2.22、gpt-image-generator Skill 0.1.6，并同步资源清单和离线运行闭包。
- 保留用户的账户、模型、生图分组、质量、协议、已禁用/固定插件和其他配置；DSH 继续固定在 0.2.0-rc.2 的 ZeroWall fork 提交。
