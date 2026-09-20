# ZeroWall Science 产品介绍

> 本文件依据 `C:\softworks\gpt-tools\zerowallscience` 当前源码树（版本 `6.5.0`）撰写。凡源码与既有文档不一致处，以源码为准，并在文中标注。

---

## 一、一句话定位

ZeroWall Science 是一个**模型无关、本地优先的智能科研工作台**：它把「研究意图 → 计划 → 受治理的工具调用 → 持久化计算 → 证据 → 发表与演示」串成一条可恢复、可追溯、可审计的主线。

它由 Electron + React + TypeScript 构建，运行时固定绑定 DeepSeek Harness（DSH）`0.1.5-rc.2`，附带 20 个一方科研领域插件、235 个内置科研 Skills，以及独立的 SQLite 科研数据库。

**核心判断：一段漂亮的 AI 回答不是科研结果。** 可信科研系统必须保留研究问题如何转化为计划、哪个工具或模型采取了行动、代码在哪里运行、哪些数据进入、产生了什么产物、据此形成了什么决策，以及结果如何进入论文或演示。

---

## 二、它解决什么问题

| 常见痛点 | ZeroWall 的做法 |
| --- | --- |
| 长对话压缩后，项目事实丢失 | 会话历史与科研状态**双轨存储**，压缩对话不影响项目记录 |
| 长任务依赖临时终端，失败后无法恢复 | Run 状态机 + 心跳 + 租约 + PID + 启动恢复 |
| 更换模型就改变权限与数据边界 | 审批、路径检查、项目所有权、凭据解析位于**模型上下文之外** |
| 代码、数据、论文、幻灯片各自孤立 | DataAsset / Run / Artifact / Paper / Decision / Publication / Presentation 显式关联 |
| 一页 PPT 出错却要整套重做 | 页面级视觉状态 + checksum + generation ID + 单页重试 |
| 审阅意见停留在一次性聊天文本 | Finding 持久化 claim、证据覆盖率、修复与复审状态 |

---

## 三、架构总览

系统划分为五个平面：

| 平面 | 职责 | 源码归属 |
| --- | --- | --- |
| 桌面安全外壳 | Electron 生命周期、可信来源、系统集成、更新、加密凭据保险库 | `desktop/src/main`、`desktop/src/preload` |
| Agent 与 UI 内核 | 会话、工具、Skills、MCP、审批、子 Agent、Goal、Workflow、React 外壳 | `deepseek-harness` |
| 科研领域服务 | 项目、环境、执行、Run、文件、科研、审阅、图像、发表、演示 | `plugins/*` |
| 科研数据基础 | SQLite 迁移、类型化记录、图谱边、审计链、快照导入导出 | `store/src` |
| 计算与产物平面 | Local / WSL / SSH 进程、日志、生成媒体、PPTX 与证据包 | 项目根、用户数据根、远程主机 |

**关键分离：对话状态与科研状态。** DSH 会话记录交互历史；独立 Research Store 记录项目实体、计算、证据、交付状态与审计。二者关联，但不互相替代。

### 请求与数据流

```text
研究人员
   -> DSH React Renderer（低权限）
   -> 类型化远程 DTO / Typert codec
   -> DSH Host 插件服务
      -> 策略、所有权、路径、审批、凭据检查
      -> Research Store 事务 和/或 受管执行适配器
      -> 项目文件或持久化附件
      -> Artifact / AuditEvent / 进度事件
   <- 脱敏的类型化结果与界面刷新
```

Renderer 可以发起请求，但**不能把一个被界面隐藏的操作变成权限**。

---

## 四、核心能力

### 1. Agent 工作空间
- 项目范围内的对话与可搜索会话历史
- 六条能力路径：原生工具、Skills、MCP 服务、子 Agent、结构化 Workflow、可续跑 Goal
- 有副作用操作需显式审批；删除会话为局部更新，不重启 Host

