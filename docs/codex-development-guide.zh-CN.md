# ZeroWall Science 开发、打包与发布指导

本文是后续开发的操作合同。当前桌面基线为 **8.3.3**；已发布的版本不重打、不覆盖。历史说明以 Git 记录追溯，当前入口见 [文档索引](README.md)。

## 1. 开始工作

```powershell
git status --short --branch
git rev-parse HEAD
git submodule status
node -p "require('./package.json').version"
```

在当前 main checkout 开发，保留无关修改、忽略文件及未跟踪文件，不创建或切换 worktree。保留用户选择的模型、推理强度、生图模型、协议和参数。先检查源文件、生成器、manifest、相关测试和 config/tools 合同，生成文件应修改生成器。

基线工具：Node.js 24.9.0、pnpm 11.7.0。不要用另一个 pnpm 主版本操作现有 profile 的 node_modules；由桌面插件安装服务管理用户 profile 的 store 与安装事务。

DSH 固定为 0.2.0-rc.2，fork 分支 zerowall/reviewer-history-opaque，commit `cf5cb0fc02a1e08dda3540c037835ceb58a85851`。权威来源是 config/deepseek-harness/upstream.json 与子模块 gitlink。ZeroWall 领域功能放入插件，不因桌面功能随意升级 DSH。

## 2. 目录与职责

| 路径 | 职责 |
| --- | --- |
| desktop/ | Electron 窗口、preload、Host 生命周期、安装启动、桌面更新；desktop/build 是源码 |
| plugins/ | 平铺的领域插件、DSH 适配器、组合声明、支持包；Research Store 在 plugins/research-store |
| deepseek-harness/ | 固定 fork 子模块；其内部 packages 是上游自身结构 |
| resources/extensions/skills | Skill 说明、脚本与模板 |
| resources/extensions/mcp | MCP 配置模板、Server 资源来源 |
| resources/extensions/python | Python 签名依赖清单、锁定版本、能力依赖 |
| resources/extensions/engines、capabilities、runtimes | 外部引擎、能力数据和运行时资源声明 |
| resources/branding、cases、provenance | 品牌、案例、来源与许可证证据 |
| profiles/ | 生成后的 DSH 组合配置；修改 tools/profiles 及相关 config 后再生成 |
| config/ | DSH pin、插件上游、布局、兼容性、签名公钥和资源版本合同 |
| tools/、scripts/ | 构建、验证、迁移与发布自动化；产品领域逻辑归对应插件 |
| tests/ | 合同、安全、更新和集成测试 |
| docs/ | 当前操作指南、领域合同、当前版本发布说明和仍被合同引用的证据 |

根 packages/、store/、patches/、mcp-environment-staging/ 不再是源码入口。旧 packages/ 若仅剩受保护的 node_modules，属于开发依赖遗留，不得被扫描为插件或用于打包，也不要擅自删除。

plugins/wechat 是已排除出 workspace 的退役适配器，目前仍被安全边界测试读取，不能作为无引用垃圾删除；实际微信插件是 plugins/dsh-wechat。

所有正式产物经过 tools/build/paths.cjs 和 paths.mjs 定位：

```text
artifacts/dev/<组件>/                         开发编译输出
artifacts/cache/                             指纹、编译、运行时和归档缓存
artifacts/stage/<桌面版本>/<build-id>/         候选集成与成功/失败收据
artifacts/packages/<桌面版本>/<target>/       安装器与 metadata
artifacts/release/plugins/<包名>/<插件版本>/   共享不可变 tgz
artifacts/release/plugins/plugin-packages.json 最新插件包清单
artifacts/release/plugin-snapshots/<摘要>/     绑定 DSH 的不可变插件快照
artifacts/release/<桌面版本>/                 catalog、签名与发布收据
artifacts/verification/<桌面版本>/            验收和审计报告
artifacts/logs/<桌面版本>/                    构建与发布日志
```

lib/dist/out 可能是指向 artifacts/dev 的兼容链接。不得把它们当正式发布目录，也不得跟随链接清理目标。保留 node_modules、pnpm store、scripts/env、签名密钥、用户数据、.zerowall 和有效共享缓存。

## 3. 日常开发与独立版本

```powershell
pnpm build:dev
pnpm plugin:build images
pnpm plugin:pack images
pnpm package:build research-store
pnpm resource:build skill gpt-image-generator
pnpm resource:build mcp scimaster
pnpm resource:build python core
pnpm resource:build python science
# 可选能力按需构建
pnpm resource:build python capability <id>
```

