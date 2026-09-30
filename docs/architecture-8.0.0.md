# ZeroWall Science 8.0.0：目录、插件与更新合同

本次实现分支为 `dsh-allupdate`，从 `main@0c8506a2bce63e3268f93f74476d98fd38a46f94` 创建独立 worktree。自定义 DSH 固定在 `93bacb7e30c888cc01a1322245a33ff3be9ff2b3`（0.2.0-rc.2）。运行模型和用户配置不因这次迁移被替换。

## 源码与产物目录

| 目录 | 职责 |
| --- | --- |
| `desktop/` | Electron 主进程、安全存储、窗口、安装器、核心与 Python 更新协调 |
| `deepseek-harness/` | 固定提交的自定义 DSH 子模块 |
| `plugins/<domain>/src/` | ZeroWall 独立 Host、Client、remote 功能源码 |
| `packages/` | 科研基础库、第三方适配与 science 组合声明 |
| `store/` | 研究数据存储；作为独立支持包分发 |
| `resources/` | 跟踪的品牌、Skills、Python 锁定清单与小型资源 |
| `config/` | 上游版本、插件清单、catalog 模板与公钥 |
| `tools/` | 构建、独立打包、命令、验证与发布工具 |
| `tests/` | 合同、安全与更新事务测试 |
| `docs/` | 架构、版本说明、迁移和验收说明 |

正式产物统一在根目录 `artifacts/`：

```text
artifacts/
  cache/                 下载、Electron、DSH TypeScript、开发签名缓存
  dev/<package>/         开发编译输出
  stage/8.0.0/<build-id>/ 本次构建的 runtime closure、资源和插件 staging
  packages/8.0.0/windows-x64/
  verification/8.0.0/    测试证据、隔离 profile、截图和收据
  release/8.0.0/         独立 tarball、Skills、MCP 与签名 catalog
  logs/8.0.0/
```

`tools/build/paths.cjs` 和 `paths.mjs` 定义路径合同。每次正式构建生成新的 build ID；`stage/8.0.0/current.json` 指向本次 staging。`ZEROWALL_PACKAGE_OUTPUT` 可覆盖安装包输出，`ZEROWALL_ARTIFACT_ROOT` 可指定产物根目录。

固定 DSH 的 package.json 仍引用 `lib/`，因此构建工具在源码边界建立兼容链接，实际生成字节写入 `artifacts/dev/`。这保留了上游包解析合同，也避免改动固定的子模块源码。根 DSH 的两个 TypeScript 增量缓存通过文件链接存放在 `artifacts/cache/dsh/typescript/`。兼容链接不会作为插件 tarball 的链接发布：打包 staging 复制真实文件。

`node_modules` 保留原位置。当前 pnpm store 使用机器既有的外部路径 `C:/Users/ccf/AppData/Local/pnpm/store/v11`，不复制、不清理。旧 `.build` 和旧 `desktop/dist` 不在本次清理范围；新构建不再向这些目录写正式产物。

## 桌面核心与插件

桌面保留 Electron 主进程、DSH 运行时、Host 启停恢复、安全凭据代理、桌面更新及 Python 更新服务。官方 Desktop 的 PATH worker 和官方 DSH CLI/profile 包管理语义被复用；ZeroWall 的 CLI 管理接口调用已有服务。

20 个 ZeroWall 插件的版本基线独立为 `0.1.0`。DSH 兼容范围精确限制到 0.2.0-rc.2，桌面最低版本为 8.0.0。微信与通知保持第三方独立版本；历史 `plugins/wechat/` 适配源码保留，当前实际启用的是 `packages/dsh-wechat/`。

每个发布包有 Host/Client/remote 入口、bundle patch、权限和重启声明。DSH 核心与 React 等共享模块由 Host/ModuleLoader 提供；插件自己的依赖在自己的 bundle 中处理。`plugin-base` 提供公共服务和 UI，领域插件通过各自 client 的 remote contribution 注册。

`@zerowallscience/dsh-bundle-science` 只声明组合与依赖。管理器安装后把组合展开为独立 profile bundles，去重；移除插件不会被该组合重新启用。`plugins:pack` 从源码和集中生成的库创建 staging manifest，去除构建脚本、devDependencies 和 workspace 发布依赖，DSH 包转换为 Host peers。

20 个 ZeroWall 插件也支持直接 `pnpm --filter <包名> pack --pack-destination <绝对路径>`。`prepack` 将集中编译文件复制为 `artifacts/dev/publish/<包名>/` 中的真实文件，`publishConfig.directory` 从该目录打包，避免 pnpm 忽略源码中的 `lib` 兼容链接。`pnpm plugins:verify-pack` 实际逐个打包并检查 Host、Client、remote 和依赖声明；临时 tarball 与收据进入 `artifacts/verification/8.0.0/native-pack/`。正式批量发布仍使用独立 build ID 的 `plugins:pack`。

## 命令与凭据

安装器为当前用户注册 `resources/commands` 的 PATH 项，提供 `dsh.cmd/.ps1` 与 `zws.cmd/.ps1`。PATH worker 保留其他项，并使用 ownership receipt；卸载只移除本安装器拥有的 PATH 项。注册目录放在已有 PATH 后面，外部 `dsh` 保留优先级。

