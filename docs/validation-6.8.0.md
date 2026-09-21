# 6.8.0 本地与七牛云验证记录

## 构建

- 应用版本：6.8.0，Windows x64，Electron 43.4.0。
- DeepSeek Harness：0.1.5-rc.2，提交 `19978d57757923b798083d7406c06f3ea85a1983`。
- `pnpm build`、桌面运行时准备和 Windows x64 安装包构建通过。
- packaged Desktop 启动、Settings 版本显示和运行时完整性检查通过。

## 安装包

- 文件：`zerowall-science-6.8.0-win-x64.exe`
- 大小：341510605 bytes
- SHA-256：`dcfdfb7a8594317d567efa422b5c3462b04e8cc5fe1c85ec76304bf8a33ae01a`

## 七牛云公网校验

上传顺序遵循发布流程，先发布七牛云，再进行 GitHub 发布。以下六个文件均从公网 HTTP 200 下载，并与本地大小和 SHA-256 一致：

- Stable 安装包及 blockmap
- 6.8.0 版本 JSON
- `latest.yml`
- Stable `latest.json`
- ZeroWallScienceDev `latest.json`

验证命令：`pnpm release:verify:stable`、`node tools/release/verify-public-assets.mjs qiniu`。
