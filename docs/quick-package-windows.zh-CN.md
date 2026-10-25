# Windows 稳定版一键更新与打包

## 操作

先在 `config/build/desktop-release.json` 设置新的桌面版本，并创建对应的 `docs/release-notes-<version>.md`。插件、Skills、MCP 和 Python 资源按各自版本合同更新，不要为了桌面版本统一提升它们。

在仓库根目录用 PowerShell 执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-stable-win.ps1
```

脚本会同步桌面版本，生成插件 workspace 和稳定 profile，检查版本、profile 与 DSH pin，再调用固定 Stable Windows 打包入口。正式安装器、blockmap、`latest.yml` 和 artifact manifest 都写到：

```text
artifacts/packages/<version>/windows-x64/
```

例如 `8.4.8` 对应 `artifacts/packages/8.4.8/windows-x64/`。`win-unpacked/` 是该目标目录内的验收展开树，不是第二个正式包目录。脚本结束时会打印安装器路径、build ID、大小和 SHA-256。

## 路径与覆盖

路径由 `tools/build/paths.cjs` 统一解析。快速脚本会核对输出仍是仓库内的 `artifacts/packages/<version>/windows-x64`；自定义 `ZEROWALL_ARTIFACT_ROOT` 或 `ZEROWALL_PACKAGE_OUTPUT` 若改变了目标路径，脚本会停止并提示检查环境变量。

同版本安装器已存在时脚本停止，不会覆盖七牛或本地稳定产物。下次打包先在 `config/build/desktop-release.json` 使用新的版本号并准备新发布说明。不要通过删除旧产物或设置覆盖变量复用已发布版本。

该脚本只更新并打包本地稳定版，不会上传七牛云、推送 GitHub、创建 tag 或 GitHub Release。发布仍使用 [稳定版打包与发布合同](packaging-stable.zh-CN.md)，并需单独得到明确授权。