### 2. 科研方法（Skills）
- 内置 **235 个** Skills，覆盖生信、化学、物理、统计、临床、量子、图像、写作等
- 五个来源与优先级：内置只读 → 项目 `.zerowall/skills` → 用户全局 → 额外路径 → 插件提供
- 支持热重载，无需重启桌面
- 其中 13 个为 ZeroWall 自研技能，包括科研图片查重、论文分析、多论文对比、完整性报告、R 平台、FigureYa 绘图、AIchem、Bio Tools、Ketcher、Sci 写作等

### 3. MCP 外部集成
- 支持 `stdio` 与 streamable HTTP
- 凭据以**引用**形式持久化，运行时由 Host 解析
- 工具调用默认超时 300 秒、重试 2 次；连接与状态检测超时 120 秒
- 动态 reconcile 创建/更新/删除；并发请求复用同一连接
- 内置 MCP：Bio Tools（23 个生物学数据库域聚合服务）、Ketcher Chemistry

### 4. 持久化 Run（核心差异）

```text
draft -> submitted -> running -> succeeded | failed | timed_out
                              -> paused -> running
                              -> cancelling -> cancelled
```

- 记录 PID / remote PID、日志 URI、进度、租约所有者、租约到期、心跳、超时截止、输入、输出
- 心跳默认每 10 秒续租，租约有效期 30 秒
- 启动时自动恢复 `submitted` / `running` / `paused` / `cancelling` 状态的 Run
- 超时范围：1 毫秒 ~ 30 天
- **不会把已死亡的任务静默留在 running 状态**

### 5. 执行环境
| 环境 | 说明 |
| --- | --- |
| Local | Windows 用 PowerShell，类 Unix 用 `/bin/sh`；输出有上限，命令必须有超时 |
| WSL | 仅 Windows；选择发行版、用户、可选环境 |
| SSH | 已注册 host/port/user/key；非交互 OpenSSH；验证环境属于当前项目 |

### 6. 科研文件与附件
- 上传不直接以任意路径交给模型
- SHA-256 内容寻址，原始字节 / 解析文本 / 元数据分离存储
- 支持 PDF、DOCX、PPTX、XLSX、JSON、分隔文本、纯文本的有界解析
- 读取有字符上限；返回前重新校验 SHA-256
- PDF 默认启用 MinerU OCR，Precision VLM 输出文字、图片、表格和页码；缺失依赖会明确列出

### 7. 图像
- 受管 AI 图像生成/编辑，记录 provider、model、requested/actual quality、实际尺寸、revised prompt
- 本地离线感知查重：整图重复、翻转旋转、缩放压缩、单图局部复制、跨图区域复用
- 只识别相似候选，**不判断科研不端或作者归属**

### 8. 审阅（Reviewer）
- 持久化 review status、model / effort / backend 身份
- Finding 包含 claim、reported evidence、verified evidence、fix、verdict、severity、resolution status
- 记录 evidence coverage、unverified evidence 标志、coverage gaps、correction 与 re-review 状态

### 9. 发表（Publication）

状态机：`draft → frozen → validating → ready | failed`

- **Freeze** 捕获 `ResearchProjectSnapshotV1`，防止证据选择与验证之间静默漂移
- **Reproduce** 提交持久化 Run 并保存 reproduction Run ID
- **Export** 仅在 ready 状态允许

### 10. 演示（Presentation）

状态机：`draft → outlining → designing → generating → ready | failed | cancelled`（含 `paused`）

- 页面级记录：visual URI、prompt、model、尺寸、质量、校验值
- generation ID、stage、progress、时间戳、错误
- 有界视觉并发，先写临时文件再替换
- **单页可独立重新生成并重建 PPTX**，不必重复生成无关页面
- 当前演示 Worker 生成 PPTX；历史 PDF artifact 仍可读取但不再新建

### 11. 安全
- Renderer 沙箱、上下文隔离、禁用 Node integration、启用 web security
- 稳定回环 Host origin，导航限制在可信应用 URL，禁止 WebView
- 凭据由 Electron `safeStorage` 保护，通过私有子进程 IPC 解析
- 始终以**引用**而非原始 Key 流转
- 项目所有权检查 + 精确路径 containment 检查