`dsh` 使用官方 CLI，`zws` 通过正在运行的 Desktop 的本地认证 endpoint 操作 profile、Skills、MCP、Python 和环境变量。endpoint 的令牌只存入用户目录，不打印。Windows 使用命名管道。

```powershell
zws --version
zws doctor
zws plugin list
zws plugin add ai-cloud
zws plugin update environment
zws plugin rollback
zws plugin repair
zws skill import C:\path\to\skill
zws skill update C:\path\to\skill
zws skill enable example
zws skill disable example
zws mcp list
zws mcp add r-platform
zws mcp restart <connection-id>
zws mcp stop <connection-id>
zws mcp rollback scimaster
zws env list
zws env delete SCIMASTER_API_KEY
zws python status
zws python install
zws python update
zws python rollback
```

`zws env set <name>` 从标准输入接收值，避免把密钥写进命令参数和历史。值通过现有安全凭据存储保存，列表只返回是否已配置。普通管理命令需要 Desktop 已启动；可用 `--user-data` 指定另一个运行中的隔离 profile。

## 更新与回滚

| 资源 | 激活方式 | 失败处理 |
| --- | --- | --- |
| DSH JavaScript 插件 | 官方包管理器安装到 candidate profile；停 Host、切 profile、启 Host、检查 Loader 状态 | 保留旧 profile；失败自动恢复；支持显式 rollback |
| Skills | 导入或替换内容，刷新 registry；不重启 Host | 保存导入前版本，支持 rollback |
| MCP 配置 | 修改现有 MCP 服务，按需重启目标连接 | 保留凭据引用；独立服务包启动失败恢复旧 command/args |
| MCP Node 服务包 | 验签下载 tarball、解包到 hash generation、启动检查 | 旧 generation 保留；支持 `zws mcp rollback <资源 id>` |
| Python 基础环境 | 现有签名 runtime feed / 独立离线 archive | 验证新 generation 后才切 `current.json` |
| Python 依赖清单 | resource catalog 下载后由 PythonSyncService 再验签、预览、排队安装 | 拒绝清单降级；验证失败不切活动 generation |
| Electron + DSH 核心 | 原有桌面安装器更新 | 继续使用桌面版本更新流程 |

Python 默认安装包只携带小型签名依赖清单，不携带 `base-runtime.zip`。首次启动只检查签名 feed，不创建基础环境下载任务；用户点击安装或发起需要 Python 的操作时才安装。中断的远程安装任务在下次启动保持暂停，由用户继续。可选离线安装器仍可自动准备其携带的签名 bootstrap。运行任务解析后使用固定物理路径；Python 工具和托管 MCP 写 snapshot lease，科研 Host 保守保留其使用过的 generation 至进程退出。清理器保留 current、rollback、live lease 和 24 小时宽限期，随后只处理受管 slots，不删除历史外部环境。

科学环境的大型依赖仍由专用 updater 管理，不把通用包安装器冒充 Python updater。离线 runtime 制作入口保持 `tools/release/build-mcp-environment.mjs`，不把大型包塞回默认桌面。

## Catalog 与七牛后续发布

四类 catalog 为 plugin、skill、mcp、python。Ed25519 认证 catalog 和 latest pointer；下载前验证平台、架构、Desktop/DSH 范围，下载后验证大小与 SHA-256。MCP 服务 archive 拒绝路径穿越、链接和特殊文件。

本次生成的默认 catalog 使用本地开发签名、`file:` 路径及 `localOnly:true`，只供隔离验收；开发私钥存入 ignored artifacts，不进入安装包或 Git。桌面只信任正式公钥，不能把本地验收成功解释为线上 feed 已发布。

将来设置 `ZEROWALL_RESOURCE_PRIVATE_KEY_FILE`、`ZEROWALL_RESOURCE_KEY_ID` 和 `ZEROWALL_RESOURCE_BASE_URL` 可生成正式签名与 HTTPS 地址。插件、Skills、MCP 和 Python 使用 `stable/<kind>/<id>/<version>/`；catalog 使用独立不可变 generation，latest 只指向该 generation。公开前要在七牛侧验证已有同版本对象不可覆盖，并验证所有 HTTPS URL 与公共哈希。

本次不上传七牛，不创建 GitHub Release，不创建插件公开仓库。验证通过后可把发布 staging 对应源码迁移到 `ccfwwm/zerowall-dsh-plugins`，保持各插件独立版本。

## 验收入口

`pnpm typecheck`、`pnpm test`、`pnpm dsh:verify`、`pnpm profiles:check`、`pnpm audit:runtime` 验证源码合同；`pnpm plugins:pack`、`pnpm catalogs:generate` 和 `tools/packaging/verify-plugin-profiles.mjs` 验证真实隔离 profile。

`pnpm package:stable:win` 执行新 build ID 的完整构建；随后运行 `pnpm verify:package`、`pnpm smoke:electron`、`pnpm release:metadata`、`pnpm release:verify-local`、`pnpm artifacts:manifest` 和 `pnpm version:check --artifacts`。最终安装器必须为 `artifacts/packages/8.0.0/windows-x64/zerowall-science-8.0.0-win-x64.exe`。

源测试中显式跳过的大型科学环境/外部服务测试，不能作为实际生信算法或远程服务成功的证据。最终安装包与本地 receipts 的结果在独立验收报告中记录。