build:dev 仅检查组件指纹并编译变化部分，不产生正式 runtime、签名或安装器。plugin:pack 会先验证构建输入，只有内容变化才需要新包；未变化应复用原归档。不要在无变化时手工删除缓存或运行 build:full。build:full 是显式强制重建入口。

桌面版本、插件 semver、Skill 版本、MCP 模板/Server 版本、Python content revision、提示词版本分别管理。只升级真正变化的组件；不能因桌面换版本就统一提升插件或重新生成所有 tgz。

插件/支持包源码在 plugins 平铺；上游来源、pin 和适配声明见 config/integrations/upstream-sources.json。更新适配插件时保留本地修复，修改适配生成器并验证最终 runtime。dsh-bundle-core/science 只声明组合，不能静态聚合所有插件代码。退休的 dsh-auto-review、dsh-capability-menu 不能重新进入闭包；DSH 官方 Auto Review 保留。

插件包已发布的同 ID/版本必须保持原字节。大小、SHA-256 或执行内容冲突时停止，调查并提升组件版本，不能绕过签名/不可变保护。同版本纯格式变化也应复用已发布归档。

## 4. 后续桌面发布必须集成最新插件

**复用插件包不等于沿用旧插件版本。** 每个新桌面安装器必须集成共享清单中全部最新、已校验且兼容的插件与支持包；新插件也必须进入组合/profile 与离线闭包。不能只改桌面版本后直接克隆旧 stage。

打包前先完成插件独立构建/打包与相关检查，让 artifacts/release/plugins/plugin-packages.json 表示本次要集成的完整最新集合。该清单是当前选择，不根据磁盘目录名猜版本，也不会在打包时自动从网上找未审核代码。拿到比本地源码新的包时先同步对应源码和配置；禁止静默降级或丢弃清单条目。

Windows 正式入口：

```powershell
pnpm package:stable:win
```

脚本按顺序执行：

1. 校验共享清单每项的路径、大小、SHA-256、唯一 ID；归档损坏直接失败。
2. 检查成功 stage 收据、绑定 DSH 的插件快照及 runtime/offline 中实际插件版本；离线签名文件清单必须绑定同一插件 manifest，防止只更新 modules 却仍携带旧 profile-runtime.asar。
3. stage 缺失、插件版本变化、新增插件或闭包缺包时，运行增量 pnpm build，重新装配候选 stage。编译与 tgz 由指纹缓存复用，不强制重打所有插件。
4. 再次确认完整最新集合已集成，防止旧源码把共享清单降级或丢项。
5. consumer-only 克隆到新 build ID，只构建桌面；重新核对最新快照和运行时新鲜度后生成安装器。失败不得使用旧 stage 冒充成功。

安装器携带最新插件的实际可运行离线闭包（profile-runtime.asar 及必要物理文件）、默认 Skills 与小型 MCP 资源；共享 tgz 留在独立资源仓库，不再为每个桌面版本复制一套，也不在安装器里额外重复携带一套 tgz。运行时装配可能硬链接或按需复制文件，这是离线运行要求，不等于重新编译/归档插件。

发布验收应保存本次 plugin-snapshot.json 与成功 build-receipt，逐项核对最新清单、集成版本和签名离线闭包。桌面升级保留用户的禁用、卸载、固定版本和第三方选择，不强行启用全部内置插件。

8.3.2 起，稳定打包还核对七牛已签名的插件、Skills 最新 catalog；安装器不能集成低于公开版本的资源。同版本必须保持归档摘要一致，Skills 的实际文件树、安装版本索引和签名归档须逐项一致，证据保存在 stage/bundled-resource-receipt.json。桌面升级会替换旧 profile 内未固定版本的托管插件；更高版本、第三方来源及显式选择继续保留。未经用户修改的旧 catalog Skill 副本若遮蔽新版内置 Skill，会移入正常回滚历史，让内置新版生效；导入、自定义、编辑过和禁用的 Skill 保留。

## 5. 正式签名、版本和验收

发布新桌面版本时执行下列流程。每次使用独立版本目录和新 build ID，不覆盖 8.3.0 等已发布的 metadata 或安装包。

更新根/desktop package.json、相关 config 版本源及新版本 release notes；通过插件/profile 生成器同步，不手工补生成文件。Python 依赖清单中独立签名的旧 applicationVersion/revision 不是桌面版本替换目标。

