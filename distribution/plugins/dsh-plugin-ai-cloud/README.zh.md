# @zerowall/dsh-plugin-ai-cloud

[English](README.md) | 中文

## 摘要

在 9.x 正式桌面端中，记住的凭据通过父进程私有 IPC 访问 Electron 的操作系统加密保险库。子进程断开或超时时，操作报错并释放监听器；其他 Host 保留原有凭据提供方。

提供 ZeroWall 登录、模型目录、聊天与媒体调用。凭据保存在 Host 安全存储。登录后同步模型目录，再在对应业务插件中选择模型。

登录、注册与找回密码共用响应式品牌弹窗，并在首次运行说明之后依次展示。连接详情默认收起。云账户设置页分为账户概览、充值与订单、模型服务三个页签，正文只有一个主滚动区。插件实例在页签间共享账单和模型状态；关闭页面后支付轮询继续。密码与验证码仅保留在认证表单，明确记住的凭据仍由 Host 安全存储保存。

明确标记为 Gemini 类型分组中的聊天模型使用 Google Generative Language 原生流式协议。分组名称包含“生图”时按图像生成能力处理，继续使用媒体接口，不会注册为 Gemini 聊天模型。

Claude 聊天模型支持选择 Low、Medium、High 思考强度。自适应思考模型另提供 Max，并在支持时提供 Xhigh，通过原生自适应思考和输出强度参数发送；较早的思考模型使用令牌预算。不支持的档位和网关不兼容的 Off 选项不显示。更新此插件后重启桌面端，即可加载新的模型能力。

## 使用

托管模型优先使用支持的 Xhigh，其次为 High，再选择支持的档位；保留用户明确选择且受支持的强度。账户提供 `gpt-6.2-sol` 后，尚未配置或原有 DeepSeek 默认值改为该模型与 `xhigh`；保留其他明确选择的模型。SDK 支持 `gpt-6.2-sol`、`gpt-6.2-astra` 和 `claude-fable-5-2`。

托管模型的上下文容量与输出能力互相独立。目录中的输出能力不作为每次请求的上限。调用方未指定时，OpenAI Responses、Chat Completions 和 Gemini 不发送可选输出限制；Anthropic Messages 必须提供 `max_tokens`，使用模型声明的输出能力。模型和网关自身限制仍然适用。上游返回截断但没有生成内容或输出用量时，报告可重试的 `EMPTY_RESPONSE`，不再显示为正常耗尽输出额度。

生成的 [models.dev 容量参考表](src/account/host/models-dev-context.ts)会记录数据来源、获取时间及原始响应的 SHA-256。运行 `pnpm --filter @zerowall/dsh-plugin-ai-cloud run models:refresh` 可刷新数据；网关容量仍优先，模型原厂的直接记录优先于第三方服务商的记录。

每次启动立即使用内置或缓存的容量信息，并异步刷新 models.dev，网络超时为 20 秒。刷新失败保留可用数据。验证后的缓存原子写入 DSH 主目录下的缓存目录；释放插件时取消刷新并等待完成。

ZeroWall Desktop 根据安装清单选择此包。在插件页检查状态和插件提供的配置。验证基线为 DSH 0.2.2-rc.1 和 Node.js 24.9 或更新版本。更新时保留已有配置与数据。

详细工作流及历史平台要求见[保留的迁移参考](migration-reference.md)。当前依赖版本以包清单为准。

## 开发

在仓库根目录构建并检查压缩包：

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
```

再发行时保留包内 LICENSE 及第三方声明。

账户页头可刷新账户资料和模型。已保存登录凭据时先重新认证；未保存密码时刷新当前会话及模型目录。新用户默认使用 XYZ 直连，随后为 HK 香港和 CN 备用；已明确选择的节点继续保留。
