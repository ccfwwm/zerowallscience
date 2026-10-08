# ZeroWall Science 8.0.7 架构边界

8.0.7 将 ZeroWall 作为桌面盒子：Electron、DSH 核心、更新事务和扩展中心组成稳定壳；领域能力以签名插件、Skills、MCP 和 Python generation 独立安装。DSH 子模块固定在 `86b6740d0e671cee0b3fd0168de484c0efbf46ea`（`0.2.0-rc.2`），本版本不升级 Harness。

## 目录合同

- `desktop/` 负责窗口、Host 生命周期、凭据、catalog 验签、候选 profile、更新通知和回滚。
- `plugins/` 只放 ZeroWall 一方领域插件。每个插件有独立 semver、Host/Client/Remote、权限、兼容范围和回滚声明。
- `packages/` 不与 `plugins/` 合并。8.0.7 的物理分组是 `dsh/`、`support/`、`bundles/`；layout resolver 仍能只读解析 8.0.6 旧路径，用户 profile 和外部插件不需要同步搬迁。
- `resources/` 的物理根是 `extensions/skills`、`extensions/mcp`、`extensions/python`、`extensions/runtimes`、`extensions/engines/r`、`extensions/capabilities/biogenie`、`cases/research` 和 `branding/`。旧源目录由 resolver 作为只读回退，避免升级时复制用户资源。
- 根级 `mcp-environment-staging/` 只保留源码管理的 SciMaster launcher 输入；正式 MCP/Python staging 位于 `artifacts/stage/<version>/<build-id>/mcp-environment-staging/`。准备脚本默认读取显式 `ZEROWALL_BUILD_ID` 对应的 stage，未指定时才读取当前 build receipt 指针。
- `artifacts/` 是唯一正式构建输出根；stage、dev、cache、verification、release 和 logs 都由 `tools/build/paths.*` 解析。

## Core 与 Optional

`@zerowallscience/dsh-bundle-core` 只声明启动必需插件；`dsh-bundle-science` 继续是科研组合声明，不能聚合领域源码。8.0.7 的新安装器只把 Core 插件和其必要运行时放入 immutable closure，科研领域插件通过签名 catalog 安装到 profile。8.0.6 的已有 profile 由迁移器保留原有 bundles、禁用项、固定版本和第三方插件；旧 profile 不会因 Core 化而被覆盖。

## 更新事务

启动和每日检查只读取、验签 catalog 并提示一次。用户在扩展中心选择单个资源或一键更新后，资源管理器下载到内容缓存，校验签名、大小和 SHA-256，在 candidate profile 健康检查后原子切换；失败恢复上一 generation。Skills 可热刷新，MCP 保留 serverName、disabled 状态和凭据引用后重启，Python core/science/capability 独立切换。

## 增量构建

`pnpm build:changed` 根据源码路径生成任务图和输入指纹；收据记录文件哈希、lockfile、DSH commit、依赖版本、输出和失败原因。`plugin:build`、`plugin:pack`、`resource:build` 和 `package:build` 可单独执行；相同指纹且输出存在时直接命中缓存。共享 runtime 使用进程锁，避免并行任务互相清空 staging。

`pnpm package:stable:win` 消费通过新鲜度检查的当前 runtime stage，复制到新的 build ID，仅重建桌面与命令资源后执行 Electron 打包。复制未完成时不切换 `current.json`；失败保留候选目录和 failure receipt。Core Host 不把可选 Skills 目录当成启动门禁，离线或未安装资源时仍可启动。

## 清理与去重

`pnpm artifacts:gc --dry-run` 只扫描 cleanup policy 的 managed roots，永远避开 DSH、node_modules、desktop/build、scripts/env、.zerowall、发布和验证收据、当前 stage、用户 profile、`%SystemDrive%` 异常目录。`--apply` 逐项复核大小和 SHA-256 后写 cleanup receipt。`tools/build/content-store.mjs` 为重复发布 payload 提供 SHA-256 对象引用；安装器内部仍保留实际运行时路径，避免破坏 Electron、LibreOffice 或 Python 解析。
