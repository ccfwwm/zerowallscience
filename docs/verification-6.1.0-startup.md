# 6.1.0 启动故障与设置中英文适配验证

## 本机证据与根因

读取 `C:/Users/ccf/AppData/Roaming/zerowall-science/logs/harness.log`。2026-09-17 08:00、08:03 两轮启动均出现：

- `ssh_ops_profiles` 的已保存记录包含 `defaultProjectPath: null`。
- SSH 保存接口允许并默认写入 null，但持久化读取 schema 只接受字符串或省略值，重启时整个插件树加载失败。
- 桌面端只要收到 200–499 即标记 ready，未带认证的 401 被误判成功；窗口又要求带 token 的 URL，因而永久停留在启动页。
- bootstrap 仅设置 exitCode，已创建的网络监听器、MCP 子进程和定时器继续存活，桌面端也未收到进程退出事件。
- 原 MCP 构造函数在核心插件加载阶段创建异步 Cordis fiber。未 await 并不能把这些 fiber 排除出全局启动屏障，远端连接与本地 Python 初始化拖慢首屏。

## 修复

- SSH 持久化 schema 接受 null、省略和原有字符串目录，不删除、清空或重写用户配置。
- 等待本轮 Host 输出认证 URL，验证同源、HTTP 成功和真实 `__DSH_BOOT__` 页面；等待有总期限。错误页面、401、缺少 token 均不算就绪。
- Host 启动失败通过 IPC 立即报告根因，桌面端终止失败进程树；bootstrap 为遗留句柄增加退出兜底。无论 Host 立即退出还是留存定时器，后续 exit/error 事件均不覆盖已记录的具体根因。
- 启动页先显示，再执行本地检查。已有用户不再每次递归遍历旧版用户数据；Python 更新和软件更新在工作台加载后运行。
- 工作台 DOM 挂载后释放 MCP 自动连接，最多两个并发；保留用户 enabled 状态与手动按需连接功能。
- 新启动页显示四个真实阶段、耗时、错误详情、日志文件夹入口；失败或等待超过 20 秒可重新启动。
- 托盘新增重启，复用有界 Host 清理流程后调用 Electron relaunch，并增加单实例保护。
- 新增 `logs/startup.log`，记录阶段和耗时；Host 诊断日志隐藏 URL token。
- AI 云平台、Python 环境、SSH 资源和关于页面原先有中文硬编码，现接入统一 locale。设置导航、说明、状态、操作按钮、SSH 资源/共享凭据编辑窗口及私钥校验均提供中英文；用户自己的服务器名称与路径保持原样。
- 英文 AI 云平台页的保存密码说明随语言切换。浏览器单独启动而没有桌面凭据 IPC 时给出可读提示；不降级到不安全的浏览器密码存储。

## 回归测试

- Desktop：58/58，包括延迟认证 URL、303 认证 Cookie 交换、错误 HTML、启动超时、存活 Host 的失败 IPC、失败后立即退出的错误保留、重复启动合并、遗留定时器退出。
- MCP：31/31，包括桌面就绪前不启动已保存连接、就绪信号幂等、真实本地 stdio 生命周期。
- SSH：保存凭据与目录 schema 回归通过，覆盖 null / 省略 / 字符串三种持久化值。
- Desktop 和 MCP TypeScript 检查通过。
- Base：12 通过、1 跳过；Account：28 通过；Base、Account、MCP 中英文源码类型检查通过。
- SSH 凭据、项目目录、资源卡片、分组、侧栏集成和 PEM 私钥校验通过。
- 扩展 Host 验证发现单细胞插件 validate/plan/run 的 config 对象缺少显式 additionalProperties，导致子服务创建失败；父 apply 未 await 掩盖了异常。补全 schema 并 await 子服务加载，真实 Cordis/ToolRuntime 回归测试与原业务测试共 7/7 通过。

## 最终安装包验证

- 2026-09-17 最终构建：`desktop/dist/zerowall-science-6.1.0-win-x64.exe`，288,207,109 字节。
- SHA-256：`7d0c5482780d31f4c23c80381c3cb8b4f677a690e4f094ec016c008dddfd33d5`。
- 完整打包 Host 检查通过：真实认证 Cookie、客户端模块图、插件清单、Zotero/PubMed/MinerU/单细胞 RPC、必应检索及缓存、WebSocket 重连、明文会话持久化。
- 验证脚本同步当前 rc.2 的具名 RPC 参数、`/api/remote.mux` 和原始模块 URL；未跳过 401/404。独立 Host 使用只读空凭据测试代理，桌面检查使用真实 Electron 安全凭据代理。
- 最终打包 Desktop 检查通过：含 null 项目目录的已保存 SSH 资源可启动；中英文无需刷新切换，AI 云平台、Python 环境、SSH 资源/共享凭据编辑窗口和关于页面断言通过，英文页面无硬编码中文残留。
- 用户 SSH 配置副本与 `Downloads/session.v3.jsonl` 同时回放通过，约 34.0 秒进入工作台；Zotero 显示 19 条文献，SSH 主标签、非对话标签隐藏输入框、草稿保留和重新加载通过。并行验证负载下的默认配置启动约 38.8 秒，仅作为本机隔离测试记录。
- 启动错误/重启恢复验证通过：非法持久化端口显示具体错误和重试入口；改正后含 null 目录的配置可进入工作台；重启先关闭旧 Host 监听再请求 relaunch。
- Stable 更新元数据检查通过。未发布到外部平台。
- 截图及日志：`.build/verification/6.1.0-startup/`，其中 `settings/` 保存最终中英文页面截图。

## 数据保护

用户原始 SSH 配置文件仅用于读取和隔离副本回放，原文件 SHA-256：
`ee92f497cb1b4578e9d146445f5a1ad23107410b818d8bc67b75f1623bcb7c4f`。
本轮没有覆盖本机用户数据、删除会话、连接 SSH 服务器或发布外部版本。
