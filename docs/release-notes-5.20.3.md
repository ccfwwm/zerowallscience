# ZeroWall Science 5.20.3

本版本同步发布 FigureYa 完整模块下载与 MCP 上下文优化：

- FigureYa 普通源码分片仅返回清单和校验元数据，避免大段 base64 进入模型上下文，显著降低 token 消耗。
- ZeroWall 受信任的本地下载通道按需获取 PNG、HTML、README、R/Rmd、CSV、JSON 等完整模块文件，并执行 SHA-256、分片、路径穿越与原子写入保护。
- MCP 生产网关已同步最新构建，compact 工具面保持 21 个聚合入口；动态能力继续通过 capability search/execute 按需发现。
- 修复 FigureYa 资源返回与本地下载链路，保持现有项目和历史数据不变。
