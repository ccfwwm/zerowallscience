# ZeroWall Science 6.1.0 — Zotero Harvest 与桌面交互验证

日期：2026-09-17。仅本地重打包，不发布到 GitHub 或七牛，不安装覆盖用户环境。

## 来源与适配

- Zotero Harvest：Fisfzy/zotero-harvest 0.2.0，提交 9635a4f27ba186f414d3ba23042bd12ee176cddc，MIT。
- 保持 DSH 0.1.5-rc.2 当前锁定提交不变；插件作为独立 workspace 包和生产依赖挂载。
- 上游写入请求缺少本机 Zotero 授权、请求体格式不匹配、PDF 上传协议不匹配；已按本机 Zotero omni.ja 中实际 Local API 协议适配。
- 移除直接写 Zotero SQLite 及外部 zotero-wave-rag 索引依赖；使用 DSH 现有 Zotero 地址和凭据服务。
- 当前 DSH 的 Cordis inject 使用服务名数组，不能使用 required/optional 对象；已通过真实 ToolRuntime 挂载验证。
- Zotero Sources reducer 要求 creatorSummary，入库结果转换时补齐，支持直接工具与 tool_dispatch 调用。
- 文献详情、导出直接使用现有 Zotero provider；引用文件使用 Electron 原生保存窗口。
- 用户消息由 file-review 组件渲染，其原复制逻辑绕过桌面桥接；改为共享 writeClipboard 后读取 Windows 剪贴板验证。
- 启动页无操作按钮，连续动画独立于 Host 阶段更新；托盘重启保留。

## 已完成检查

- Harvest 10 项测试：六个工具在真实 DSH 中挂载、输出 schema、动态共享 Zotero 设置、原生授权协议、分类、PDF 三阶段上传、单次授权更新、持久授权复用、并发去重、拒绝和失败无错误重放、中文标题和 inbox 状态。
- Zotero／会话视图 9 项契约测试通过，包括用户真实日志恢复 19 条文献，以及入库结果显示到现有 reducer。
- Desktop 59 项测试通过；TypeScript 检查通过。
- 公开 Crossref 请求返回 2 条文献。该检查只读取公开数据。
- 真实用户 Zotero 库不执行测试写入；写入协议测试使用隔离 HTTP fixture。

## 最终成品验证

- 完整重建后按顺序完成 Desktop 编译、NSIS 封装；最终 ASAR 中 main/preload 与编译产物逐字节一致。中途未通过校验的输出已被最终成品覆盖。
- 成品 Host 启动、插件 active 状态、六个 Harvest 工具注册及调用通过。
- 直接加载最终 ASAR 内 Harvest 模块进行隔离写入测试：8/8 通过。
- 成品 Desktop 启动及中文／英文设置即时切换通过，包含保存的 SSH 配置。
- 启动页无按钮，350 ms 间隔可检测连续动画位移；启动错误诊断、修复后恢复及重启停止旧 Host 检查通过。隔离回归启动约 33 秒；最后多项测试并行时启动约 48 秒，不作为所有机器的性能承诺。
- 真实用户日志恢复 19 条 Zotero 文献，选中文献从本机 Zotero 获取真实详情，打开 Zotero 协议分发与“问这篇”切回对话通过。
- 用户消息／助手消息／引用均读取 Windows 原生剪贴板验证；真实 Zotero 生成 BibTeX，点击下载后原生保存接口生成 UTF-8 文件，文件内容与界面引用完全一致。
- Windows 缺少 Downloads 已知目录映射时仍可正常保存引用；最终隔离环境覆盖此回归。
- 更新元数据检查、git diff --check 通过，DSH 子模块保持干净并与锁定 SHA 一致。

证据日志：`.tmp-6.1.0-harvest-final2-package.log`、`.tmp-harvest-packaged-host-final.log`、`.tmp-harvest-packaged-write-final.log`、`.tmp-harvest-packaged-actions-final.log`、`.tmp-harvest-packaged-startup.log`。

交互截图／导出文件：`C:/Users/ccf/AppData/Local/Temp/zerowall-actions-AoBGmy`。
启动截图／重启证据：`C:/Users/ccf/AppData/Local/Temp/zerowall-startup-recovery-KoLeac`。
设置双语截图：`C:/Users/ccf/AppData/Local/Temp/zerowall-packaged-desktop-f8x25Q`。

## 交付

- 文件：`desktop/dist/zerowall-science-6.1.0-win-x64.exe`
- 生成时间：2026-09-17 11:08:50（本机时间）
- 大小：288126242 字节
- SHA-256：`6155e5d945c4c90b27d12527fbef27388f45f85803d1e65945eddb366bfeb09f`
- 首次真正入库需要在 Zotero 原生授权窗口中允许写入。