```powershell
pnpm plugins:generate
pnpm profiles:generate
pnpm version:check
pnpm profiles:check
pnpm dsh:verify
```

正式打包须从已提权 PowerShell 开始。安装器与应用入口会要求管理员权限，不能先跑到中途才提权；UAC 由用户确认。正式资源签名环境仅指向已有忽略文件，不在日志打印内容：

```powershell
$env:ZEROWALL_RESOURCE_PRIVATE_KEY_FILE = Join-Path (Get-Location) 'scripts/env/resource-stable-4-private.pem'
$env:ZEROWALL_RESOURCE_KEY_ID = 'stable-4'
$env:ZEROWALL_RESOURCE_BASE_URL = 'https://zerowall.chengxunkeji.cn/stable'
$env:ZEROWALL_RELEASE_BASE_URL = 'https://zerowall.chengxunkeji.cn'
pnpm package:stable:win
pnpm release:metadata
pnpm artifacts:manifest
pnpm version:check --artifacts
pnpm verify:package
pnpm smoke:host
pnpm smoke:electron
pnpm smoke:update
```

资源 base URL 必须带 /stable，桌面 base 不带。不得把开发签名公钥加入稳定安装器，不发布 localOnly catalog。上述脚本通过不代表真实 GUI/升级路径已经验收；按修改范围补实际安装、启动、旧用户升级、插件更新/回滚、Python 后台恢复验证。安装器退出码不能代替验收。

至少记录新 build ID、安装器路径/字节数/SHA-256、artifact manifest、ASAR/runtime closure、dsh --version、zws --version、集成插件快照和实际版本。requireAdministrator EXE 的版本检查从提权环境使用 Node spawnSync 捕获输出，不能把 GUI EXE 空日志算成功。

检查按范围执行：

```powershell
pnpm dsh:inventory
pnpm dsh:runtime:closure
pnpm typecheck
pnpm plugins:typecheck
pnpm plugins:test
pnpm test:security
pnpm test:updates
# 打包脚本改动的针对性回归
node --test tools/build/stage-consumer.test.mjs tools/build/clone-current-stage.test.mjs tools/plugins/snapshot.test.mjs tests/updates/plugin-consumer.test.mjs
```

pnpm plugins:verify-pack 会实际 pack 各原生插件，仅在发布格式变化等需要时执行，不作为每次桌面重打插件的步骤。

## 6. 桌面与独立资源发布

仅在用户明确授权发布时执行。先验证七牛公开对象，再推 Git/tag 和创建 GitHub Release。已有安装器或用户要求不重打时，校验并使用指定产物。

桌面发布：

```powershell
pnpm release:publish:stable
pnpm release:verify:stable
```

随后检查 main/submodule 状态与 diff，提交源码、推 Git/tag、创建 GitHub Release；从 GitHub 下载安装器，对比本地和七牛的 SHA-256。不要提交构建输出、凭据或用户数据。公开发布不可复用同版本改变字节。

独立资源：

```powershell
node tools/release/generate-resource-catalogs.mjs
node scripts/publish-resources.mjs stage
# 公开下载、签名、实际安装/回滚验收后
node scripts/publish-resources.mjs promote
node scripts/publish-resources.mjs verify
```

可用 --kind plugin|skill|mcp|python 限定种类。只更新一个插件时使用完整包 ID 合并线上最新 catalog，保留其他资源：

```powershell
node tools/release/generate-resource-catalogs.mjs --kind plugin --plugin @zerowallscience/plugin-images
node scripts/publish-resources.mjs stage --kind plugin --reuse-published
node scripts/publish-resources.mjs promote --kind plugin --reuse-published
node scripts/publish-resources.mjs verify --kind plugin --reuse-published
```

promote 前必须与线上基线核对；只提升相关资源指针，不修改桌面 stable/latest.yml。插件源码总仓库是 https://github.com/ccfwwm/zerowall-dsh-plugins，使用 tools/plugins/export-source-repository.mjs 导出源码并保留来源收据，不能把本地包目录当作源码仓库。上传源码和创建 Release 分别按用户授权执行。

## 7. 用户数据与运行合同

插件通过 candidate profile、Host 健康检查、原子激活、journal 和单插件回滚更新。GUI 与 CLI 发现同一合法 DSH 插件，不能使用另一个 pnpm 主版本绕过现有 store。插件/Skills/MCP 的启动和每日 catalog 检查只读，用户明确操作后才下载、安装、重启或移除。Skills 可热刷新，MCP 连接配置与 Server 包分别版本化。

