# 6.0.6 本地验证记录

- 修改前基线：`a239dd39`（工作区原本干净，创建空检查点提交）。
- DSH 固定提交：`4a842786a3c62c1b3fcae5bef7f2d46c1f44e244`，子模块未改动。
- Zotero：官方 npm `dsh-zotero@0.8.4`；安装包中的命令注册通过 `tools/packaging/adapt-zotero.mjs` 适配当前 DSH API。
- Fylar Office Editor：按用户要求撤销。Desktop 依赖、profile、锁文件及最终 ASAR 均不包含它；现有 HuanLin Office 预览保留。

## 验证

- `pnpm dsh:verify`、`pnpm profiles:check`、`pnpm typecheck`：通过。
- `pnpm test`：通过。修正两项已有附件复制测试的过期预期，验证真实文件复制与失败回调，未修改附件实现。
- `pnpm --filter dsh-progressive-tools test`：46 项通过。
- `node --test tests/contracts/*.test.mjs`：最终 22 项通过，包括 Zotero 命令兼容行为、完整入口和 profile 挂载。
- `node tools/integration/smoke-zotero.mjs`：生产运行时注册 8 个 Zotero 工具；启动请求数为 0；隔离本地模拟 API 的连接和搜索成功。
- 应用构建、运行时整理、Windows NSIS 打包：通过。首次打包检测到 Zotero 新命令 ID 接口与固定 DSH 不兼容，适配后重新打包。
- `node desktop/scripts/verify-packaged-runtime.mjs`：通过。检查 ASAR、依赖导入、本地组件、Host 启动、插件启用、Zotero 状态 RPC、桌面启动，以及设置页实际显示默认本地 API 地址。
- `node tools/release/smoke-update.mjs`：本地升级元数据通过。
- `git diff --check`：通过。

没有连接用户真实 Zotero 文献库验证检索结果；检索使用隔离模拟 API，实际 Host RPC 和设置页来自打包程序。未推送、上传或创建远程发布。

## 产物

- 路径：`desktop/dist/zerowall-science-6.0.6-win-x64.exe`
- 大小：286,413,499 字节
- SHA-256：`d5bad4fa75ae2f3383db46dd9c919719a5e3f25323b3b14b4b8f68e717dfbc02`
- 最终安装程序使用已经通过完整启动验证的 `desktop/dist/win-unpacked` 目录重新生成。
