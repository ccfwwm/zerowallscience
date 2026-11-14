---
description: "管理 ZeroWall 独立 EXE 更新源与重启激活的 npm 业务更新。"
---

# ZeroWall 软件更新

[English](desktop-updates.md) | 中文

## 摘要

Windows 安装包使用七牛，业务插件使用 npm，Host Runtime 使用签名的 `stable/host-runtime/` 更新源。检查只发现版本，不下载包。下载需要用户操作，EXE 安装需要独立的原生确认。官方环境配置服务保留当前端点。9.x 正式版沿用原版 8.x 稳定通道。

## 目录

- [桌面发布](#desktop-release)
- [业务包](#business-packages)
- [Host Runtime](#host-runtime)
- [恢复](#recovery)
- [验收](#qualification)
- [开发说明](#dev-note)

<a id="desktop-release"></a>

## 桌面发布

公开的[发布配置](../../../apps/desktop/config/zerowall-release.json) 区分 9.x 正式通道与预览构建。Windows 正式版沿用 appId `com.zerowall.science`、`ZeroWallScience.exe`、`stable/latest.yml` 和不可变的 `stable/releases/<version>/` 产物。预览构建保留独立的 `newui` 身份与更新地址。9.1 ZeroWall npm 包元数据使用正式 `0.1.0` 版本、`latest` 标签且不再标记 preview 发布状态。

显式的 `package:zerowall:stable` 命令生成已批准的未签名 Windows x64 正式版，包含更新地址。其他未签名构建仍是无更新源的测试产物。产品版本 9.1.2 与内置 DSH 0.2.2-rc.1 独立。[9.1 Host Runtime 升级指南](../../upgrade-guide/v0.2.2-rc.1/zerowall-host-runtime/guide.zh.md) 说明 Bootstrap 与外部运行时迁移。打包仅读取公开配置，七牛与资源签名凭据保留在忽略的 `apps/desktop/config/publishing/.env.qiniu` 及其引用的 PEM 文件中。

`publish:zerowall:stable --stage <absolute-exe> --version 9.1.2` 检查安装包内嵌版本、未签名状态与内置资源公钥，上传不可变 EXE、blockmap 和签名发布元数据，并从公网检查每项大小及 SHA-256。`--promote <absolute-publication.json>` 再次检查产物，拒绝并发指针变化，再切换旧版 YAML 和网站 JSON，刷新 CDN 并验证两个指针。

发布元数据采用 Ed25519 资源签名，与 Windows Authenticode 独立。安装包沿用 8.x 的未签名方式。同一不可变对象出现不同字节时停止发布。记录与旧指针字节保留在 `.desktop-build/zerowall-stable-publications`；切换失败时必须先检查并恢复，再进行发布。

已启用稳定更新源的 8.x 安装可在原渠道检测 9.x。无更新源的 newui 构建需手动安装一次。检测不下载，点击后下载；安装需单独确认，并先检查运行任务和停止 Host。

<a id="business-packages"></a>

## 业务包

Science 的 `zerowall.defaultBundles` 生成自有包白名单。通过 `node distribution/scripts/sync-update-policy.mjs --check` 检查；修改归属后使用 `--write` 重新生成 Desktop Host 清单。DSH 核心、Cordis、React 与原生载体由安装包持有。9.1 发布集合中的 ZeroWall 包全部是 npm `latest` 上精确的 `0.1.0`，由 `pnpm run zerowall:verify-formal` 检查依赖闭包。业务压缩包按 [npm 分发流程](npm-distribution.zh.md)构建和发布。

ZeroWall 插件索引包含仅支持 Windows 的 `dsh-computer-use-win` 插件包。安装会加入原生 profile 层和电脑操控设置，无需手动配置 MCP。启停和版本检查沿用现有插件管理器。

<a id="host-runtime"></a>

## Host Runtime

Desktop Bootstrap 从 `$DSH_HOME/zerowall/host-runtimes/` 解析生效的 Host Runtime；找不到可用外部代际时回退到安装包内置运行时。运行时代际暂存后不可修改，目录中包含签名的 `host-runtime.json`；状态文件记录 `active`、`previous` 和 `pending`。只有在检查任务并停止 Host 后，重启才会激活代际。新 Host 必须报告自身运行时版本、来源和协议，并由主渲染器完成挂载后才确认成功；启动失败会恢复上一代并保留诊断记录。

Host Runtime 元数据发布在 `stable/host-runtime/latest.json`，不可变产物位于 `stable/host-runtime/releases/<version>/`。Bootstrap 在选择运行时前校验 Ed25519 签名、平台、架构、DSH 和 Host 协议版本、Electron/Node ABI、LibreOffice kit、Python、pnpm、载荷大小及 SHA-256。Bootstrap 随 Desktop 安装包提供，旧版 Desktop 不读取外部更新源，继续使用内置 Host。

使用 `pnpm --dir apps/desktop run host-runtime:release -- --runtime <runtime-dir> --output <feed-dir> --version <runtime-version> --product 9.1.2 --dsh 0.2.2-rc.1 --protocol 4 --electron 44.7.0 --abi 149 --libreoffice 0.1.5 --pnpm 11.28.5 --python 3.12.14 --platform win32 --arch x64 --archive-url <https-url> --key-file <ed25519-pem> --key-id <key-id>` 从准备好的 Host 目录生成签名运行时归档和 feed。ABI 使用打包 Electron Runtime 的 `process.versions.modules`。`pnpm --dir apps/desktop run host-runtime:publish -- --stage <feed-dir>` 使用内置信任公钥验证 feed，并上传、校验不可变对象；`--promote <publication.json>` 检查更新指针未被并发修改后才发布 `latest.json`。

设置 → 更新区分随应用版本、生效版本与候选版本。启用业务更新的安装在管理器连接时检查版本。更新将精确版本安装到新的 profile `.business-updates/generations/<uuid>` 目录。Pnpm overrides 排除共享运行时依赖；每层嵌套候选包的原始运行时要求都必须匹配安装。在 `state.json` 记录待激活代前，候选 bundle patch、包身份、兼容性和完整 SHA-256 封存必须通过。取消准备保留活动代与 profile 配置。

共享的 `restart-transaction.json` 在激活前记录两个原始代际，并在任何确认写入前持久化联合提交决定。中断后重放提交决定或恢复两个原始代际；每次事务的证据保留在 `transactions/` 中。重启先检查任务并锁定准入，然后停止 Host。下一进程在启动 Host 前激活并核验候选字节。Host 插件失败或跳过已更新 bundle 会导致启动失败。只有全部 Client 条目激活且渲染器挂载后，代才被标记为已验证。Host 或 Client 失败时恢复上一代，并独立核验下一次启动。激活中断也会请求恢复。成功重启保留选择、禁用状态、精确版本、兼容性豁免与用户配置；明确的覆盖包缺失时绝不静默回退。

<a id="recovery"></a>

## 恢复

恢复后的启动在设置 → 更新保留提示。**恢复随应用提供的功能**准备基线代并要求重启，不修改用户 patch、账户或明确的 profile 依赖。恢复失败持续可见，并阻止新的普通业务更新。无法启动到设置时，原生恢复弹窗中明确的禁用插件操作将更新日志归档为 `state-before-repair-<uuid>.json`，重置代选择，并使用现有 profile 恢复流程。候选目录与证据保留供诊断。

不要手动替换已封存代内的文件，也不要删除日志来制造启动成功。报告失败时保留 profile 与发布记录。EXE 安装修复遵循原生更新器已有的任务关闭与确认流程。

<a id="qualification"></a>

## 验收

测试覆盖候选准备、运行时依赖拒绝、完整性失败、激活中断、版本持久化及独立恢复；发布器测试使用内存对象存储和注入的签名校验器。这些测试不代表公网版本可用或硬件签名完成。需要在已安装应用中验收 Windows 原生按钮、最大化/Snap 与 100/125/150% 缩放。使用两个真实签名版本核验检测、下载、安装、重启及最终版本，并对比公网安装包摘要与本地记录。认证与支付使用批准的测试账户，不进行真实扣款。

<a id="dev-note"></a>

## 开发说明

<details>
<summary>维护者详情——点击展开</summary>

发布及激活日志不属于 Session 持久化，不改变会话记录格式。签名凭据、npm 授权与可访问的七牛存储空间属于部署输入，不是仓库默认值。

</details>
