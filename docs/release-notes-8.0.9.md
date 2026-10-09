# ZeroWall Science 8.0.9

本次版本修复离线插件重复准备、运行时重复依赖和正式构建未使用增量缓存的问题。默认离线科研功能、Office 和 Zotero 适配保持完整。

- 默认插件的普通依赖使用独立 `profile-runtime.asar`，物理入口、Office worker 和原生资源按运行要求展开。独立发布的插件 tarball 留在 release 目录。
- 签名离线收据 v2 绑定归档、展开文件与逻辑文件集，generation 由稳定内容身份确定；桌面构建记录不再触发无变化插件重装。兼容现有 v1 generation。
- 按实际依赖实例和依赖、peer 解析上下文去重，排除开发缓存。
- 正式 build 检查全部组件内容指纹和输出哈希；已提交变化、共享源码 helper、缺失及损坏产物进入重建判定。
- 新增离线验证、复制与 profile 准备的分段启动记录。
- 正式 Windows 打包使用增量任务图；未变化插件复用已验证 tarball，桌面版本和 build ID 不再使全部插件失效。

本地 Windows x64 安装包已生成并完成覆盖安装：

- build ID：`1791561463413-f0f9c239`
- 文件：`artifacts/packages/8.0.9/windows-x64/zerowall-science-8.0.9-win-x64.exe`
- 大小：`316401650` bytes（约 301.7 MiB）
- SHA-256：`a2200357281410897bd1a9f7f4702742599cb4b004a8f35acdfd4d4f8e344ced`
- 安装后资源：约 1342.5 MiB，5,028 个文件，签名离线文件 991 个
- 覆盖安装：185.1 秒（解压 151.2 秒，收尾 30.8 秒）
- 打包内置启动：25.3 秒；安装目录 fresh 启动成功样本约 21.8–23.2 秒；日常启动约 14.6–15.4 秒

两次 fresh 启动遇到 Windows 随机本地端口 `EACCES`，桌面自动切换端口后恢复；严格自动启动脚本仍有偶发 Host 激活误报。首次启动全部不超过 20 秒、安装耗时下降 30% 和五次全场景启动验收没有达成或完整验证，不能据此宣布通过原计划的全部性能指标；用户后续接受约 31 秒启动，并取消 8.0.8 对照要求。

已通过 package、Host、Electron（18/18）、更新、原生插件打包、DSH/profile/runtime closure、类型、安全门禁，以及 Office 转 PDF、文件预览、GIS/PDF、历史回载和四种增量构建场景。更新测试 48 通过、3 个依赖 Electron 环境的用例跳过。8.0.9 安装器沿用上述已发布字节，没有重新打包。

发布后按用户要求清理本地安装器、stage、临时验证和日志；公开发布收据保留在主目录 `artifacts/release/8.0.9/publication/`，签名 catalog 和校验后的原始插件 tarball 保留供后续增量打包复用。代码实现提交 `d4738fbee0778e0d0bae495b1bcdc2ac75e63c6d` 已合并到 `main`；安装包记录的是打包当时的基线 HEAD 和未提交源码状态，后续提交与清理不改写发布资产。

后续发布工具已增加 `--kind plugin`，可以单独生成和发布插件 feed，无需完整 Skills stage；23 项发布工具测试通过。工作方式已更新为直接在主目录开发。

两个额外 worktree 已从 Git 解除，主目录 8.0.6/8.0.7/8.0.8 的安装包、旧验证和日志已移入回收站。当前 Codex 应用仍缓存部分 `.asar` 句柄，Windows 也限制部分旧 stage 的路径操作；残余 worktree 文件和 8.0.8 stage 尚待清理。已启动后台助手，等待当前 Codex 退出后，按冻结文件清单与大小、修改时间检查将生成文件移入回收站；变化的文件保留。实际完成状态见本机 `artifacts/cache/cleanup/8.0.9-cleanup-state.json`，不能把等待状态视为清理完成。

公开下载：

- 安装器：[zerowall-science-8.0.9-win-x64.exe](https://zerowall.chengxunkeji.cn/stable/releases/8.0.9/zerowall-science-8.0.9-win-x64.exe)
- 更新元数据：[latest.json](https://zerowall.chengxunkeji.cn/stable/releases/8.0.9/zerowall-science-8.0.9-latest.json)
- 资源目录：[plugin-latest.json](https://zerowall.chengxunkeji.cn/stable/catalogs/plugin-latest.json)、[skill-latest.json](https://zerowall.chengxunkeji.cn/stable/catalogs/skill-latest.json)、[mcp-latest.json](https://zerowall.chengxunkeji.cn/stable/catalogs/mcp-latest.json)、[python-latest.json](https://zerowall.chengxunkeji.cn/stable/catalogs/python-latest.json)
