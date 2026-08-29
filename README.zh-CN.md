<div align="center">
  <img src="docs/assets/logo.png" width="168" alt="ZeroWall Science 标志" />
  <h1>ZeroWall Science</h1>
  <p><strong>面向可信智能科研的本地优先基础设施</strong></p>
  <p>在一个可恢复的工作空间中连接研究意图、受治理的 AI 编排、持久化计算、证据、发表与演示。</p>
  <p>
    <a href="README.md">English</a> ·
    <a href="README.zh-CN.md">简体中文</a> ·
    <a href="docs/architecture.md">Architecture</a> ·
    <a href="docs/architecture.zh-CN.md">中文架构</a>
  </p>
</div>

ZeroWall Science 是一个模型无关的智能科研工作台，由 Electron、React、TypeScript、固定版本的 DeepSeek Harness（DSH）运行时、22 个一方领域插件包、Better Sidebar Office 集成和独立 SQLite 科研存储构成。它面向需要 AI 协助，同时又不能放弃项目数据、凭据、执行环境和科研产物谱系控制权的研究人员。

项目的核心判断简单但严格：一段 AI 回答还不是科研结果。可信科研系统必须保留研究问题如何转化为计划、哪个工具或模型采取了行动、代码在哪里运行、哪些数据进入、产生了什么产物、据此形成了什么决策，以及结果如何进入论文或演示。

## 产品界面

![ZeroWall Science 工作空间](docs/assets/app-home.png)

工作空间将项目范围内的对话、会话搜索、模型配置、科研 Skills、MCP 服务、本地与远程执行、科研记录、审阅发现、文件、图像、发表和演示文稿整合在一起。界面由 DSH React 外壳渲染，特权控制权仍属于 Host 与 Electron 主进程。

## 核心差异

- **科研状态独立于对话历史。** 项目、执行环境、数据资产、Run、Artifact、Paper、Decision、Publication、Presentation 和 AuditEvent 位于独立科研数据库中。对话压缩或替换不必抹除项目记录。
- **计算是持久任务，而不是一次性终端调用。** Run 持久化状态、本地或远程进程身份、心跳、租约、截止时间、日志、声明输入输出、恢复结果和收集产物。
- **模型不拥有执法权。** 模型可以请求操作，但审批、路径检查、项目所有权、凭据解析和特权执行位于模型上下文之外。
- **科研交付属于数据模型。** 发表和演示都是持久状态机，包含冻结证据、复现 Run、逐页修订、生成视觉、校验值、质量元数据和导出产物。
- **方法、模型和基础设施相互解耦。** Skills 编码领域方法，MCP 连接外部服务，插件拥有产品领域，执行环境覆盖 Local、WSL 和 SSH。
- **审计完整性可以机器验证。** 项目审计事件可导出确定性事件哈希与链哈希，用于检测篡改或重排。

这些差异共同形成一条“从意图到证据再到交付”的产品主线：模型负责提出候选行动，Host 负责执行边界，Research Store 负责保存事实，用户负责最终判断。ZeroWall 不把一段漂亮的回答冒充为已验证的科研结论。

## 当前版本边界（4.3.8）

本版本以 Windows 桌面包作为参考发行形态，包含基于 DSH 的 Agent 工作空间、一方科研插件、用于 DOCX/XLSX/PPTX 的 Better Sidebar Office 预览、Windows 优先的 PowerShell 执行方式，以及可恢复的演示文稿工作流。当前演示流程生成 PPTX；旧 PDF artifact 仍可为数据库兼容性加载，但不会被重新生成。质量元数据用于检查和记录，不会阻塞已完成的 PPTX。

ZeroWall 是本地优先而不是仅限本地：模型 API、MCP 服务、WSL、SSH 主机和 Web 资源都可以在明确配置后参与工作，但它们的可用性和信任级别仍独立于本地应用。

## 创新点概览

