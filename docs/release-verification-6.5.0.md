# ZeroWall Science 6.5.0 发布验证

## 范围

Windows x64，主仓库 main；DSH 固定到 `5a0414267f9c3a166e15ceb2603811ef95369b3a`。环境变量、账户、Python、更新、设置和启动流程采用统一浅色分组样式，并保留主题切换。附件上传与解析状态分离，解析期间的提交先本地回显，再等待解析完成后提交回执。

## 已完成的源码验证

- DSH GUI：375 个文件、5380 项通过，1 项跳过。
- DSH 设置真实浏览器：关闭按钮、Escape、遮罩、焦点恢复、权限默认值、深浅色、字号、会话显示、语言持久化；10 项通过。
- 插件 UI：9 个文件、33 项通过，1 项跳过；Python 加载/不可用/筛选空列表补充用例通过。
- 文件解析、MinerU、Python 定向回归：15 项通过。
- 桌面单测：21 个文件、90 项通过；新增启动页退出授权检查所在文件 5 项通过。
- 主仓库合同检查：31 项通过，1 项跳过。
- 第一方插件类型检查、桌面类型检查及 DSH 构建通过。

## 已知基线检查问题

完整 `doc-sync` 仍报告已有的文档/生成目录/类型说明/翻译配对问题。本次新增双语 Agent Note 的配对和提交检查通过。

上游 Web 大场景中的旧插件面板夹具仍依赖已变化的 `data-plugin-scope=preset` 布局，导致该插件浏览场景失败；本次设置壳使用独立真实浏览器场景验证。`shipped-composition` 的旧重试策略快照期待枚举错误码，当前定制版本使用 `*`，该基线快照尚未同步。以上未计为通过。

## 发布与安装包

- 安装包：`zerowall-science-6.5.0-win-x64.exe`，334232379 字节。
- SHA-256：`437e49a98f9471dfd5f1d769e95524f3a8dcd38740e50472d19d33e6f85520bc`。
- `profiles:check`、`release:verify-local` 通过。
- 最终 ASAR 包含的 Host 与 Desktop 启动、设置 About 版本、中文/英文切换验证通过；Host 与 Desktop 就绪耗时 43283 ms。
- 启动失败页、恢复、重启停止旧 Host 测试通过。
- 阻塞客户端 JS 加载时只有一个品牌 splash 遮罩；释放后工作台就绪且原生遮罩数归零。
- 最终包的变量遮罩/显示/复制/删除、更新排列、账户及设置操作专项测试通过。
- 最终 Windows 打包版完整 Electron 回归 13 项全部通过（57.89 秒），涵盖旧壁纸迁移、自定义壁纸、Markdown 图片、模型目录、侧栏、剪贴板、中英文、插件/Skills/MCP、环境配置和账户。测试夹具同步处理刷新后的首次配置弹窗，并将旧 TSG 按钮断言更新为现行文献服务配置。
- 一轮复测曾在 UI 加载前遇到 Windows 本地端口 55006 的 EACCES；新隔离目录重跑同一安装包后通过，未改动系统端口策略或产品代码。
- 隔离安装升级通过：中文和空格目录、记住安装路径、停止升级目标、保留同名无关进程、保留用户数据；文件版本 6.5.0.0。验证范围为当前用户安装，未测试全机器安装的管理员 UAC 同意流程。
- Python 公共运行时清单仍为 Python 3.12.10、科研环境 1.4.0。

本地证据保存在 `desktop/dist/verification-6.5.0/`；公开资产使用 `tools/release/verify-public-assets.mjs` 全量下载，逐个比较大小与 SHA-256。

## 公开发布结果（2026-09-19）

- 发布提交 `0fb742f2db4118b1e19efeee4a9946f1620c02c9`，注释标签 `v6.5.0`；DSH 两项提交先推送到自有 fork，正常 pre-push 类型检查通过。
- 七牛云先发布不可变版本文件，再更新三个 Stable 入口；六个公开文件均完整回读并匹配本地大小和 SHA-256，`release:verify:stable` 通过。
- GitHub Release：https://github.com/ccfwwm/zerowallscience/releases/tag/v6.5.0 ，正式发布，非草稿、非预发布，共六项资产。
- GitHub API 的六项资产大小和 SHA-256 均匹配。由于本机 GitHub 大文件连接停滞/重置，额外通过已配置的 `hklinux` 验证主机独立完整读取六项公开资产，在内存中计算哈希，不在远端保存安装包；六项全部匹配。本机未完成的直连及分段尝试不计为成功。
- 主仓库 `origin` 远端只有 `main`；`main` 包含本次实现和发布记录，版本标签固定在上述发布提交。

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| zerowall-science-6.5.0-win-x64.exe | 334232379 | 437e49a98f9471dfd5f1d769e95524f3a8dcd38740e50472d19d33e6f85520bc |
| zerowall-science-6.5.0-win-x64.exe.blockmap | 346447 | 4b2ad2faac6b31cd7f21a5d4af8abc7a51cc17c6e7860cb4f7d61b60dbd1b24b |
| zerowall-science-6.5.0-latest.json | 1395 | aa16a5fa2225d791c757f54f2ad85c307a4eb7774b4d450121cd777943676275 |
| latest.yml | 1312 | 299cd205b6a75064cec56a5ed83811ec7d2052fd8a3a90f0f1ef4c1ff0c341a8 |
| releases-latest.json | 1395 | aa16a5fa2225d791c757f54f2ad85c307a4eb7774b4d450121cd777943676275 |
| releases-zerowallsciencedev-latest.json | 1395 | aa16a5fa2225d791c757f54f2ad85c307a4eb7774b4d450121cd777943676275 |
