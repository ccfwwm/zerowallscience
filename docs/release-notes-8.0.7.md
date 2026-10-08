# ZeroWall Science 8.0.7

8.0.7 是兼容迁移版本，保持 DSH `0.2.0-rc.2` 和 8.0.6 用户 profile 状态。

- 增加 packages/resources 的逻辑布局 manifest 和旧路径只读兼容解析。
- 增加 Core Bundle 组合声明；科研插件、Skills、MCP 和 Python generation 保持独立版本合同。
- 增加按输入指纹运行的增量构建图、构建收据和共享输出锁。
- 增加单插件、单 Skill、单 MCP、单 Python 层入口。
- 增加受保护 allowlist 的 artifacts GC dry-run/apply 和 SHA-256 内容对象存储。
- 启动及每日资源检查只读并提示；安装、更新、重启和回滚仍需用户操作。

8.0.7 独立资源目录已发布并通过稳定目录验证：27 个插件、281 个 Skills、2 个 MCP 资源和 1 个 Python 清单。Windows x64 安装器、blockmap、metadata 和 Stable 更新指针已发布至七牛，公网下载的大小与 SHA-256 均通过校验。GitHub Release 已公开：[v8.0.7](https://github.com/ccfwwm/zerowallscience/releases/tag/v8.0.7)，四项资产均已下载复核，字节数和 SHA-256 与本地产物一致。安装器 SHA-256：`78b1bcb9613ac8b5f2eaf349c13c59ceac575b425587c7d2b0f94ab2370302f7`。

8.0.7 Core runtime closure 已按 Core profile 构建并通过启动冒烟。物理源目录删除仍需等所有生成器和消费者验证完成；8.0.6 用户的旧 profile 与内置插件在迁移时保留，不会由 Core 默认值覆盖。
