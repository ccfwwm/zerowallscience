# FAERS 通用药名审核与中文报表流程更新

本次独立发布 `@zerowallscience/plugin-mcp@0.2.53` 与 `zerowall-faerskit@0.1.16`。药物分析先从数据库发现全部分页候选，记录同条 DRUG 记录的药名与成分证据，再经过 AI 审核和必要的用户确认。Host 在提交前检查主药、比较药、联用药和排除药物的范围记录，避免把单标准名检索当作完整药物分析。

Skill 保留主分析中文业务报表，以综合报告补充解释；下载通过 Host `r_files` 完成，并按 Manifest 校验大小和 SHA-256。基线、年度和季度输出采用明确的粒度名称，目标 PT 分层为 `NO_target_PT`、`target_PT`、`Overall`，Overall 最后。报告与最终本地交付逻辑由已部署的 R 服务提供，客户端资源不内嵌客户数据。

资源已在七牛云正式目录中。本次复用相同 ID/版本的已签名不可变归档，现场重新下载验证；没有覆盖旧版本或重新压制改变字节。GitHub 随附相同归档、stable-4 签名 catalogs、指针、发布清单和 SHA256SUMS。

| 资源 | 版本 | 字节数 | SHA-256 |
|---|---|---:|---|
| MCP 插件 | 0.2.53 | 418,011 | `4d8edffdb63c5ff72063f736407dfc166ad86d1596be0c485cd93600f79b56e2` |
| FAERS Skill | 0.1.16 | 19,274 | `3904e43f5f361af73202e7976812f72df83418d3455e7ca542f847adeccc626c` |

七牛云下载：

- [MCP 插件 0.2.53](https://zerowall.chengxunkeji.cn/stable/plugins/plugin-mcp/0.2.53/zerowallscience-plugin-mcp-0.2.53.tgz)
- [FAERS Skill 0.1.16](https://zerowall.chengxunkeji.cn/stable/skills/zerowall-faerskit/0.1.16/zerowall-faerskit.tgz)
- [插件更新指针](https://zerowall.chengxunkeji.cn/stable/catalogs/plugin-latest.json)
- [Skill 更新指针](https://zerowall.chengxunkeji.cn/stable/catalogs/skill-latest.json)

验证：

- 两个公网资源与本地归档的大小、SHA-256 一致；签名指针、catalog 与各条目均通过 stable-4 验证。插件和 Skill feed 分别包含 40 和 281 个资源。
- 维护发布器的 `verify --reuse-published` 分别通过 41 和 282 个不可变对象清单及各自签名指针检查。
- Skill 的 7 个文件与已发布归档一致（SKILL.md 正文与引用逐项核对，版本元数据由 catalog 注入），生成引用 `--check --skill=zerowall-faerskit` 通过。
- MCP Host 工作流 35 项回归通过；源码定向导出与 Skill 快照 15 项、模块来源 4 项通过；DSH pin、profiles 和桌面版本合同检查通过。
- 修复源码导出器对已迁移原生插件仍优先使用历史上游版本记录的问题。定向导出仅更新 MCP、FAERS Skill 和必要生成器/来源文件；共享稳定锁只同步本次两个资源的条目，保留其他并行修改。

源码分支均为 `main`。客户端业务提交 `15ad33a0471a9f38b36ae8f955b826eaa5e4825c`；发布工具修复提交为 `c6cc7960292cf35d167eb9906a5c99f8003420de`，父提交同为该提交。插件源码仓库发布前父提交为 `e91fe9cc9c1a5c3d1074c6fca3ecf03c8e57ea61`。资源交付 ID 为 `faerskit-resources-20261103`；本地资产位于 `artifacts/release/8.4.22/faerskit-resources-20261103/`。

桌面仍为既有 8.4.22；DSH 仍为 `cb61e6caf4664e82fc4bf30e9a15d0d8bf32293a`。本次没有重打桌面、修改桌面 `latest.yml`、部署其他服务或增加 CPU/内存配额。没有重新执行桌面安装/GUI 验收或全量资源重打。当前已安装版本的磁盘校验收据已有记录；本次验收只证明公开软件资产及源码同步，不声明当前 GUI 已加载的版本。

客户端通过正常扩展更新操作应用资源；MCP 插件更新需重启 Host，Skill 可热刷新。仅查询更新目录不会触发用户客户端安装。

GitHub 资源发布：[faerskit-resources-20261103](https://github.com/ccfwwm/zerowall-dsh-plugins/releases/tag/faerskit-resources-20261103)。定向导出的 60 个交付源码文件与主仓库逐字节一致；合并清单和锁文件按所选资源独立检查。

## GitHub 发布后的独立复核

2026-11-03T14:51:33.210Z 完成 GitHub Release 全部 8 个资产的重新下载。首次 Node 直连 github.com 下载超时，改用维护的 GitHub CLI 实际下载成功；不是只读取服务端 digest。下载文件逐项与本地原件、GitHub digest 及 SHA256SUMS 核对。两个归档再次与七牛公网下载比较，大小和 SHA-256 完全一致；下载后的 catalog、指针及全部条目签名通过。

- 插件源码 `main` 与发布 tag 都指向 `5c3d38c0d5f0c46e5fae6330e2a5241580f461db`，父提交 `e91fe9cc9c1a5c3d1074c6fca3ecf03c8e57ea61`；源码仓库工作区干净。
- 本文在客户端 `main` 记录，文档提交的父提交为 `c6cc7960292cf35d167eb9906a5c99f8003420de`；客户端业务父基线 `15ad33a0471a9f38b36ae8f955b826eaa5e4825c`。
- GitHub 桌面 Latest 仍为 `v8.4.22`；资源发布使用独立仓库，并明确设置 `--latest=false`。
- 公网下载校验收据：`artifacts/verification/8.4.22/faerskit-resource-release-20261103/github/github-public-verification.json`。
- 原有其他插件和共享清单的待提交修改均保留，没有进入本任务提交。

本次针对性验收共 54 项测试通过（35 Host、15 导出/快照、4 来源）；另通过 Skill 引用生成校验、DSH pin、profiles、版本合同和维护发布器 verify。未重新执行完整桌面构建、安装或 GUI 验收，也未运行全量插件资源打包与全量稳定锁检查。
