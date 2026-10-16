# ZeroWall 归档管理插件

来源：MichengAI/dsh-archive-manager，Apache-2.0；上游 commit 与版本锁定于根仓库 config/integrations/upstream-sources.json。

ZeroWall 独立版本：1.0.17-zws.1。兼容桌面 8.1.3 及以上、DSH 0.2.0-rc.2。通过「设置 → 扩展中心 → 插件」安装，安装和启停后由资源管理器健康检查并重启 Host；失败自动恢复旧 profile。安装后在「设置 → 归档会话」管理归档、恢复、收藏与诊断。

归档可以恢复；永久删除需要明确确认，不能通过插件版本回滚恢复已删除的会话。首次安装不自动整理、修复或删除会话。

适配仅将上游 npm 更新入口替换为扩展中心入口，保留上游会话行为。Host 和 Client 从 src 生成到 artifacts/dev；源码 lib 仅为兼容链接。上游独立更新器不进入发布包。

构建：pnpm package:build dsh-archive-manager。打包：pnpm plugin:pack dsh-archive-manager。
