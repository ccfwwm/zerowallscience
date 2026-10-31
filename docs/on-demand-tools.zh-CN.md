# 按需工具加载合同（8.4.19）

## 问题与层次

`presentation_prepare` 内部直接调用 `ppt_create`，而 PPT 插件原先只在 `skill ppt-maker` 成功后注册整组工具；准备计划已经保存并不代表工具已经注册。另一个独立层次是超过 100 项工具后的会话可见性限制：工具可能已经全局注册，但尚未加入当前会话。两种状态都不能直接视为插件未安装。

## 调用顺序

1. 保留 DSH 原生调用身份、参数快照、权限决策、人工批准和单调 guard。
2. 进入 `tools/execute` 时，按精确名称查找已声明的本地提供方；已注册工具无需重复加载。
3. 同组并发加载共享一个 Promise，成功后验证请求的工具确实注册；失败清除 pending，后续调用可以重试。只准备工具，不重试工具正文，避免重复写文件或重复计费。
4. 只解除 ZeroWall 自身针对该工具的会话可见性过滤，不解除其他插件、子代理或安全策略的限制。
5. 使用原调用继续一次原生 dispatch；实际权限拒绝、取消、参数错误和工具正文错误仍由原生管道处理。

查询 `capability_search` 只读索引，不触发加载。显式 `enable` 才注册并暴露真实 schema。对已知工具的内部首次调用也会自动准备，调用方不必伪造 Skill 执行记录。完全未知、未安装或已卸载的提供方不会触发磁盘扫描、联网下载或 MCP 自动连接。

## 提供方与生命周期

`zerowallToolAccess.registerLoader({ id, names, description, load })` 是本地扩展入口，必须通过调用插件自己的 Cordis effect 持有并释放返回的注销函数。名字必须精确列举，拒绝通配符及重复归属；`load` 只注册本插件工具，不执行用户工作。

PPT 适配器使用可选 `dshPptMakerTools.ensureRegistered()` 服务；服务缺席不会阻塞 base 插件启动，服务卸载会同步移除声明。当前精确支持 `ppt_create`、`ppt_themes`、`ppt_edit`、`ppt_undo`、`ppt_redo`、`ppt_render`、`ppt_export`、`ppt_check`、`ppt_import`、`ppt_open`、`ppt_patch`。PPT 本身也在 `presentation_prepare` 自动创建工程前显式确保整组注册，独立图片工作流不依赖全局适配器先后顺序。

取消一个调用只终止该调用的等待与执行，不取消其他调用共享的注册；共享任务仍被收敛处理，不产生未处理的拒绝。会话销毁和 base 卸载都会释放自身可见性限制。

## 验收

- 真正的 ToolRuntime 首次缺失工具调用成功，只执行一次正文；查询发现不加载，显式启用后再执行。
- 并发注册合并、失败后重试、不完整注册、完全未知名称、提供方注销和冲突校验。
- 原生 ask 批准后才加载；deny 和 guard 拒绝不加载，其他独立 restrict 仍阻止正文。
- 超过 100 项工具的真实 agent scope：恢复已注册工具和迟注册工具的当前会话可见性，不暴露无关工具。
- `presentation_prepare` 未先调用 Skill 时，也先注册 PPT 工具，再自动创建并绑定工程。
