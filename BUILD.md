# ZeroWall Science 4.3.4 构建与发布

4.3.4 集成科研图片查重工作台和对话入口，并扩展演示文稿产物工作台、持久化 artifacts 和质量状态。默认 Stable Windows x64 包为本地构建产物；本版本不自动上传七牛云，也不执行 Git 发布。

## 固定基线

- Node.js 24.9.0
- pnpm 11.7.0
- Electron 43.4.0
- DSH 0.1.1-rc.2，ZeroWall fork 当前基于上游提交 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`

首次拉取必须包含子模块，然后使用锁文件安装：

```powershell
git submodule update --init --recursive
pnpm install --frozen-lockfile
```

## 修改 DSH 源码

DSH 适配一律直接修改 `dsh/source` 源码，仓库不使用补丁文件。`dsh/source` 是指向 ZeroWall fork（`zerowall` remote，分支 `zerowall-rc2`）的 submodule，`pnpm dsh:verify` 要求工作区干净、HEAD 与锁文件一致、且仍派生自上游 rc2，因此修改必须先落成提交：

```bash
cd dsh/source
git add -A
git commit -m "..."
git push zerowall zerowall-rc2
git rev-parse HEAD
```

把新的 commit 写入 `dsh/lock/upstream.json` 的 `commit` 字段，再在父仓库 `git add dsh/source` 更新 gitlink，最后运行 `pnpm dsh:verify` 确认 pin 一致。`upstreamCommit` 与 `tag` 应与上游 release 一致。

## 本地验证

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm package:dir
```

`package:dir` 生成 Preview 的解包目录并执行真实 Host 启动、运行时闭包、Skills、许可证和回环 HTTP 检查。Windows 安装包使用 `pnpm package:win`；Stable 使用 `pnpm package:stable:win`。

完整验证覆盖 4.3 的 Node/Electron/DSH 构建图和默认 better-sidebar 工作台，不调用 Rust、Cargo、Tauri 或 Leptos 工具链。Agent 组合修改还需运行 `pnpm test:dsh:rc2`。

## macOS

macOS 构建只能在匹配架构的 runner 上执行：

```bash
pnpm package:mac:x64
pnpm package:mac:arm64
pnpm package:stable:mac:x64
pnpm package:stable:mac:arm64
```

签名使用 `CSC_LINK` 和 `CSC_KEY_PASSWORD`。当 `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID` 同时存在时启用公证。CI secrets 名称见 `.github/workflows/build-macos.yml`。

没有这些凭据时只允许进行未签名 smoke，不得宣称已完成签名、公证或真实 macOS 启动验收。

## 更新通道

- Preview: `https://zerowall.chengxunkeji.cn/preview/`
- Stable: `https://zerowall.chengxunkeji.cn/stable/`

Electron Builder 为各自通道生成独立更新元数据。发布前必须核对安装包 SHA-256、公开元数据、签名状态和安装/卸载/更新 smoke。仓库脚本不会自动上传或覆盖任何正式通道。

## 质量门槛

- Typert codec、科研库迁移、状态机、凭据脱敏和平台分支测试通过。
- DSH Agent/session、审批、Skills、MCP、子 Agent 和 Client slot 测试通过。
- Electron Renderer 保持 sandbox、context isolation、无 Node integration、仅允许当前回环 Host。
- 包内不存在 Rust 二进制、Tauri command、Leptos WASM UI 或 2.x 数据初始化路径。
- 安装包包含固定 DSH 版本、ZeroWall 首方插件、科研 Skills、品牌资源和许可证 notices。
