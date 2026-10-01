# ZeroWall Science 7.5.0 发布验收

2026 年 10 月 1 日，按用户要求先发布七牛云、校验公开下载，再发布 GitHub 正式 Release。本次使用已通过安装验收的修复安装包，没有重新构建、重新打包或改写安装包。

## 下载与代码

- [七牛云 Windows x64 安装包](https://zerowall.chengxunkeji.cn/stable/releases/7.5.0/zerowall-science-7.5.0-win-x64.exe)
- [GitHub Release v7.5.0](https://github.com/ccfwwm/zerowallscience/releases/tag/v7.5.0)
- [GitHub Windows x64 安装包](https://github.com/ccfwwm/zerowallscience/releases/download/v7.5.0/zerowall-science-7.5.0-win-x64.exe)
- 功能提交：`34f023a0010332e36da8881893cbcdde3d039610`，分支 `codex/dsh-file-preview-ppt-visual` 已推送。
- main 合并提交：`3d2cd7087575a078187e5c5c71a479831d18bf68`，已推送。
- 注解 tag `v7.5.0` 指向上述 main 合并提交。后续发布文档提交不改变发布软件代码或 tag。
- DSH 子模块保持 `0.2.0-rc.2` / `93bacb7e30c888cc01a1322245a33ff3be9ff2b3`，本次未修改子模块。

GitHub 正式发布时间为 `2026-10-01T03:05:07Z`（北京时间 11:05:07），Release ID 为 `400614717`。发布后 API 确认 `draft=false`、`prerelease=false`，latest Release 为 `v7.5.0`，六个资产均为 `uploaded`。

## 资产一致性

七牛六个公开对象全部返回 HTTP 200，下载内容的字节数和 SHA-256 与发布前本地证据一致。GitHub 六个资产的大小、服务器 SHA-256 digest 也全部一致；另外通过无需认证的公开 GitHub 安装包 URL 完整下载、流式计算 SHA-256，再次核对安装包。

| 本地及 GitHub 资产名 | 字节数 | SHA-256 |
| --- | ---: | --- |
| zerowall-science-7.5.0-win-x64.exe | 397,467,215 | `d9621384664b2572814cb73476848fdc32479e85daf399c2bbf55db42fd6a37f` |
| zerowall-science-7.5.0-win-x64.exe.blockmap | 412,518 | `6af50d70f89df3a316300bbb9305bf585c6e682454ab8cb0b915478e040aa61e` |
| zerowall-science-7.5.0-latest.json | 3,157 | `27852a00a642700c7a1c69627439865316936112e086d993c5cbae927a28c4b1` |
| latest.yml | 3,109 | `abf47ffb0317809ab079766e61c54bc8336ff81725c6b3285a7d9cd07c23a3b7` |
| releases-latest.json | 3,157 | `27852a00a642700c7a1c69627439865316936112e086d993c5cbae927a28c4b1` |
| releases-zerowallsciencedev-latest.json | 3,157 | `27852a00a642700c7a1c69627439865316936112e086d993c5cbae927a28c4b1` |

七牛安装包、blockmap 和版本 JSON 使用 `stable/releases/7.5.0/` 不可变路径，首次上传未启用覆盖。三个更新入口分别为 `stable/latest.yml`、`stable/releases/latest.json` 和 `stable/releases-zerowallsciencedev/latest.json`；CDN 已刷新，公开内容均为 7.5.0。

## 安装验收与边界

本次发布沿用 [安装包验收](package-verification-7.5.0.md) 的 42 项真实安装后预览及转换回归、Host / Desktop 包审计和输入完整性检查。Office、Excel 默认进入 DSH 原生查看器；Office→PDF 的 `undefined.trim` 已修复；SHP 在五个入口进入通用 GIS 查看器。详细范围见 [Office / GIS 修复报告](office-gis-repair-7.5.0.md) 和 [发布说明](release-notes-7.5.0.md)。

本次 main 推送触发的 [远程 CI](https://github.com/ccfwwm/zerowallscience/actions/runs/36808053958) 未通过：Windows 和 Linux 均在 DSH 分支预检处报 `DSH branch must be master, received (detached)`。`actions/checkout` 检出子模块为 detached 状态，而现有校验器要求本地分支名为 master；后续 CI 步骤被跳过。本报告不将该远程 CI 计为通过，也不声称全仓组合检查全部通过。该限制与已完成的安装包运行验收分别记录，本次发布没有修改 CI 或软件载荷。

## 本地发布证据

- `.build/qa/750-release-preflight.json`：发布前六个资产身份、配置存在性及不可变对象不存在性。
- `.build/qa/750-release-qiniu-publish.log`：上传及 CDN 刷新结果。
- `.build/qa/750-release-qiniu-verify.log`、`750-release-qiniu-matches.json`：六个公开下载对象与本地逐项比较。
- `.build/qa/750-release-github-create.log`、`750-release-github-draft-matches.json`：草稿上传与发布前资产核对。
- `.build/qa/750-release-github-public-verify.log`、`750-release-github-public-matches.json`：正式 Release、latest、六个资产 digest 和公开安装包下载哈希。
- `.build/qa/750-release-main-ci-failure.log`：远程 CI 失败原因。

安装阶段报告中的“未发布”记录是当时的验收边界；后续发布状态以本报告为准。忽略的配置、凭据、旧安装包、QA 产物及其他工作目录均保留。
