# ZeroWall Science 6.6.0 打包与发布验证

日期：2026-09-20。平台：Windows x64。基于当前工作区完整重新构建，包含账户注册、验证码反馈和邮箱密码重置流程的修改。

## 安装包

- 路径：`desktop/dist/zerowall-science-6.6.0-win-x64.exe`
- 大小：334220617 字节。
- SHA-256：`1cca93223ba8e6d87105c69739b0bf822dba06bb69b6ddf1524cc05365ab1695`。
- 产品、桌面端及包内 20 个第一方插件版本均为 6.6.0。
- ASAR 内账户和基础插件的 Host、Client 构建文件与当前源码构建结果逐一匹配 SHA-256。
- 三份更新 JSON 元数据中的版本、安装包大小及 SHA-256 与实际安装包一致。

## 已完成验证

- 账户与基础插件测试：8 个文件，59 项通过，1 项跳过。
- 账户 Client、Host 严格 TypeScript 检查通过。
- 运行时合同测试：16 项通过。
- `profiles:check`、DSH 固定版本及干净工作区检查通过。
- `pnpm package:stable:win` 完成全部构建、NSIS 打包、Desktop 启动检查和更新元数据生成。
- 最终包的 Host 启动检查通过；Desktop 设置版本显示为 6.6.0，中英文切换通过。
- 最终包 Electron 桌面回归：13 项全部通过，耗时 87.66 秒。涵盖环境配置、账户、剪贴板、侧栏、模型、插件、Skills、MCP 等现有回归场景。
- 新增验证：390 像素宽度下账户表单无内容溢出，密码重置弹窗可打开；设置内 AI 云平台显示同一密码重置流程。两个入口的截图已检查。
- `release:verify-local` 通过。

## 验证边界与证据

打包验证完成后，按用户后续指令发布七牛云和 GitHub。未替换用户当前安装的应用。运行验证使用隔离用户目录中的打包版；本次未执行安装器安装或升级测试，也未发送真实验证码邮件、创建真实账户或执行真实密码重置。

证据目录：`desktop/dist/verification-6.6.0/`，包含 `package-audit.json`、账户密码重置移动端和设置页截图，以及桌面回归截图。构建及测试日志保存在 `.tmp/package-6.6.0.log`、`.tmp/host-6.6.0.log`、`.tmp/e2e-6.6.0.log`、`.tmp/tests-account-6.6.0.log` 和 `.tmp/contracts-6.6.0.log`。

## 公开发布结果（2026-09-20）

- 发布代码提交：`0a121d66084147ae5fb5e48b24367634f4fb73da`；注释标签：`v6.6.0`。
- 按七牛云、GitHub 顺序发布。七牛云三个 Stable 更新入口均已更新为 6.6.0；`release:verify:stable` 通过。
- 七牛云六个公开文件完整回读，大小与 SHA-256 全部匹配本地文件。
- GitHub Release：https://github.com/ccfwwm/zerowallscience/releases/tag/v6.6.0 ，正式发布，非草稿、非预发布，标记为 Latest，共六项资产。
- GitHub API 返回的六项资产大小与 SHA-256 全部匹配。使用已有验证主机 `hklinux` 独立完整读取六个公开文件，流式计算 SHA-256，同样全部匹配；未在验证主机持久保存安装包。
- `origin/main` 已推送，远端分支仅保留 `main`。
- 公开核对证据：`desktop/dist/verification-6.6.0/qiniu-public-assets.json`、`github-api-assets.json`、`github-public-assets.json`。

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| zerowall-science-6.6.0-win-x64.exe | 334220617 | 1cca93223ba8e6d87105c69739b0bf822dba06bb69b6ddf1524cc05365ab1695 |
| zerowall-science-6.6.0-win-x64.exe.blockmap | 346432 | 9773209e7764380457a320661ac11df5c97ab1bf977822139676eff830b6f704 |
| zerowall-science-6.6.0-latest.json | 1183 | b7087b870ba65b5ee3fbb24d4bcc381ee4abdd98ecad0827d1271da63c2d7dfd |
| latest.yml | 1116 | c8e8bb95280f8610a83279d72f9c08faf2801d1c6bfb7cffa536f10b897481ec |
| releases-latest.json | 1183 | b7087b870ba65b5ee3fbb24d4bcc381ee4abdd98ecad0827d1271da63c2d7dfd |
| releases-zerowallsciencedev-latest.json | 1183 | b7087b870ba65b5ee3fbb24d4bcc381ee4abdd98ecad0827d1271da63c2d7dfd |
