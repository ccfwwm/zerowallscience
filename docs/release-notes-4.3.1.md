# ZeroWall Science 4.3.1

## 配置与能力恢复

- 恢复 Reviewer 的跟随会话/固定模型、Provider、模型和推理强度配置，并迁移旧设置而不覆盖自动审核状态。
- 新增“环境配置”菜单：Reviewer、SciMaster API Key、自定义环境变量和生图模型选择。
- 自定义变量通过 Electron safeStorage 保存，变量值不会返回 Renderer，也不会写入会话、提示词或日志；变量仅注入 Host、MCP 及明确允许继承环境的子进程。
- 生图请求支持显式模型、环境配置模型和账户目录自动选择，不再依赖单一硬编码模型。
- 左下角恢复 GitHub 项目入口。

## 桌面兼容性

- 修复 `.tmp-picker-test.cjs` 在收到 `showing` 后提前终止的问题。
- 新增 `pnpm smoke:directory-picker`，报告 worker stderr、退出码、native 依赖和超时信息，并等待 `done`/`error` 结果。

## 发布范围

- 版本：`4.3.1`，兼容 DSH `0.1.1-rc.2`。
- 本次仅生成本地 Stable Windows x64 安装包及元数据。
- 不上传七牛云，不执行 Git commit、Git push、GitHub Release 或线上 metadata 更新。
