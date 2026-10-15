# 8.2.1 发布验收

## 基线与产物

本批次在共享 `main` checkout 从 `5cd514dc183e660946d36077127c6620ef2df6eb` 开发，没有创建 worktree。DSH 保持 `4af4cb76935bd893a6854f38403bd06928878074`，版本 `0.2.0-rc.2`。

最终 Windows x64 build ID 为 `1792065889129-22cf7af7`。构建 manifest 的源码提交为 `a927df838c3f3b3f53b1ca3949b0a259911bab9c`，`source.clean=false`：还包含随后提交为 `bb69a1be` 的打包历史修复、组合包版本和说明改动。不能将安装包描述为仅由 manifest 中的提交重现。

| 项目 | 验收值 |
| --- | --- |
| 安装器 | `artifacts/packages/8.2.1/windows-x64/zerowall-science-8.2.1-win-x64.exe` |
| 大小 | 317,501,659 字节 |
| SHA-256 | `6e35076ec1ba27a2995f4b4e5f83b0c73441affd9b264fc1be7493dea4cf0f3d` |
| blockmap 大小 | 331,543 字节 |
| blockmap SHA-256 | `755f920b659f482b0989cfcd7bd41ca4864100b7ad74716a5dce9bfb59eb4002` |
| 实际命令输出 | `dsh --version`: `0.2.0-rc.2`；`zws --version`: `8.2.1` |
| 已安装资源 / 签名离线闭包 | 5,167 / 1,043 项 |
| Authenticode | 未签名；资源目录和离线闭包使用 stable-4 Ed25519 签名 |

实际命令由最终打包 Electron 在 `ELECTRON_RUN_AS_NODE=1` 下同步执行并检查 stdout，收据为 `artifacts/verification/8.2.1/final-v3-command-versions.json`。

## 修复范围

- 删除 Progressive Tools 的受跟踪源码、workspace、锁文件及有效 profile/工具注册，恢复 DSH 原生调用，避免新的 `exit_plan_mode` 被包装为 `tool_dispatch`。保留历史会话读取兼容，历史计划不迁移。
- 迁移受影响的官方 Skills、引用文档、路由生成器、研究/R/Python/MCP/文件工作流。188 个内容变化的官方 Skill 递增资源版本；不变归档继续复用。
- 本机启用目录有 3 个用户 Skill，旧路由命中为 0；停用目录不存在。实际迁移收据 records=0、failures=0，没有改写用户 Skill 或固定元数据。282 个最终 Skill 归档均通过 hash 和旧路由审计。
- 修复扩展更新对旧 `8.2.0` 本地 `file:` tarball 的依赖：从签名目录准备依赖闭包、验证后缓存，修复候选 profile 和 lock 中的失效路径，维持事务和健康检查。
- 打包历史同时读取经过验签的公网资源目录，覆盖“同一桌面版本下独立发布插件”的情况；缓存命中也必须经过不可变内容检查。实质变化的资源递增版本，不覆盖已发布的同版本对象。
- 保留 `dsh-bundle-science` 的组合声明功能，版本为 `0.1.15`。AI Cloud `0.1.16`、扩展中心 `0.1.12`、MCP 插件 `0.2.12`、Skills 插件 `0.2.5`。

## 自动化与真实更新

本批次通过 `pnpm dsh:inventory`、`pnpm dsh:verify`、`pnpm profiles:check`、`pnpm dsh:runtime:closure`（290 个 workspace 包）、`pnpm version:check`、`pnpm typecheck`、`pnpm plugins:typecheck`、`pnpm plugins:test`、`pnpm test:security`、`pnpm test:updates` 和 `pnpm plugins:verify-pack`。

| 验证 | 结果 |
| --- | --- |
| 插件测试 | 731 通过、7 跳过 |
| 最终更新测试 | 69 通过、3 跳过，0 失败 |
| 发布历史与不可变归档回归 | 5/5 通过 |
| 合同与发布测试 | 92 通过、2 跳过 |
| DSH 原生计划相关回归 | 7 个文件、144 通过，覆盖批准/取消/修改/重开/分页 |
| 原生包验证 | 22/22 通过 |
| 最终 `pnpm verify:package` | 通过，包含 ASAR/离线闭包、Host、桌面启动、About 8.2.1 和中英文设置切换 |
| 最终 `pnpm smoke:host` | 通过 |
| 最终 `pnpm smoke:electron` | 18/18 通过，0 跳过 |
| 最终 `pnpm smoke:update` | 通过 |

插件测试最初在未指定解释器的 shell 中有 16 项失败；随后使用本机固定安装根的 Python 重新执行完整插件组，通过上述结果。没有更换用户模型、降低断言或改用其他协议。跳过项涉及未提供的私有/远程 fixtures、SciMaster bundle、Zotero replay 和未配置独立 Electron 路径的单测；真实打包 Electron 另行完成以下验收，不能据此声称所有远程科研服务可用。

最终包在隔离用户目录通过真实 pnpm 和 Host 完成 AI Cloud `0.1.16`、扩展中心 `0.1.12` 的批量更新，签名依赖闭包共 7 个包，Host 只 stop/start 各一次；完整 profile 回滚，以及注入候选 Host 健康失败后的旧 profile/Host 恢复均通过。`artifacts/verification/8.2.1/plugin-batch-1792065889129-22cf7af7/batch-receipt.json` 为 `complete=true`，launcher exit 0。没有对真实用户 profile 执行更新。