---

## 五、科研对象模型

| 对象 | 关键语义 |
| --- | --- |
| `Project` | 项目标识、根路径、描述、时间戳、偏好 |
| `ExecutionContext` | `local` / `wsl` / `ssh`，版本化配置，项目所有权 |
| `DataAsset` | URI、位置类型、媒体类型、大小、校验值、provenance |
| `Run` | 命令、工作目录、状态、进度、进程身份、租约、心跳、截止时间、日志、输入输出 |
| `Artifact` | URI、媒体类型、校验值、元数据、可选产生 Run |
| `Paper` | 标题、DOI、URI、引用对象、笔记 |
| `Decision` | 理由 + proposed/accepted/rejected/superseded 生命周期 |
| `ResearchEdge` | 显式、项目范围内、带元数据的有向关系 |
| `Publication` | 冻结快照、验证、复现关联、导出状态 |
| `Presentation` | 大纲、页面状态、视觉谱系、修订历史、质量、导出产物 |
| `AuditEvent` | 项目操作、可选实体、详情、时间戳 |

图谱关系是**显式记录**，不根据文件名相似度或对话措辞推断。外键与项目检查阻止跨项目边。

### 审计链

审计报告包含有序事件列表、每个事件的确定性哈希、最终链哈希与 `chainValid` 结果。每个事件哈希包含规范化事件内容与前序链状态，可检测重排与修改。

> **诚实边界**：审计链证明已记录序列内部一致，**不证明**现实世界所有操作均被完整捕获。

---

## 六、典型使用路径

1. 打开或创建研究项目，选择模型、Skills、MCP 服务与执行环境
2. 在项目会话中提出研究问题；Agent 先形成计划，再按需调用工具或子 Agent
3. 对需要副作用的操作进行审批，命令、输入、输出、环境写入 Run
4. 将结果收集为带 SHA-256 的 Artifact，补充 Paper、Decision 与显式 ResearchEdge
5. 使用 Reviewer 检查证据覆盖率，修复发现后再次审阅
6. 冻结 Publication 快照，或从当前研究材料生成演示文稿；图片可按页生成、预览、重试、修订
7. 交付经过校验的 PPTX、研究快照或发表包，并保留可追溯记录

---

## 七、创新点

| 创新 | 解决的问题 | 可验证的实现 |
| --- | --- | --- |
| 对话与科研状态双轨 | 长对话压缩后项目事实易丢失 | DSH 会话与 Research Store 分离，通过项目与会话关联 |
| 可恢复的科研执行 | 长任务依赖临时终端，失败难恢复 | Run 状态机、心跳、租约、PID、超时、恢复、产物收集 |
| 模型无关的治理 | 换模型就改变权限与数据边界 | Host/store 强制审批、路径 containment、项目所有权、凭据引用 |
| 从计算到成果的谱系 | 代码、数据、论文、幻灯片各自孤立 | DataAsset、Run、Artifact、Paper、Decision、Publication、Presentation 显式关联 |
| 可修订的生成式交付 | 一页出错必须整套重做 | 页面级视觉状态、attachment、checksum、generation ID、单页重试 |
| 证据感知审阅 | 审阅意见停留在一次性聊天 | Finding 持久化 claim、证据覆盖率、修复、复审、缺口 |

---

## 八、仓库结构

```text
desktop/            Electron 主进程、preload、运行时监管、安全、更新与打包
plugins/            20 个一方领域插件包 + 内部演示运行时
store/              SQLite 科研领域、迁移、审计链、快照与项目包
deepseek-harness/   固定 DSH fork（Agent、会话、工具、Skills、MCP、React UI 内核）
resources/          235 个内置科研 Skills、MCP、Python/R 运行时、品牌资源、许可证
tools/              插件生成、DSH 验证、打包、发布与安全自动化
tests/              契约、安全、集成、打包与端到端检查
docs/               双语架构文档与生成式架构视觉
```

### 一方插件清单（按注册表实际值）

