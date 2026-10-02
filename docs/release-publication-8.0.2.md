# ZeroWall Science 8.0.2 发布验收

发布日期：2026-10-02。主分支合并提交：`835e6d550c7ab5d65dbca430e6a5470614cee2ae`。DSH 子模块保持 `93bacb7e30c888cc01a1322245a33ff3be9ff2b3` / `0.2.0-rc.2`。

## 桌面安装包

- 七牛稳定下载：[zerowall-science-8.0.2-win-x64.exe](https://zerowall.chengxunkeji.cn/stable/releases/8.0.2/zerowall-science-8.0.2-win-x64.exe)
- GitHub Release：[v8.0.2](https://github.com/ccfwwm/zerowallscience/releases/tag/v8.0.2)
- 大小：`389835467` bytes。
- SHA-256：`7d172cb63ac0ad62eb302e08c6d03112cf9b9a2d0b6d23eac0d06cf023babfb8`。
- 七牛对象：`stable/releases/8.0.2/`，版本对象不可覆盖。
- Windows `Get-AuthenticodeSignature`：`NotSigned`；此版本没有 Authenticode 签名。
- 七牛上传后已回读完整安装包、blockmap 和元数据，字节数与本地 artifact manifest 一致；GitHub Release 上传后会再次下载小文件并核对摘要，安装包使用 GitHub 服务器 digest 与七牛/本地 SHA-256 对照。

## 独立资源

七牛资源根目录：`https://zerowall.chengxunkeji.cn/stable/`。

- `stable/plugins/<id>/<version>/`：28 个插件/支持包。
- `stable/skills/<id>/<version>/`：281 个确定性 Skills 包。
- `stable/mcp/`：SciMaster Server 包与 R 平台连接模板。
- `stable/python/`：科学 Python 依赖清单，不包含大型 Python base archive。
- `stable/catalogs/`：plugin、skill、mcp、python 四类 stable-3 Ed25519 签名 catalog 和不可变版本目录。

316 个不可变对象已上传并逐项回读校验，包含 4 个 catalog 版本对象；4 个 `*-latest.json` 指针已在完成校验后更新。指针只检查、验签和显示更新，客户端不会自动安装。

源码总仓库：[ccfwwm/zerowall-dsh-plugins](https://github.com/ccfwwm/zerowall-dsh-plugins)。其 `main` 首次提交 `5f24c8c`，包含插件、Skills、MCP、catalog、资源合同和 CI。GitHub 资源 Release 与七牛使用相同资源字节。

## 老版本升级

7.5.0 使用现有 stable 更新地址检查 8.0.2；安装器保留用户数据和 profile。已在隔离环境使用真实 7.5.0 profile 形状验证迁移，包括扩展中心、桌面桥接、Skills、MCP、环境服务和第三方选择。未在用户真实安装目录运行旧 NSIS 安装器覆盖升级；请用户先完全退出旧程序，再安装本包并确认现有账户、项目和模型配置。

升级后进入“设置 → 扩展中心”或运行 `zws doctor`、`zws plugin list`；独立插件、Skills 与 MCP 更新不需要再次安装 8.0.2。

完整操作说明见 [独立资源更新教程](extensions-update-guide.md)。

## 证据

- 安装包清单：`artifacts/packages/8.0.2/windows-x64/artifact-manifest.json`。
- 桌面七牛发布收据：`artifacts/release/8.0.2/publication/qiniu-desktop-public.json`。
- 资源七牛发布收据：`artifacts/release/8.0.2/publication/qiniu-resources-public.json`。
- 本地 CLI 收据：`artifacts/verification/8.0.2/commands/5e8db4b2-ffb3-474c-83fb-a0983ae2306a/receipt.json`。
- 扩展中心收据：`artifacts/verification/8.0.2/extension-center/dc2db631-f634-481c-a3e1-523ca3a240f8/receipt.json`。
- `pnpm test:updates`：30 通过，0 失败。
- `pnpm verify:package`、`verify-packaged-commands.mjs`、`verify-extension-center.mjs`：通过。

本次没有切换模型，没有修改 DSH pin，没有上传开发签名 catalog，也没有启用自动下载安装。后续单独资源版本按自身 semver 发布，不修改桌面 `stable/latest.yml`。