## 隔离覆盖安装

使用最终 `win-unpacked` 载荷生成专属测试 appId 的 NSIS 安装器，在临时中文目录覆盖含过期物理文件的离线副本；没有重新生成或替换正式安装器。第一次验收因命令注册恢复工具仍预期上游 PATH prepend 顺序而退出 1；实际 ZeroWall 的已适配 worker 将命令路径 append。修正验收工具并使用实际生成的 worker 测试后，原快照的 PATH 值、类型与 owner 已精确恢复，外部并发改动拒绝保护保留。

重新执行隔离安装 exit 0，`installer-test-821/installation-receipt.json` 为 `completed=true`：旧载荷先被拒绝，新载荷 1,042 个 payload 文件通过正式验签（加收据共 1,043 项），安装 ASAR 与正式候选一致，729 个 Office 物理资源齐全，用户 sentinel 保留，命令注册精确恢复。ASAR SHA-256 为 `88d469962817b9186515ab8d2c69493f8c2d0bc6e48392821eb952c494cd7163`。日志 `final-v3-isolated-installation.log` 保留首次失败，`final-v4-isolated-installation.log` 记录成功；不能将首次命令描述为直接成功。

验收工具测试覆盖实际 append 顺序、原 PATH 顺序与值类型、注册前失败 no-op、原值缺失、预先存在的同路径、旧 owner 重复项，以及并发修改拒绝。未测试生产安装注册与机器级 UAC，没有取得可选安装性能 trace。

## 七牛资源

最终 generation 为 `1792065889129-22cf7af7-1792066084155`，四组签名目录含 39 个插件/支持包、282 个 Skills、2 个 MCP 和 6 个 Python 资源。执行 `node scripts/publish-resources.mjs stage`、`promote`、`verify` 成功，共 333 个不可变对象和 4 个最新指针。

39 个插件普通公网 URL 全量 GET 的大小和 SHA-256 均一致，共 79,821,587 字节；329 个资源条目签名、兼容性和 105 条插件内部依赖均通过。提升后四个无 query 最新指针及对应 catalog 再次核验通过，无 Progressive Tools 有效条目。

- 插件指针：<https://zerowall.chengxunkeji.cn/stable/catalogs/plugin-latest.json>
- AI Cloud：<https://zerowall.chengxunkeji.cn/stable/plugins/plugin-ai-cloud/0.1.16/zerowallscience-plugin-ai-cloud-0.1.16.tgz>，SHA-256 `5cccd29c347beed2c9d4bf3f0c54bbd1c3fd50e5d7ca0ba0b1c0c93e1fb60b62`。
- 扩展中心：<https://zerowall.chengxunkeji.cn/stable/plugins/plugin-extension-center/0.1.12/zerowallscience-plugin-extension-center-0.1.12.tgz>，SHA-256 `fcc0a911662c48bdb74b84277189dd6db588e2c76d2b354b5df460b8d0e6a701`。

资源收据位于 `artifacts/release/8.2.1/publication/`；独立普通 URL 审计位于 `artifacts/verification/8.2.1/qiniu-catalog-promoted-final-1792065889129-22cf7af7.json`。软件安装器普通公网 URL 已全量 GET 核验，收据为 `qiniu-installer-normal-url-final.json`。

## 七牛桌面

隔离安装与真实插件更新完成后，`pnpm release:publish:stable` 和 `pnpm release:verify:stable` 均 exit 0。正式发布复用已核验的安装器、blockmap 和版本 JSON，不覆盖任何不同字节的版本对象；桌面三个 Stable 指针已提升至本次 8.2.1。

- 下载：<https://zerowall.chengxunkeji.cn/stable/releases/8.2.1/zerowall-science-8.2.1-win-x64.exe>。
- `stable/latest.yml`：2,264 字节，SHA-256 `05778b7f7c43ae461d594baf6ce5bb097dac9be6d71a642c129bd91ac8830ccb`。
- `stable/releases/latest.json` 和 `stable/releases-zerowallsciencedev/latest.json`：各 2,325 字节，SHA-256 `839ed1846c47c90e64da6e807c06f97df9d8fe530a8ef7bf84ead723415ffe0f`。

收据为 `artifacts/release/8.2.1/publication/qiniu-desktop-public.json`；日志为 `final-v3-desktop-publish.log` 和 `final-v3-desktop-verify.log`。

## 边界

本次只构建 Windows x64；没有覆盖测试真实用户 profile、机器级 UAC、所有远程科研 API 或实际用户账户下的模型生成计划。原生计划交互由 DSH 回归覆盖，打包运行时另经 Host/Desktop 验收。已经安装同为 `8.2.1` 的用户需要下载本次安装器覆盖安装，桌面版本比较不会将同版本识别为更高版本；插件仍通过独立目录更新。

两个旧 Progressive Tools 目录还存在生成输出 junction 和依赖目录。精确删除输出链接曾被自动审批拒绝（`blocked by policy`），未绕过；受跟踪源码、有效注册、最终 ASAR/runtime closure 和资源目录已移除该插件。用户数据、凭据、密钥、node_modules、已有缓存和其他未跟踪文件没有纳入提交。
