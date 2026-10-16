# ZeroWall Science 项目指南

当前桌面基线为 8.3.1。开发、打包、签名、最新插件集成及发布流程统一见 [开发指导](codex-development-guide.zh-CN.md)，文档入口见 [文档索引](README.md)。历史阶段文档由 Git 保存。

ZeroWall 使用 Electron 作为桌面壳，DSH 提供 Host/Agent 运行时，独立插件提供科研与界面功能，plugins/research-store 保存项目数据和审计记录。领域能力应在插件中扩展，桌面负责窗口、凭据桥接、安装、启动和桌面更新。

## 目录

| 目录 | 内容 |
| --- | --- |
| desktop/ | Electron 主进程、preload、安装更新；build/ 是源码 |
| plugins/ | 平铺插件、上游适配、Research Store、支持包和组合声明 |
| deepseek-harness/ | 固定 DSH fork 子模块，版本以 config/deepseek-harness/upstream.json 为准 |
| resources/ | extensions 下的 Skills/MCP/Python/引擎资源，以及 branding/cases/provenance |
| profiles/、config/ | 组合生成结果及上游、布局、兼容和资源版本合同 |
| tools/、scripts/ | 生成、构建、检查与发布自动化 |
| tests/、docs/ | 验证源码及当前文档 |
| artifacts/ | 开发输出、共享归档、stage、安装器、验收与日志；不提交 |

根 packages/store 不是源码入口；deepseek-harness/packages 属于子模块自身结构。开发 lib/dist/out 兼容链接指向 artifacts/dev，不是正式发布目录。

## 开发

使用 Node.js 24.9.0 和 pnpm 11.7.0，新克隆初始化子模块并安装锁定依赖：

```powershell
git clone --recurse-submodules https://github.com/ccfwwm/zerowallscience.git
Set-Location zerowallscience
pnpm install --frozen-lockfile
pnpm build:dev
pnpm dev
```

在现有工作区保留本地配置与 node_modules，不为清理重装。开始工作先记录 git status、HEAD、submodule 和 package version。默认直接在当前 main 开发。

```powershell
pnpm plugin:build images
pnpm plugin:pack images
pnpm plugins:typecheck
pnpm plugins:test
pnpm profiles:check
pnpm dsh:verify
```

只提升真正变化组件的独立版本。后续打包必须集成共享清单的全部最新插件，复用不变 tgz，变化时刷新离线闭包；不要直接继承旧 stage 或每次强制重编所有插件。正式 Windows 入口为 pnpm package:stable:win。本次文档与脚本维护不重打已发布的 8.3.0。

## 运行与扩展

插件、Skills、MCP 的发现与更新见 [扩展更新指南](extensions-update-guide.md)。Python 的签名后台依赖维护见 [Python 环境](python-environment.md)。演示生成见 [演示工作流](presentation-workflow.zh-CN.md)。

桌面升级与插件更新分别发布，均保留用户配置。公开上传必须获得用户授权；七牛公开校验后再同步 GitHub。完整命令、签名要求与验收标准以开发指导为准。
