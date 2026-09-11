# ZeroWall Science 5.18.0

## 本次更新

- 内置 `dsh-genui` 更新至上游 `v0.9.9`，同步 GenUI 运行时协议校验、组件兼容性修复和新增测试覆盖。
- 修复 Diff、Code、JSON 等组件在 DSH `0.1.2-rc.1` 宿主中的中文标签与复制交互兼容性。
- 强化 `dsh-ui` 规范归一化、校验、修复和诊断，减少模型输出字段差异导致的渲染问题。
- 保留并打包当前工作树中的 ZeroWall Literature、账户登录和模型价格相关更新。

## 兼容性

- `dsh-genui` 版本：`0.9.9`。
- 支持当前 ZeroWall Science 内置的 DSH `0.1.2-rc.1`。
