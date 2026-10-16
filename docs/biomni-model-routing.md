# Biomni 任务模型与凭据

ZeroWall 将当前会话模型的供应商、模型名、协议、地址和 Key 在 Host 最终发送阶段注入可信 rmcp 的 A1、动态工具和 Python 任务。`capability_execute` 及科研工作流沿用同一工具执行路径。只读查询不携带 Key；原始对话工具参数不写入自动注入的秘密。

支持 AI Cloud、官方 DeepSeek 适配器及 pi-ai 配置的供应商。凭据使用实际模型配置中的引用；AI Cloud 使用对应账户分组的桌面凭据库。不要把 Key 粘贴到对话里，也不需要另配 Anthropic Key 才能让 DeepSeek/Kimi 执行数据库自然语言查询。

在 MCP 设置的 rmcp 连接中，可用“转发的科研变量（名称=环境变量引用）”选择额外变量，例如 `NCBI_API_KEY=NCBI_API_KEY`。名称映射保存在连接中，值从环境设置的凭据库解析，默认不转发。PATH、PYTHONPATH、服务令牌等运行控制变量禁止转发。

## 路由与错误

请求提供路由时不会被服务器旧默认地址覆盖。省略地址时，DeepSeek 使用 `https://api.deepseek.com/v1`，Kimi/Moonshot 使用 `https://api.moonshot.cn/v1`，OpenAI 使用 `https://api.openai.com/v1`，Anthropic 使用 `https://api.anthropic.com`。Kimi 国际站及自定义模型请明确配置地址。模型临时指定不同地址时，Host 不会自动转发当前会话的 Key；请先在设置中选择正确模型。

支持 `openai-completions`、`openai-responses`、`anthropic-messages` 和 `auto`。已知协议优先；auto 仅在明确不支持路径时在同一地址尝试 Responses。401/403 立即失败，不换 Key 或域名。单次请求超时 60 秒，临时错误最多重试两次，并受任务总截止时间约束。

服务端为每个任务单独配置 Biomni 主模型及 Database LLM。任务状态只返回不含 Key 的路由信息；输出默认是 Manifest 和文件引用。

## 验证与运行

路由改动需要验证 MCP bridge、模型 Loader、AI Cloud 和受影响插件。契约测试通过只说明路由规则成立，不代表持有所有供应商凭据或完成线上推理。实际验收记录模型、协议、目标地址（脱敏）、任务返回和产物，存入 artifacts/verification/<version>，不要把一次性结果当永久支持保证。

需要使用更新后的客户端 Host 并重新启动；服务端更新不会自动替换已安装的旧客户端。插件独立发布和桌面集成按 [开发指导](codex-development-guide.zh-CN.md) 执行。
