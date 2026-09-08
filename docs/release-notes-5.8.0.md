# ZeroWall Science 5.8.0

本版本整合 OpenCode2DSH、Biomni 路由参数修复和附件解析展示修复，生成 Windows x64 本地安装包供测试。

## OpenCode2DSH

- 使用 `opencode2dsh` 替换旧的 OpenCode Zen 路由。
- 接入匿名 `Bearer public` 请求、OpenCode CLI 伪装请求头、实时免费模型目录和静态回退。
- 完整消费模型探测终态，支持文本、reasoning、tool call、usage、错误终态和视觉探测。

## Biomni 对接

- Biomni A1 执行时自动传递当前使用的模型、API Key 和 `base_url`。
- `https://hkcode.aicodeme.xyz/` 自动规范化为 `https://code.aicodeme.xyz/`。
- API Key 仅注入执行工具，状态查询等只读工具不会携带密钥。

## 附件与运行时

- 修复文件解析完成后附件列表消失的问题，兼容多层附件包装。
- 更新 DSH 模型目录、插件库存、运行时闭包和打包校验接线。

本版本已完成本地 Windows x64 安装包验证，并同步到 GitHub Release 和七牛云 Stable 更新渠道。