8.3.1 起，候选、活动和历史 profile 的每次移动都必须同步 pnpm virtual-store 元数据和内部链接；外部离线/CLI 链接保留真实目标，禁止跟随并改写签名缓存。复制使用 verbatimSymlinks，并在新位置修正链接。store 修复只能由明确的插件写操作触发，保存原依赖树及声明文件，失败恢复。`dsh-orb` 是验收样本，不属于集成插件。

升级弹窗应限制在视口内，正文独立滚动、底部按钮固定可见；对该组件的修改应验收长说明和小窗口。

8.3.2 默认启用配置 HMR：desktop/build/zerowall.patch.yml 中 `hmr` 为 `disabled: false`、`config.root: []`。这允许官方插件管理器动态安装、停用、卸载；不能改成监听 `.`，以免会话写入触发重复模块重载。已加载 JavaScript 的版本替换继续使用候选 profile、健康检查和 Host 重启。插件必须通过 Cordis effect 注册可撤销的资源。

插件的纯信息性会话事件必须用 `session.append(type, data, { ignorable: true })` 写入；禁止修改 KNOWN_SESSION_EVENT_TYPES 全局集合。影响核心消息重建的事件不能标记可忽略。历史兼容规则由桌面会话后端配置显式列出，读取旧元数据时仅补充内存视图，保留原始日志，不依赖可卸载插件的当前组合。新增事件须验收真实落盘、关闭、重启以及插件卸载后的历史读取。

Python 是 8.3.0 已实现的后台维护例外：桌面可用后，在固定安装根进行签名 bootstrap/recovery、core/science 按完整清单逐包安装（不以 import/pip check 阻断），并定期核对线上签名依赖。队列持久化并只恢复符合条件的自动任务；capability 仍需用户明确选择。不能切换 legacy slots，失败通过文件事务恢复同一路径。详见 [Python 合同](python-environment.md)。

PPTX 使用环境配置中的独立 gpt-image-generator 路由，分组匹配“生图”或“图片”；媒体工作台图片模型不得覆盖它。质量可选，保留 high/xhigh/max 等用户配置，不因目录缺能力标记就自动降级。完整页面模板并行生图后先核验文字、布局和内容，问题原图编辑修复并复核；默认输出图片型 PPTX，明确要求可编辑时再还原独立对象。事实图片按指定位置原字节嵌入，详见 [演示工作流](presentation-workflow.zh-CN.md)。

升级保留账户/模型、项目、环境变量引用、第三方插件、自定义 Skill/MCP、固定版本与禁用/移除选择。禁止清空用户 profile 来解决升级问题。

8.3.6 的活动插件根固定为 `harness/profiles/web/node_modules/<插件名>`，安装后的托管插件入口是实体目录。安装、升级和缺目录修复直接使用安装包内的签名插件供给，不先复制成用户侧 `resources/offline` 缓存，不搬迁旧离线目录。插件共享依赖在同一 profile 的固定依赖目录，允许保持包内部的标准依赖链接以保留版本和 peer 关系；DSH 核心继续由桌面共享运行时供给。已有 `resources/offline` 及历史 generation 保留，只有保留高版本、固定版本插件时才按需读取，不得成为 Host 的解析回退。历史跨 DSH 插件只可按原签名、实际兼容范围和逐文件摘要导入独立插件及必要非核心闭包，验证当前核心依赖后再经候选健康检查激活；不得放宽整载体 DSH pin 或引入旧核心。

## 8. 清理与交付

只清理由清单确认的旧产物，先检查活动进程、当前指针、有效归档和外部引用，保留 protected 文件哈希。不要 reset --hard、全局 git clean 或递归删除未知目录。旧版本 stage/解包验收中的生成依赖可随已确认旧产物清理；开发 node_modules 必须保留。不删除七牛/GitHub 历史发布。

日常 GC 先运行 pnpm artifacts:gc --dry-run 并核对，再按用户授权 --apply；不要删除有效共享 tgz、签名 catalog、当前 stage、发布收据或内容缓存。一次性验收报告写 artifacts/verification/<version>，Skills 审计输出也在该目录，不回写 docs。

提交前运行 git diff --check、git status --short --untracked-files=all 并逐项审阅。交付记录分支、父 HEAD、DSH commit、修改范围、测试/跳过项；涉及打包时补产物路径、大小、摘要、build ID，涉及发布时补公开 URL 和下载校验。未构建、未发布或未做真实 UI 验收必须准确说明。
