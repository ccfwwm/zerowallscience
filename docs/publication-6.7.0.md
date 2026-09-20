# ZeroWall Science 6.7.0 发布记录

发布日期：2026-09-20。

## 代码与构建

- 功能分支 `codex/biomni-model-routing` 已快进合并到本地 `main`，并推送至 `origin/main`。
- 发布代码提交：`acf734b4f53ea96631ec937618dce7da66868ac3`。
- 注解标签：`v6.7.0`，指向上述发布提交。
- DeepSeek Harness：`0.1.5-rc.2`，提交 `fcf35ae8707237f7d7963a8182652ef706f08fb5`。主仓子模块、版本配置和包内构建记录一致；该提交可从 `ccfwwm/deepseek-harness` 获取。
- 使用已通过桌面完整验证的 Windows x64 安装包，未替换为历史产物。
- 本地测试与修复详情：[validation-6.7.0.md](validation-6.7.0.md)。

## 发布结果

先上传七牛云并完成公网验证，再推送 GitHub 代码和标签，发布 GitHub Release。

- [七牛云安装包](https://zerowall.chengxunkeji.cn/stable/releases/6.7.0/zerowall-science-6.7.0-win-x64.exe)
- [GitHub Release](https://github.com/ccfwwm/zerowallscience/releases/tag/v6.7.0)
- GitHub Release 已设为 Latest，非草稿、非预发布，六个附件均为 uploaded。
- 七牛云三个 Stable 更新入口已刷新至 6.7.0。

安装包：`zerowall-science-6.7.0-win-x64.exe`，341453611 字节。

SHA-256：`ae9b1974c102c6fb462f397f735fd9916b7eb166ca66dce629ddc05471f0c17b`。

## 公网验证

| 发布渠道 | 验证结果 |
| --- | --- |
| 七牛云 | 六个文件均从公网完整下载，大小和 SHA-256 与本地一致，包含安装包、blockmap、版本 JSON 和三个更新入口文件。 |
| GitHub | 六个附件的服务端大小和 SHA-256 与本地一致；五个小附件已下载并重新计算哈希，全部一致。 |

GitHub 安装包公网下载遇到 ECONNRESET、连接超时和低速；尝试普通下载、分段下载及 GitHub CLI 后仍未完成整包下载。因此不宣称完成 GitHub 安装包的本地重算哈希验证。七牛云安装包已完成该验证。

GitHub 初次批量创建 Release 遇到同名附件冲突；该次 Release 未保留。随后通过草稿逐项上传，核对全部附件后发布，未覆盖既有正式版本。

本地证据位于 `test-results/qiniu-public-verification-6.7.0.json`、`test-results/github-public-verification-6.7.0.json` 和 `test-results/github-release-final-6.7.0.json`。
