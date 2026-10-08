# 8.0.6 → 8.0.8 功能对照与验收

基线提交：`1e76a16e87ee53da9270e750673a8572447d5517`。开发起点：`fc77ce52507aab751925f9d0cec1a392af56306f`。DSH 保持 `86b6740d0e671cee0b3fd0168de484c0efbf46ea`。

8.0.6 的 `plugin-inventory.json` stable composition 是默认功能名单。8.0.8 的 ASAR 只包含五个 ZeroWall Core 插件，完整默认功能由另外携带、验签、安装到用户 profile 的离线闭包提供。名单、文件数量、入口存在只属于静态门禁；下面分别记录真实操作和外部依赖边界。

## 验收记录

最终 Windows 安装包已完成真实验收。七牛和 GitHub 公网上传及下载复核已按发布流程完成；外部账户、远端 SSH/Zotero、微信扫码及大型科研依赖按实际配置显示就绪状态。日志和收据统一放在 `artifacts/verification/8.0.8/` 与 `artifacts/logs/8.0.8/`。

| 8.0.6 正式功能 | 8.0.8 验收动作与证据 | 当前结果 |
| --- | --- | --- |
| 桌面、版本、设置、语言、外观 | 真实 Electron 版本、关于页、中文/英文、皮肤选择与配置保存 | 通过：18/18 Electron 测试 |
| 全部默认插件 | 原始 ASAR 排除可选代码；签名离线闭包完整文件集、Host 实际 fiber 激活、中文路径隔离 profile | 通过：Host/Electron 实际激活；闭包 36 插件、23,566 文件 |
| 账户与 AI 云平台 | 安全 IPC、登录/密码重置界面、AI 云平台设置；不向 Renderer 暴露秘密 | 通过：真实设置页面；无凭据请求显示 MISSING_CREDENTIAL |
| 环境变量、文献凭据 | 添加、遮罩、显式显示、复制/剪贴板失败状态、删除；缺失域服务不阻塞基础页面 | 通过：真实环境配置入口和安全状态 |
| 项目、会话、文件 | 真实 workspace/session 创建、历史恢复、相对 Markdown 图片、原文件保持不变 | 通过：隔离中文路径 Electron fixture |
| 文件解析与 Office | 隔离工作区 DOCX 经实际 Host/LibreOffice 转 PDF，原字节不变；文件提取、授权和有界读取 | 通过：打包 Host/Office 门禁 |
| 科研工作台与引擎管理 | 分子测距、画布四种导出、PCR 确定性结果、引擎配置读取和管理页面 | 通过：真实科研工作台和引擎页面 |
| 图像、分子、序列、脑图谱、流式、HE | 原有图像/分子/序列/流式/HE/脑图谱契约及确定性本地 fixture；不将未装引擎标为就绪 | 通过：插件测试和 Electron 本地 fixture；外部引擎按需 |
| 默认 MCP 与自定义连接 | 真实列表、rmcp 配置修改/持久化；serverName、停用状态、凭据引用保留 | 通过：更新/迁移 41 项及 Electron 扩展中心 |
| Python 管理、core/science/capability | 本地清单零远端访问；真实包数量；签名/清单/计划/原子切换/恢复及回滚 | 通过：真实 Python 页面和更新测试 |
| Skills | 默认及用户来源扫描、导入、停用、热刷新与回滚；真实目录列表 | 通过：本地列表、扩展中心和插件测试 |
| 扩展中心 | 反复打开/切标签/切语言/本地刷新零远端；人工检查；单组挂起、过期响应、目录失败保留列表 | 通过：5 项 UI 测试和 Electron 反复打开/人工检查 |
| 独立更新、固定版本、依赖与回滚 | 8.0.6/损坏 8.0.7 迁移、候选健康失败、原子恢复、中断 journal、固定及第三方保留 | 更新 41 项全部通过 |
| Zotero 与文献采集 | 打包真实 Host status、安全授权、采集工具确定性调用；保留 Sources/附件适配 | 通过：最终打包 Host/集成检查；外部 Zotero 连接仍依赖用户配置 |
| PubMed、MinerU、singlecell | 打包真实状态 RPC；原有网络/文件/凭据/执行/结果契约 | 通过：最终包 Host/入口已验收；外部 PubMed/MinerU/singlecell 服务按配置 |
| GenUI | Host 工具与懒加载前端引擎、模板/交互/独立导出 | 通过：878 项 GenUI 测试和真实 `/panel` 本地面板 |
| SSH | 实际设置表单、凭据表单、原保存 profile 字节不变；连接测试保持原授权边界 | 通过：真实 Electron 设置页；远端连接按配置 |
| 微信、会话通知 | iLink/WebChat 设置页面、手动扫码状态、通知引擎 | 通过：真实 WeChat 设置页；无凭据明确显示未登录 |
| 执行、运行记录、论文与审阅 | 原有 Host 服务、存储和工具契约；DSH 官方 Auto Review 保留 | 通过：最终包默认插件激活与完整 Host/Electron 门禁 |
| CLI | 打包 `dsh --version` 与 `zws --version`、profile doctor、独立管理命令 | 通过：包级 Host/CLI 门禁 |

