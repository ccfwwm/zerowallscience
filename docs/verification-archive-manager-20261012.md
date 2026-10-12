# 归档管理插件独立发布与源码交付

`@michengai/dsh-archive-manager@1.0.17-zws.1` 已作为扩展中心可选插件发布。安装后通过设置中的「归档会话」管理归档、恢复、收藏与诊断；用户已确认正常。桌面仍为 8.1.3。

## 源码与版本

- 集成工作区分支：`main`，本次父 HEAD：`a807b52ef4023bed765b327bfd1aba2387ea8b62`。
- 插件源码仓库分支：`main`，本次父 HEAD：`53724a9122425ce77ecd579b7fbe1d5ac4428669`。
- 固定 DSH：`8c00ce78435cf35300654c41e69336e69dc758b1`，版本 `0.2.0-rc.2`。
- [上游](https://github.com/MichengAI/dsh-archive-manager)：commit `1f65ada8cc553fbea0a3cfa1564b9136ef196cf8`，版本 `1.0.17`，Apache-2.0。
- 插件路径：`packages/dsh/dsh-archive-manager/`。源码、测试、locale、assets 与许可证进入 Git；`lib/` 兼容链接及 `node_modules/` 不进入 Git。
- ZeroWall 适配将更新入口接到扩展中心；上游 npm 更新器不进入运行包。签名下载、candidate profile、健康检查、原子激活与回滚使用已有 8.1.3 桌面资源服务。
- 可选插件进入独立目录与打包清单，不加入桌面默认离线 profile。发布工具支持选定单个插件、复用其他已发布字节并检查并发发布基线。

插件仓库保留 8.1.3 的原始基线 catalog，并在 `catalogs/independent/dsh-archive-manager/1.0.17-zws.1/` 保存这次发布的完整原始签名 catalog 和 pointer。该发布目录包含此前线上已发布的 Python 0.1.8；它属于发布收据，本次不同步其他插件的源码版本。`source-provenance.json` 记录新增插件和集成提交，`source:verify` 核对可选插件源码、版本、兼容合同、正式签名及 catalog 字节完整性。

## 发布产物

| 项目 | 值 |
| --- | --- |
| Build ID | `archive-20261012-1f65ada8` |
| 本地产物 | `artifacts/release/8.1.3/plugins/dsh-archive-manager/1.0.17-zws.1/michengai-dsh-archive-manager-1.0.17-zws.1.tgz` |
| 大小 | `839560` 字节 |
| SHA-256 | `c2a0ec6b9d418797f44eebe1eec95c6f149359d5776fe4a5dc708e42935cc600` |
| 签名 | Ed25519，`stable-4` |
| Catalog 大小 | `68024` 字节 |
| Catalog SHA-256 | `cf2f8d1aada2bd05c22b7b3fa0e4a3ab915fe9c1bef79e3545e1e8acd066bd59` |

- [已发布插件包](https://zerowall.chengxunkeji.cn/stable/plugins/dsh-archive-manager/1.0.17-zws.1/michengai-dsh-archive-manager-1.0.17-zws.1.tgz)
- [不可变签名目录](https://zerowall.chengxunkeji.cn/stable/catalogs/plugin/8.1.3/archive-20261012-1f65ada8-1791808381650/catalog.json)
- [线上插件目录指针](https://zerowall.chengxunkeji.cn/stable/catalogs/plugin-latest.json)

发布时原有线上 38 个条目及签名完整保留，加入归档插件后共 39 个条目。公网指针、catalog、tarball 的签名、大小与 SHA-256 均通过验证；桌面 `latest.yml` 和 Skills、MCP、Python 指针保持原字节。本次源码提交不重新发布或覆盖此版本的资源。

## 验证结果与限制

提交前复测：

- `pnpm --filter @michengai/dsh-archive-manager test`：263 通过，0 失败，0 跳过。
- `pnpm --filter @michengai/dsh-archive-manager typecheck`：通过，仅有现有平台支持提示。
- `pnpm package:build dsh-archive-manager`：通过，构建输出进入 `artifacts/`；构建图与组件输入测试 8 项通过。
- `node --test tools/release/targeted-plugin-catalog.test.mjs tools/release/resource-publication-scope.test.mjs tools/release/plugin-dependency-contract.test.mjs`：8 通过。
- `pnpm test:security`：2 通过。
- `pnpm test:updates`：59 通过，0 失败，3 按原测试条件跳过。
- `pnpm dsh:inventory`：通过，已有 inventory 字节保持不变。
- `pnpm dsh:verify`、`pnpm profiles:check`、`pnpm dsh:runtime:closure`：通过；runtime closure 为 290 个 workspace 包。
- `pnpm version:check`：通过，桌面版本仍为 8.1.3。
- 插件源码仓库 `node tools/plugins/verify-source-repository.mjs`：通过，核对 22 个第一方插件、1 个可选插件和 328 个基线签名资源；`targeted-plugin-catalog.test.mjs` 的 4 项测试通过。

插件源码 checkout 尚未初始化 DSH 子模块和依赖，因此组合运行上述 3 个发布测试文件时有 2 项因找不到 DSH 内的 `semver` 依赖而失败（5 项通过）；对应测试在完整集成工作区 8 项全部通过。不降低测试断言。`pnpm release:metadata` 生成桌面发布元数据，本次独立插件源码交付不运行它，以免改写桌面发布指针。

此前本任务验收：

- 根 `pnpm typecheck`（包含 plugins:typecheck）完成，记录于 `artifacts/logs/8.1.3/archive-manager-root-typecheck.log`。
- 发布相关测试 16 项通过；22 个第一方插件 native pack 验证通过。
- `artifacts/verification/8.1.3/archive-manager/installed-7/receipt.json` 的 `complete=true`：真实已安装桌面 8.1.3、真实 pnpm、签名安装及一次 Host 重启；浏览器显示合成归档会话、打开扩展中心；合成会话归档、恢复、再次归档、永久删除；启停、健康检查失败恢复旧 profile、完整 profile 回滚均通过。首发没有旧插件版本，按合同拒绝无效的单插件回滚。
- `public-1/receipt.json` 的 `complete=true`：公网字节与签名核验、其他发布指针原字节核验、原有 8.1.3 资源服务展示归档插件并允许安装均通过。

保留失败事实：此前 `pnpm plugins:test` 在 Research 插件中出现 16 个失败（306 通过、3 跳过），不能报告全量插件测试通过。`live-electron-4/receipt.json` 验证安装成功且设置导航和归档面板可见，但严格页面错误断言捕获 `conversation.input: sessions service unavailable`，因此 `complete=false`；没有过滤该错误或弱化断言。正常重启桌面后用户确认功能正常，不据此将自动化失败改为通过。

本次没有重新构建桌面安装器，因此没有新增安装器路径、大小或 SHA-256，也未重跑桌面打包与完整 Electron 更新 smoke。插件源码仓库中的 DSH 子模块起初未初始化，编译与真实安装验收使用集成工作区固定的 DSH 与已安装 8.1.3。安装/日志/会话数据、凭据、私钥及编译输出均不提交。
