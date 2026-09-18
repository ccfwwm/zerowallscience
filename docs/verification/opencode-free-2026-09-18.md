# OpenCode 免费模型故障调查（2026-09-18）

当前源码基线为 `7920a7c2`（6.2.1），接入包为 `@jiesou/dsh-opencode-zen-free-provider@0.1.18`。

## 实际请求结果

从本机向 `https://opencode.ai/zen/v1` 发送最小提示词请求：

| 请求 | 结果 |
| --- | --- |
| GET `/models` | HTTP 200，仍列出免费模型 |
| MiMo V2.5 Free、Big Pickle、Ling 3.0 Flash Fin Free、Nemotron 3 Ultra Free | HTTP 403，`FreeTierError` |
| Muse Spark 1.3 Contributor Free | HTTP 403，`RegionError`，当前国家不可用 |
| DeepSeek V4 Flash Free | HTTP 400，`Model is unavailable`；models.dev 也标记 deprecated |

主要拒绝消息：

```text
Error from provider (Console): OpenCode's free tier can only be used from within OpenCode
```

无凭据及 `Bearer public` 均被拒绝。目录中存在、价格为零和推理可用是不同事实。当前包已是 npm latest；本次未发现可直接升级以恢复访问的更新。上述结果只代表检查时刻与本机出口。

## 本地修复

- 模型设置页原本把密钥存为 `OPENCODE_ZEN_FREE_PROVIDER_API_KEY`，插件却只读取 `OPENCODE_ZEN_FREE_API_KEY`。增加 schema 中的 `apiKeyEnv`，默认与设置页一致；未指定自定义引用时兼容旧名称。每次请求重新读取，支持密钥轮换。
- 为上游 client-only 的 `FreeTierError` 提供中文原因及切换建议，保留原始拒绝消息，继续标记为 unavailable，不误报为需要登录。
- 保留原有目录重试、刷新通知、推理级别映射及协议选择补丁。

此修复不宣称恢复上游匿名免费权限，也不保证设置 API 密钥可解除免费模型限制。需要免费模型时使用 OpenCode 官方客户端；ZeroWall 内可切换已配置且可用的其他模型。没有替换用户默认模型或发布安装包。

## 验证

### 按官方 OpenCode ID 算法的实时请求

核对上游提交 `b02acc1e30ef55f7f181fec8d2f241d26f022683` 的
`packages/opencode/src/id/id.ts` 及 `packages/schema/src/identifier.ts`：会话 ID 使用
`Identifier.descending("session")`，消息请求 ID 使用
`Identifier.ascending("message")`。生成的一组实际 ID 为：

```text
x-opencode-session: ses_f4d617a0fffehbTtupfFlL57fR
x-opencode-request: msg_0b29e85f0002S7e09hCtvUitHG
```

本次通过 Node.js fetch 发送请求，使用用户指定的 User-Agent 字符串及以下头部；这不等同于实际运行 OpenCode/Bun 客户端：

```text
User-Agent: opencode/1.18.31 ai-sdk/provider-utils/4.0.40 runtime/bun/1.3.14
x-opencode-client: cli
x-opencode-project: global
Authorization: Bearer public
```

`POST https://opencode.ai/zen/v1/chat/completions` 的 `mimo-v2.5-free` 和
`big-pickle` 均返回 HTTP 403：

```json
{"type":"error","error":{"type":"FreeTierError","message":"Error from provider (Console): OpenCode's free tier can only be used from within OpenCode"}}
```

本次响应时间为 2026-09-18 03:45:30 UTC，两个模型复用了上述测试 ID。
结果表明按官方算法生成 ID 并设置这些头部，仍不足以让该直连请求成功。
上游返回免费层来源限制，但具体校验机制尚未确定；不能仅凭该响应断言服务端已认可 ID，或排除其他请求差异。

结果：OpenCode 接入回归 8/8 通过，运行时契约 16/16 通过；`git diff --check` 通过。冻结锁文件安装完成，已确认实际依赖包含新补丁。这里的回归使用受控网络响应，不代表上游免费推理成功；实际网络结论见上表。

回归覆盖：设置页引用、旧名称兼容、自定义引用、轮换、匿名回退、真实拒绝信封、目录重试、文本/图片探测、协议路由及真实认证错误分类。运行命令：

```powershell
pnpm exec vitest run --config vitest.plugins.config.ts tests/contracts/opencode-zen-provider.test.ts
node --test tests/contracts/runtime-contract.test.mjs
```