`pubmed`、`base`、`desktop-compat`、`secrets`、`environment`、`projects`、`account`、`ai-cloud`、`files`、`images`、`mcp`、`skills`、`reviewer`、`research`、`mineru`、`singlecell`、`execution`、`python`、`runs`、`publications`

> 另有 `plugins/wechat`（`@zerowallscience/plugin-wechat@5.1.12`）存在于目录中但被排除在 `pnpm-workspace.yaml` 之外；6.0.0 发行说明提到已「排除退役微信插件残留的重复运行时依赖」。

---

## 九、开发与构建

**环境要求**：Node.js `24.9.0`、pnpm `11.7.0`、Windows 10/11（Windows 打包与 WSL 执行）、支持 submodule 的 Git

```powershell
git clone --recurse-submodules https://github.com/ccfwwm/zerowallscience.git
Set-Location zerowallscience
pnpm install --frozen-lockfile
pnpm dev
```

**质量门槛**：
```powershell
pnpm typecheck
pnpm test
pnpm package:dir
```

**打包**：
```powershell
pnpm package:win          # Windows Stable
pnpm package:mac:arm64    # macOS 需在匹配架构机器上构建
```

---

## 十、已知约束（诚实边界）

- ZeroWall **不是**用于任意恶意代码的强化沙箱
- Run 成功**不代表**科学结论有效
- 校验值证明**字节一致性**，不证明语义正确性
- 复现 Run **不证明**所有未捕获外部依赖完全相同
- AI 生成的图片、审阅、文本和幻灯片**仍需**合格人员与领域专家评审
- 远程 SSH 主机、模型提供方、MCP 服务、Web 服务仍是**独立信任域**
- Windows 不支持本地 Run 暂停/继续（类 Unix 使用 `SIGSTOP`/`SIGCONT`）
- 进程级复现弱于完全固定的容器或 VM
- 文件预览解析器有边界，但**不是**恶意软件扫描器
- 感知查重生成候选，**不产生**科研不端结论
- 审计链有效只证明序列一致，不证明事件捕获完整
- Reviewer 覆盖率受限于可用证据
- 用户批准的命令可以破坏其 OS 账户可访问的数据

---

## 十一、许可证与链接

- 第一方代码：[GNU AGPL-3.0-only](LICENSE)
- 第三方组件：见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- 官网：https://zerowallscience.org/
- 源码：https://github.com/ccfwwm/zerowallscience

---

## 附：本文与既有文档的差异说明

以下为本次核对源码时发现的文档滞后项，供维护者参考：

| 位置 | 文档现述 | 源码实际 |
| --- | --- | --- |
| `README.zh-CN.md` L35 | 「当前版本边界（4.3.8）」 | `package.json` 为 `6.5.0` |
| `README.zh-CN.md` L14/L115 | 「22 个一方领域插件包」 | 插件注册表 `tools/plugins/generate-workspaces.mjs` 为 **20** 项；目录中 21 个含 `zerowall.plugin.json` |
| `docs/architecture.zh-CN.md` L15 | 「本文描述已交付的 4.3.8 架构」 | 源码为 `6.5.0` |
| `docs/architecture.zh-CN.md` 第 6 节 | 列出 22 个插件领域（含 `web-search`、`image-dup`、`presentations`、`opencode`） | 注册表无这些项；`plugins/web-search`、`plugins/image-dup`、`plugins/presentations`、`plugins/opencode` 无 `package.json` |
| `docs/architecture.zh-CN.md` 第 7.2 节 | 「七版 schema 迁移」 | 与源码一致，未变 |

> 说明：`plugins/image-dup`、`plugins/presentations`、`plugins/web-search`、`plugins/opencode` 目录下仅有 `lib/` 产物，无 `package.json` 与 `src/`，属历史构建残留。能力已分别由 `resources/skills/zerowall-image-dup`、`dsh-univer-office`、`dsh-free-search` 承担；OpenCode 免费 provider 已在 6.2.0 引入、6.4.0 移除。
