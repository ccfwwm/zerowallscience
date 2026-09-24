# ZeroWall Science 7.0.4 本地验证收据

日期：2026-09-24。发布范围：Windows x64 EXE，已按七牛云先、GitHub 后的顺序发布。

## 安装程序

- 文件：`desktop/dist/zerowall-science-7.0.4-win-x64.exe`
- 大小：469,632,269 字节（447.88 MiB）
- SHA-256：`7506cf946259b6d4d13f06390f59983f39fe79aec9e24b14ae7cc653b39547c3`
- 包装后安装目录：1,582.8 MiB，超过 1,500 MiB 提示值；按本地交付规则不阻断。
- `pnpm package:stable:win` 成功，使用 `electron-builder --publish never`；包装后桌面启动、Host 和设置语言切换验证通过。打包校验确认内置基础 Python 清单身份、归档长度和 SHA-256。

## Python 环境

- 空白隔离用户目录中，打包后的桌面应用自动安装内置 Python 3.12.10，安装期间观察到 `downloading`/`installing` 进度，最终状态为 `ready`。
- 实际目录为隔离配置下的 `userdata/Python/Lib/site-packages`；`userdata/Python` 是普通目录，不是 Junction。`current.json.runtimeRoot` 指向同一隔离用户目录。
- 通过打包后的 IPC 从中科大镜像解析 `docopt` 0.6.2 源码包，构建已校验 wheel，单包安装后实际包清单包含 `docopt`；`failedPackages` 为空，包数为 51。
- 再次预览 `docopt==0.6.2` 的变更数为 0。实测使用临时用户配置，未修改真实 `%APPDATA%` 中的现有 Python 环境。
- 打包 UI 实测详情：`.build/python-ui-7.0.4/packaged/verification.json`。

## 代码检查

- 桌面测试：146 通过，3 跳过；桌面 TypeScript 类型检查通过。
- 共享 Python 迁移、首次安装和旧状态恢复：32 项通过。
- 科研工作台文件导入、资产和查看器定向测试：17 项通过。
- 镜像、断流重试和依赖同步定向测试：15 项通过。
- `git diff --check` 通过。

## 七牛云公网验证

- 七牛云版本化安装包：[zerowall-science-7.0.4-win-x64.exe](https://zerowall.chengxunkeji.cn/stable/releases/7.0.4/zerowall-science-7.0.4-win-x64.exe)。
- Stable 更新入口已刷新为 7.0.4：`stable/latest.yml`、`stable/releases/latest.json` 和 `stable/releases-zerowallsciencedev/latest.json`。
- 六个公开对象均从公网完整读取并与本地产物匹配：安装包 469632269 字节，SHA-256 `7506cf946259b6d4d13f06390f59983f39fe79aec9e24b14ae7cc653b39547c3`；blockmap 489236 字节，SHA-256 `1f5de0d803bc42761b660057d43dfaa10b730bd803057d6dbeb7126aacb3e560`；版本 JSON 6485 字节，SHA-256 `a21d4f3b132517bee2a99000b07e29f7d1fadf47611c95630ebe126087b50edb`；`latest.yml` 6463 字节，SHA-256 `e0a548834ed32ab72cae7d3a34f4bafd340ce42ab32fd0d25de485e25845aa65`。
- 证据文件：`desktop/dist/verification-7.0.4/qiniu-public-assets.json`。

## GitHub 公网验证

- GitHub Release：[v7.0.4](https://github.com/ccfwwm/zerowallscience/releases/tag/v7.0.4)。Release 为正式、非草稿、非预发布，并标记为 Latest。
- 六个附件均为 `uploaded`；GitHub API 报告的大小和 SHA-256 与七牛云及本地一致。EXE 和 blockmap 已完整下载校验；四个 JSON/YAML 小文件通过带重试的独立公网下载校验。
- GitHub 附件大小和 SHA-256：EXE `469632269` / `7506cf946259b6d4d13f06390f59983f39fe79aec9e24b14ae7cc653b39547c3`；blockmap `489236` / `1f5de0d803bc42761b660057d43dfaa10b730bd803057d6dbeb7126aacb3e560`；版本 JSON `6485` / `a21d4f3b132517bee2a99000b07e29f7d1fadf47611c95630ebe126087b50edb`；`latest.yml` `6463` / `e0a548834ed32ab72cae7d3a34f4bafd340ce42ab32fd0d25de485e25845aa65`。
- 发布提交：`8d6d923e6f7e3a1b02b46815802adde711e336c4`；tag `v7.0.4` 指向同一发布提交。GitHub 远端分支最终仅保留 `main`。

基础运行时自动安装；科学依赖清单的后续同步仍由用户在 Python 环境页面启动。未对真实用户目录执行升级安装，首次迁移实测在隔离目录和 Junction 回归测试中完成。
