# ZeroWall Science 6.8.0 发布记录

发布日期：2026-09-21。

## 代码与构建

- `codex/rmcp-omicverse-integration` 已快进合并到 `main`。
- 发布提交：`ae41800406ad94b1ea19490027b4d5aab787df1a`。
- 标签：`v6.8.0`，指向发布提交。
- DeepSeek Harness：`0.1.5-rc.2`，提交 `19978d57757923b798083d7406c06f3ea85a1983`。
- Windows x64 安装包已经通过 packaged Desktop 启动和版本检查。

## 发布结果

- [七牛云安装包](https://zerowall.chengxunkeji.cn/stable/releases/6.8.0/zerowall-science-6.8.0-win-x64.exe)
- [GitHub Release](https://github.com/ccfwwm/zerowallscience/releases/tag/v6.8.0)
- GitHub Release 为正式 Latest，非草稿、非预发布，六个附件均为 uploaded。
- 七牛云 Stable 更新入口已刷新至 6.8.0。

安装包：`zerowall-science-6.8.0-win-x64.exe`，341510605 bytes。

SHA-256：`dcfdfb7a8594317d567efa422b5c3462b04e8cc5fe1c85ec76304bf8a33ae01a`。

## 公网验证

七牛云和 GitHub 的安装包、blockmap、版本 JSON、`latest.yml` 以及两个更新入口文件均已从公网下载，大小和 SHA-256 与本地构建产物一致。

验证命令：

- `pnpm release:verify:stable`
- `node tools/release/verify-public-assets.mjs qiniu`
- `node tools/release/verify-public-assets.mjs github`
- `gh api repos/ccfwwm/zerowallscience/releases/latest`