| 创新 | 解决的问题 | 可验证的实现 |
| --- | --- | --- |
| 对话与科研状态双轨 | 长对话压缩后，项目事实容易丢失 | DSH 会话与 Research Store 分离，通过项目和会话关联 |
| 可恢复的科研执行 | 长任务依赖临时终端，失败后难以恢复 | Run 状态机、心跳、租约、PID、超时、恢复和产物收集 |
| 模型无关的治理 | 更换模型会改变权限和数据边界 | Host/store 强制审批、路径 containment、项目所有权和凭据引用 |
| 从计算到成果的谱系 | 代码、数据、论文和幻灯片各自孤立 | DataAsset、Run、Artifact、Paper、Decision、Publication、Presentation 显式关联 |
| 可修订的生成式交付 | 一页出错却必须整套重做 | 页面级视觉状态、attachment、checksum、generation ID 和单页重试 |
| 证据感知审阅 | 审阅意见停留在一次性聊天文本 | Finding 持久化 claim、证据覆盖率、修复、复审和缺口 |

## 典型使用路径

1. 打开或创建研究项目，选择模型、Skills、MCP 服务和执行环境。
2. 在项目会话中提出研究问题；Agent 先形成计划，再按需调用工具或子 Agent。
3. 对需要副作用的操作进行审批，并把命令、输入、输出和环境写入 Run。
4. 将结果收集为带 SHA-256 的 Artifact，补充 Paper、Decision 和显式 ResearchEdge。
5. 使用 Reviewer 检查证据覆盖率，修复发现后再次审阅。
6. 冻结 Publication 快照，或从当前研究材料生成演示文稿；图片可以按页生成、预览、重试和修订。
7. 最终交付经过校验的 PPTX、研究快照或发表包，并保留可追溯记录。

## 系统概览

![ZeroWall Science 分层架构](docs/assets/architecture-overview.png)

ZeroWall Science 将职责划分为五个层面：

| 层面 | 职责 |
| --- | --- |
| 桌面安全外壳 | Electron 生命周期、可信来源、系统集成、更新、加密凭据保险库 |
| Agent 与 UI 内核 | DSH 会话、工具、Skills、MCP、审批、子 Agent、Goal、Workflow、React 对话外壳 |
| 科研领域服务 | 项目、环境、执行、Run、文件、科研、审阅、图像、发表、演示 |
| 科研数据基础 | SQLite 迁移、类型化记录、显式科研边、审计链、快照导入导出 |
| 计算与产物平面 | 本地 PowerShell/shell、WSL、受管 SSH、日志、文件、生成媒体、PPTX 与证据包 |

DSH Host 绑定 `127.0.0.1`。首次启动会选择有效端口并保存，使 Renderer origin 能够在后续启动中保持稳定。Electron 监管 Host 子进程，并从该可信本地来源加载 Web 应用。

## 端到端科研生命周期

![可追溯科研生命周期](docs/assets/research-lifecycle.png)

典型项目可以沿以下受治理路径推进：

1. 研究人员打开项目，并在项目范围内的 Agent 会话中工作。
2. Agent 使用原生工具、领域 Skills、MCP 服务、子 Agent 或结构化 Workflow。
3. 有副作用的工作必须跨越审批和 Host 策略边界。
4. 代码在本地、WSL 或已注册的 SSH 执行环境中运行。
5. Run Manager 持久化生命周期、心跳、日志、超时、进程身份和恢复状态。
6. 声明输出被收集为 Artifact，并与 DataAsset、Paper 和 Decision 连接。
7. 审计事件和显式 ResearchEdge 形成可查询证据图谱。
8. Publication 可以冻结项目快照、执行验证并发起持久化复现 Run。
9. Presentation 可以生成页面视觉、保留修订历史并组装带校验信息的 PPTX 产物。

## 核心能力

| 领域 | 已实现能力 |
| --- | --- |
| Agent 工作空间 | 会话、工具、审批、子 Agent、可续跑 Goal、结构化多 Agent Workflow |
| 科研方法 | 运行时发现的内置、项目、全局、扩展路径和插件 Skills，支持优先级与热重载 |
| 外部集成 | MCP `stdio`/streamable HTTP、凭据引用、超时、启动策略、动态 reconcile，以及应用内 Office 预览 |
| 科研组织 | 项目、偏好、会话归档、项目包、科研快照、图谱边、审计报告 |
| 计算执行 | 本地 PowerShell 或 `/bin/sh`、Windows WSL、OpenSSH 环境、能力探测、受管传输 |
| 持久化 Run | 状态机、PID/remote PID、日志、心跳、租约、超时、取消、暂停/继续、启动恢复、产物收集 |
| 科研文件 | 内容寻址附件、SHA-256 校验、会话授权、PDF/Office/表格/文本解析 |
| 图像 | AI 生图与编辑、真实尺寸/质量元数据、持久附件、本地离线感知重复扫描 |
| 审阅 | 持久化审阅报告、证据覆盖率、严重度、修复、复审和覆盖缺口记录 |
| 发表 | draft/frozen/validating/ready/failed 生命周期、冻结快照、验证、复现 Run、导出 |
| 演示 | 大纲、风格、页面视觉、有界并发、单页修订、版本历史、质量元数据、PPTX |
| 安全 | Renderer 沙箱、上下文隔离、回环 Host、类型化 DTO、safeStorage 保险库、私有子进程 IPC |

