# RMCP 与 Bio Tools 8.0.4 修复记录

## 工作边界

本次暂停此前发布工作，在 `codex/python-rmcp-804` worktree 修复并重新打包本地 8.0.4。开始提交为 `31aa639597ebe3000d45f601a97cebed2830b236`，主目录保持 `main@b10f23690958ca308455da087334818e3babc9ad` / 8.0.3。DSH 保持 `86b6740d0e671cee0b3fd0168de484c0efbf46ea`，版本线仍为 `0.2.0-rc.2`；该 pin 已含上一轮 reviewer 历史兼容处理，本轮未再修改子模块。模型、协议和用户配置保持不变。

RMCP 源码检查位置为 `C:\softworks\gpt-tools\raiagentai`，HEAD 为 `36ea1bc8ec351534a557d0f470c53d6418c0d8d4`。本次没有修改此仓库，也没有推送、发布或上传。

## 已确认的原因

1. DSH 的 MCP `failOnStartupError: false` 会让启动 Fiber 在握手失败后正常返回。ZeroWall 随后将空工具集合显示为“已连接但远端返回 0 个工具”。现在只将保留名称 `rmcp` 与 `zerowall_managed_bio_tools` 迁移为失败可见策略，第三方连接策略不变。HTTP 502 的实际握手回归覆盖错误状态，并与成功但空工具的情况区分。
2. 默认 Python 包此前未包含 Bio Tools 的完整 MCP 依赖。MCP SDK 的 crypto extra、HTTP 客户端以及 Bio 注册时导入的 numpy/pandas/lxml 都进入经哈希锁定的最小可运行核心，共 42 包。剩余 529 包作为科研层，不在启动时同步。
3. 旧 pip-only generation 的“解释器可运行”被当作“核心层就绪”。现在读取已验签的桌面核心清单，逐项比较安装版本；缺包时返回 `coreReady: false` 和 `missingCorePackages`，页面提供明确修复入口。独立升级过的较新环境继续保留自己的 pin。
4. 打包验证此前用完整 staging Python 测试 Bio Tools，而不是最终裁剪后的核心 Python。现在构建阶段验证裁剪核心，并在最终包隔离用户目录执行实际 initialize/tools/list，防止 staging 通过而用户运行失败。

## 用户操作

安装此次本地 8.0.4 候选包后打开“设置 → Python 环境”。首次使用会初始化签名离线核心；已有 pip-only 环境则点击“修复核心运行环境”并确认。该操作建立新 generation，保留旧 snapshot 和回滚记录，不安装完整科研层。

再到 MCP 设置刷新 Bio Tools。RMCP 使用原来的远端地址和环境引用 `R_PLATFORM_MCP_AUTHORIZATION`，凭据只保存在安全存储。RMCP 连接失败应显示错误，不再显示虚假的零工具成功状态。勿为验证而重置 profile、删除用户数据或修改模型。

## 生产端现状

开发机对免密别名 `rdatalinux` 的 SSH 22、历史 SSH 50537 和 `http://103.217.185.141:8099/r-platform/mcp` 的 8099 连接均超时，HTTP 为 000。50537 仅作历史端口排查，不作为当前 SSH 配置。没有收到应用层 HTTP 响应，不能据此判断 gateway 代码、认证、服务进程或防火墙中的哪一层故障。没有进入服务器，也没有执行生产变更。

本地 gateway 的 Streamable HTTP 回归已通过：initialize 后立即 tools/list、旧 session 恢复、未授权返回 401。本地协议通过不等于生产可用。

生产地址恢复后，先只读检查主机、端口、OpenResty 路由以及 `rdatalinux-r-plumber.service`、`rdatalinux-r-worker.service`、`rdatalinux-r-gateway.service` 日志。使用 `/opt/zerowall-r-platform` 的 guarded dry-run 判断是否需要代码更新；涉及 Worker 的变更须检查活动队列。最终以带凭据 initialize/tools/list、必要工具存在、只读健康调用成功作为验收，不能只以 systemd active 判定成功。

## 构建与测试证据

构建 ID：`20261005-rmcp-core-v8`。新 staging 独立生成，旧候选安装包保存在 `artifacts/verification/8.0.4/previous-candidate-v7/`。

