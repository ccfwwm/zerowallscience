---
kind: upgrade-guide
description: "ZeroWall Science 9.1 增加可独立更新并在重启时激活的 Host Runtime。"
---

# ZeroWall Science Host Runtime

[English](guide.md) | 中文

## 变更

ZeroWall Science 9.1 将固定 Bootstrap 放在 Desktop 安装包中，也可以从 `$DSH_HOME/zerowall/host-runtimes/` 运行签名 Host Runtime。业务插件更新与 Host Runtime 更新仍是独立候选代，但都只在检查任务并安全重启后激活。Bootstrap 在启动 Host 前校验兼容性和载荷完整性；启动失败会恢复上一代并保留失败记录。

## 迁移

只需安装一次 9.1.2 Desktop。8.x 或 9.0 安装在升级完成前继续使用内置 Host。不要直接修改运行时代际目录。需要检查候选代时，读取 Host Runtime 目录中的 `host-runtime.json` 和 `state.json`。成功重启后，Desktop Host ready 握手会报告当前运行时。DSH 核心与 Bootstrap 由 Desktop 持有；Host 更新必须匹配其 DSH 版本、协议、ABI 和已安装的依赖版本。校验或启动失败时，同一次启动会自动恢复两个原始代际。激活与提交决定可在中断后恢复，诊断记录保留。
