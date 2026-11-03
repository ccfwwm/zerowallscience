---
kind: upgrade-guide
description: "Windows 桌面未签名构建使用本地默认值，不再读取发布配置。"
---

# Windows 未签名构建使用本地配置

[English](guide.md) | 中文

## 变更

`pnpm run package:desktop:win:x64:unsigned` 忽略 `.env.windows`、机器 preset 和继承的发布配置。它使用 `com.zerowallscience.desktop` 作为应用 ID，并省略更新策略。曾向未签名构建传入自定义应用标识或更新服务的脚本，需改用签名打包流程来验证这些设置。

## 迁移

1. 如需本地测试安装包，先运行 `pnpm run package:desktop:win:x64:unsigned --check`，再执行不带 `--check` 的相同命令。无需发布配置或签名凭据。
2. 如需测试发布标识和更新功能，按[打包参考](../../../../apps/desktop/packaging/README.zh.md#configuration-and-local-builds)配置签名构建，再运行 `pnpm run package:desktop:win:x64`。签名凭据保留在配置的私有文件中。
3. 检查打包结果及本地测试路径 `.desktop-build/targets/win-x64/unsigned-artifacts/` 下的安装包。未签名构建不生成发布完成记录。