签名核心 Python archive 为 84,770,066 字节，SHA-256 为 `040a1c41ef9a65c5f214685958eedbf51b508189ce1399b5ed7ef6fc24838d8f`。构建阶段使用裁剪后的 Python，Bio Tools 发现 8 工具、Ketcher 7、Sci 1，pip check 通过。依赖清单修订为 `3.12.10-r14-core` / `3.12.10-r14`，使用已有 stable-3 信任根，无开发公钥混入正式包。

已通过针对性桌面 56 项、MCP/Python 面板 30 项、更新 31 项、安全 2 项、Python 分层 9 项以及本地 gateway 协议 1 项。Desktop 和全部插件 typecheck、版本合同、DSH pin 与 profile 检查通过。

完整插件测试首轮出现科研插件三项超时：FlowJo、100,005 细胞选择和 H5AD 工具集成。保存首轮失败记录后，三个文件保持原断言和原超时设置单独复跑，43 项全部通过；再串行执行完整插件测试，645 项通过、6 项条件跳过，其中科研插件 319 项通过、3 项跳过，MCP 插件 72 项通过、2 项跳过。未切换模型、降低断言或增加超时。

最终包完成以下隔离验收，未使用用户真实账户或生产凭据：

- 裁剪后的签名 Python 核心实际初始化到测试 LocalAppData，42 个包与 42 个核心 pin 一致，`coreReady: true`，`missingCorePackages: []`，科研层为 `not-installed`。`pip check` 返回 `No broken requirements found.`。
- 实际打包 Host 注册 Bio Tools 为 `active` / 8 个工具，Ketcher 为 `active` / 7 个工具；MCP 设置页显示全部 8 个 Bio 工具，无页面错误。RMCP 缺凭据时为 `waiting-for-credentials`，显示缺少 `R_PLATFORM_MCP_AUTHORIZATION`，不显示零工具成功信息。Sci 和 AIchem 在未提供各自凭据时保持阻止状态。
- 最终 ASAR、290 包 runtime closure、包策略、Host 启动、设置版本与中英文切换通过。`smoke:host` 使用相同包验证器，不重复宣称额外验收。
- 打包命令实际返回 `dsh 0.2.0-rc.2` / `zws 8.0.4`；7.5 结构 profile 迁移、扩展中心、脱敏、Skills 导入/刷新/回滚、fake MCP 生命周期和 Python 状态检查通过。这是结构化迁移验收，不等于客户机器原地安装测试。
- Electron E2E 12 项通过，2 项因当前剪贴板能力限制跳过；21 个插件实际原生 `pnpm pack` 通过。更新 smoke 只检查本地 metadata。
- 全量科研依赖、远端 RMCP 带凭据健康调用和真实客户升级环境未验证；本轮没有新增付费模型调用。

## 最终安装包与构建来源

```text
artifacts/packages/8.0.4/windows-x64/zerowall-science-8.0.4-win-x64.exe
大小：460,358,692 字节（439.0 MiB）
SHA-256：0c45338d145d33886bf2454ba6c0c69dab1a575586ebb93d49bb6ba99c469fcf
Authenticode：NotSigned
build ID：20261005-rmcp-core-v8
```

安装后输出为 1737.5 MiB，超过现有建议预算 1500 MiB；安装包低于建议预算 1024 MiB。此为现有包验证器的 advisory，不改阈值来掩盖结果。Python 核心约 80.8 MiB，未携带完整科研环境 archive。

安装包构建时父 HEAD 为 `31aa639597ebe3000d45f601a97cebed2830b236`，并包含本轮未提交的运行时代码、签名资源和插件版本变更。因此原 `artifact-manifest.json` 中的 `commit` 是构建父提交，不能解读为从该提交的干净树构建。交付收据另行记录保存这些改动的本地源码提交和文件哈希；打包后仅补充验收脚本与文档，未再修改运行时代码。没有把 receipt 的父提交伪装成后续提交，也没有修改已生成的 EXE。

最终验收收据为 `artifacts/verification/8.0.4/rmcp-v8-acceptance.json`。原始日志在 `artifacts/logs/8.0.4/rmcp-v8-*.log`，Python 与 MCP 页面证据分别在 `artifacts/verification/8.0.4/python-ui/packaged/` 和 `artifacts/verification/8.0.4/managed-mcp/`。阶段指针已指向本次完成的 build ID；旧候选包、旧缓存和 node_modules 保留。本次未推送、未合回 main、未上传七牛或 GitHub。
