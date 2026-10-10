# ZeroWall Science 8.1.0

本版本更新独立插件与 Skills 资源，并改进资源更新检测和扩展中心体验。

- DSH 插件操作失败时显示经过脱敏的 profile diagnostics、DSH/桌面版本、插件兼容性和命令输出。
- 启动后及每日主动检查插件、Skills 和 MCP 签名资源目录；扩展中心打开时也检查 Python。发现桌面或资源更新时自动弹窗，在左下角更新入口显示提示并提供扩展中心入口。检测过程只读，不自动安装或重启。
- 扩展中心增加资源摘要、分组更新数量、搜索、明确的本地刷新与远端检查状态，并隔离各资源组的失败和迟到结果。
- 优化窄屏摘要和工具栏布局。未安装的 Python 能力提供独立安装入口，不再误报为更新或进入全部更新。
- 修复候选 profile 对离线插件 `workspace:` 依赖的重新解析，以及 Progressive Tools 的包名注册和精确 DSH peer 版本；保留健康检查、原子激活和回滚。
- 更新锁定的上游插件适配，保留 DSH 子模块 `86b6740d0e671cee0b3fd0168de484c0efbf46ea` 不变。

Windows x64 构建 ID：`1791616088507-10a8b33f`。安装器大小：`317,644,649` 字节；SHA-256：`23c1af2e65fca7655d5b5d41166aa9a8d76da9bf4192db109dd340c961886fd3`。

下载地址：https://zerowall.chengxunkeji.cn/stable/releases/8.1.0/zerowall-science-8.1.0-win-x64.exe

插件目录包含 37 个插件，Skills 目录包含 282 个 Skills，均使用稳定 `stable-4` Ed25519 签名。资源目录和每个归档已通过七牛公网大小与 SHA-256 校验；真实旧插件和旧 Skill 的升级、健康检查、回滚以及启动更新弹窗均已验收。详细收据见开发指南第 16 节和 `artifacts/release/8.1.0/publication/`。
