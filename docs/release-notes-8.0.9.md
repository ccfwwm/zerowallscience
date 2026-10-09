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

两次 fresh 启动遇到 Windows 随机本地端口 `EACCES`，桌面自动切换端口后恢复；该现象不是资源缺失。完整功能和公开发布状态以 `artifacts/verification/8.0.9/` 及 `artifacts/release/8.0.9/publication/` 中的收据为准。

公开下载：

- 安装器：[zerowall-science-8.0.9-win-x64.exe](https://zerowall.chengxunkeji.cn/stable/releases/8.0.9/zerowall-science-8.0.9-win-x64.exe)
- 更新元数据：[latest.json](https://zerowall.chengxunkeji.cn/stable/releases/8.0.9/zerowall-science-8.0.9-latest.json)
- 资源目录：[plugin-latest.json](https://zerowall.chengxunkeji.cn/stable/catalogs/plugin-latest.json)、[skill-latest.json](https://zerowall.chengxunkeji.cn/stable/catalogs/skill-latest.json)、[mcp-latest.json](https://zerowall.chengxunkeji.cn/stable/catalogs/mcp-latest.json)、[python-latest.json](https://zerowall.chengxunkeji.cn/stable/catalogs/python-latest.json)