## 仓库结构

```text
desktop/       Electron 主进程、preload、运行时监管、安全、更新和打包
plugins/       22 个 ZeroWall 一方领域插件包及独立的内部演示运行时
store/         SQLite 科研领域、迁移、审计链、快照与项目包
deepseek-harness/    固定 DSH fork，提供 Agent、会话、工具、Skills、MCP 与 React UI 内核
resources/     内置科研 Skills、运行时、环境、品牌资源和许可证
tools/         插件生成、DSH 验证、打包、发布和安全自动化
tests/         契约、安全、集成、打包和端到端检查
docs/          详细双语架构文档和生成式架构视觉
```

## Windows 开发

### 环境要求

- Node.js `24.9.0`
- pnpm `11.7.0`
- Windows 打包和 WSL 执行支持需要 Windows 10/11
- 支持 Git submodule 的 Git

### 安装与启动

```powershell
git clone --recurse-submodules https://github.com/ccfwwm/zerowallscience.git
Set-Location zerowallscience
pnpm install --frozen-lockfile
pnpm dev
```

如果克隆时未包含子模块：

```powershell
git submodule update --init --recursive
```

### 质量门槛

```powershell
pnpm typecheck
pnpm test
pnpm package:dir
```

涉及已交付 DSH/Agent 组合的修改还必须通过：

```powershell
pnpm test:dsh:alpha1
```

自动化测试特意设计为不依赖真实 SSH 主机、WSL 发行版、GPU、API Key 或网络连接。

## 打包

```powershell
# Windows Preview 包
pnpm package:win

# Windows Stable 包
pnpm package:stable:win

# macOS 包必须在匹配架构的 macOS 机器或 runner 上构建
pnpm package:mac:x64
pnpm package:mac:arm64
```

Preview 与 Stable 使用独立应用标识、用户数据目录和更新通道。构建与发布控制见 [BUILD.md](BUILD.md)。

## 安全与适用范围

请勿提交 API Key、Token、密码、私钥、未发表数据或本地 `.env` 文件。Renderer 运行在沙箱中，不获得通用 Node.js 或凭据访问。凭据值由 Electron `safeStorage` 保护，并通过私有子进程 IPC 向 Host 解析。

这些控制减少意外暴露，并让特权决策独立于模型和界面。Windows 默认使用 PowerShell/pwsh 和 Windows 路径；WSL、SSH 和类 Unix shell 只有在明确选择对应执行环境时启用。ZeroWall 不声称能够安全隔离任意用户批准的代码；不可信代码需要合适的操作系统账户、容器、虚拟机、网络边界或远程隔离环境。

## 详细文档

[完整中文架构文档](docs/architecture.zh-CN.md)包括：

- 启动流程与稳定回环来源机制；
- Electron/Host/Renderer 信任边界；
- 全部插件领域及其责任；
- 完整科研对象模型与七版数据库迁移；
- 哈希链审计报告；
- Run 恢复、租约、心跳、产物收集和文件传输；
- 文件附件授权与完整性检查；
- Agent、Skills、MCP 和多 Agent 编排；
- 发表与演示状态机；
- 创新性分析、限制与设计权衡。

## 许可证

Copyright (C) 2026 ZeroWall Science contributors.

ZeroWall Science 第一方代码使用 [GNU AGPL-3.0-only](LICENSE) 许可证。内置和引用的第三方组件继续使用各自许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

- 官网：[zerowallscience.org](https://zerowallscience.org/)
- 源码：[github.com/ccfwwm/zerowallscience](https://github.com/ccfwwm/zerowallscience)
