# 8.2.0 三插件升级与启动恢复验收

工作分支 `main`，父 HEAD `f727d39994bf396346e3bf249dc5758b3288d27a`，DSH `4af4cb76935bd893a6854f38403bd06928878074`，保持 `0.2.0-rc.2`。

## 上游与独立版本

| 插件 | 上游基线 | ZeroWall 资源版本 |
| --- | --- | --- |
| Sidebar | v0.26.0 / 9323f48d0946432ffd94655df1c115a1cd89f34c | 0.26.1-zws.1 |
| GenUI | v0.12.0 后的 main / fef7c7b1df78726737707ef4a806e7f0a5e92c10 | 0.12.1-zws.1 |
| Progressive Tools | v0.7.0 / f929e86fb442bf289d56e268562b31d8fb8a390b | 0.7.2-zws.1，复用已发布归档 |

Sidebar 保留 Electron 标题栏、工作区提示和 shell 适配。GenUI 保留 ZeroWall 面板命令与 schema，纳入上游 fence 截断修复。Progressive 保持四个审计过的精确 rc.2 peers。

`plugin-compatibility.json` 仅为指定旧版本消费者的 `^0.25.0` Sidebar 依赖提供此版本的兼容证据；新打包消费者声明当前精确版本。不放宽其他依赖或 DSH 范围。实际 Host/Client 与更新验收收据完成前，不作为发布完成证明。

## 功能修复

- Base 0.1.17：没有有效工作区时注册用户数据目录下的默认工作区，保留已有有效工作区及失效记录。
- Electron：可见 composer 作为挂载信号；导航与探测共用 45 秒期限；Host 更新必须同时验证客户端挂载，失败进入原子回滚；旧导航失败不得覆盖恢复后的工作台。
- 启动状态终态保护，失败后耗时固定，不再被进度回调改写。
- Research 0.1.12：内联共享 Python 写锁修复，陈旧锁不再永久阻止科研进程。该执行代码相对已发布 0.1.11 有变化，因此独立递增版本，不覆盖历史归档。

## 当前验证证据

`artifacts/verification/8.2.0/` 保存完整日志。typecheck 通过；GenUI 1219 通过、4 跳过；Progressive 73 个测试及 check 通过；Research 固定安装 Python 322 通过、3 跳过。Sidebar 全量扫描 2491 通过、8 跳过，两个失败为 Windows Git 临时目录清理；修复清理重试与 localStorage 测试隔离后，两个相关文件 37 个测试通过。Base 默认工作区与更新入口重点测试 6 个通过，启动期限/导航/挂载重点测试 9 个通过。

真实本地安装、插件独立更新、故障回滚、设置尺寸、会话及配置保留、安装包和七牛收据仍需补充；本文件当前不声明完成这些验收。