外部账户的真实登录、计费生成、Zotero 桌面连接、SSH 远端执行、微信扫码、科研大依赖下载和分析，依赖用户配置及实际服务。测试采用隔离 profile，不复用或修改真实用户凭据，不能把缺凭据状态或本地 fixture 解释成上述外部服务已成功执行。

## 离线与迁移门禁

- `pnpm smoke:host --offline-network`：实际打包 Host，测试预加载器阻断对外 fetch/socket 和包管理器执行；默认插件必须全部激活并通过本地 RPC/WebSocket/会话持久化检查，收据记录安装尝试为零。
- `pnpm smoke:electron`：真实打包 Electron、隔离中文路径、默认插件 active、完整管理入口及实际操作。禁止以 Core 静态 smoke 代替。
- `pnpm test:updates`：architecture 5/6 → 7；重复执行；模型/账户/项目/环境引用及 MCP 配置保留；精确固定版本、第三方及较新独立 generation 保留；候选失败及中断恢复。
- `pnpm verify:package`：实际文件验签、原生加载、Office/前端资产、CLI、Host/Electron。最终安装器必须使用新 build ID 正常打包，并再次验收；早期解包测试 fixture 不能直接作为发布资产。

## 发布验收

安装器路径为 `artifacts/packages/8.0.8/windows-x64/zerowall-science-8.0.8-win-x64.exe`。

- build ID：`1791485199387-0ad25e81`
- 大小：`481215450` bytes
- SHA-256：`4568068a6bd48e8f1d692228a47efcb75db089522a20180258e5c3fd4bed6873`
- `pnpm verify:package`：通过
- `pnpm smoke:host --offline-network`：通过
- `pnpm smoke:electron`：最终 build 再验收 18/18 通过（2026-10-09 03:08 开始，197.46 秒）；此前回归日志仍保留于 `artifacts/logs/8.0.8/electron-8.0.8-final-rerun2.log`。

七牛 325 个不可变资源对象（37 插件、281 Skills、2 MCP、1 Python 加 4 个 catalog）和 4 个签名指针已经完成 stage/promote/verify；桌面 6 个公开对象经 `pnpm release:verify:stable` 全部 HTTP 200，大小和 SHA-256 匹配本地。

[七牛安装器](https://zerowall.chengxunkeji.cn/stable/releases/8.0.8/zerowall-science-8.0.8-win-x64.exe) 和 [GitHub v8.0.8](https://github.com/ccfwwm/zerowallscience/releases/tag/v8.0.8) 已公开。GitHub 的安装器、blockmap、latest.yml 和版本 metadata 均已完整下载、重新计算 SHA-256，与本地及七牛一致。

源码发布提交 `9624d2619813e8d2dc3cefd466225adbeeda334f`，`v8.0.8` 指向该提交。安装器在提交前由父提交 `fc77ce52507aab751925f9d0cec1a392af56306f` 加本次工作树改动构建，manifest 保留 `source.clean=false`，没有将其声称为 clean HEAD 构建。后续验收文档提交不改安装器或发布标签。

公开收据：`artifacts/release/8.0.8/publication/qiniu-resources-public.json`、`qiniu-desktop-public.json` 和 `artifacts/verification/8.0.8/github-public/hash-comparison.json`。清理仍暂停。
