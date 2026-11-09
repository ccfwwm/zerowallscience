# 场景与失败恢复

单细胞和空间转录组优先本模块。NHANES 调查统计仍由 R 执行；通用生物数据库工具优先 Biomni；绘图模板优先 FigureYa。

独立 rdatalinux CPU 环境，当前没有 NVIDIA GPU。公开 API 候选不等于可执行工具。availability/verification 显示缺 GPU、模型、依赖、未验证或上游禁用时据实解释。

原生工具共享同一 project_id + session_id；修改串行执行，AnnData 关键步骤持久化。会话关闭/重启后类实例必须重建，H5AD 通过 restore 恢复；不能跨会话复用句柄。

1. 从 examples.json 的 describe/query 开始，确认服务已连接和所需文件存在。
2. 为实际分析填写真实输入；run 的 request_id 对同一提交固定。
3. 查询本地 run_id，等待终态；失败读取返回的远程类型及该类型日志接口，禁止把 download_job_id 交给普通 R jobs。
4. 将 Manifest 中 project_id/path 传给 Host r_files download_workspace；本地路径在当前工作区内。核对大小和 SHA-256。

## 检查点恢复

原生读取操作是 `omicverse.native.ov.utils.read`，tool_arguments 为 `{"path":"data:OmicVerse/pbmc3k_raw.h5ad"}`。执行返回 adata 句柄和不可变作业检查点。重启后描述 `omicverse.native.ov.restore_adata`，在新的 session_id 中传 `{"path":"<Manifest 中的项目相对 H5AD 路径>"}`。复用新返回的句柄，禁止把旧类实例继续传入。

同时最多两个计算进程组，空闲原生会话也占一个。`SESSION_LIMIT` 时先确认没有运行任务，再以 `omicverse.close.session` 关闭不再使用的会话；检查点保留，类句柄失效。每组 CPU 8 核、内存 24 GiB，超限失败需减少输入或分步计算，不能声称服务可自动使用 GPU。

`QC_EMPTY` 时核对 min_genes 与线粒体比例阈值及输入物种；原始 counts 不得被已归一化矩阵替换。`INCOMPLETE_INPUT` 先完成下载。上游 DCT/LDA 禁用入口保持禁用状态，Python 候选目录不代表已通过运行测试。

Agent 遇到明确的 thinking/tool_choice 不兼容时，适配器将 required 调整为 auto 后由同一模型执行；不会改变 provider、model 或 endpoint。401、配额、模型不存在均原样失败，不用其他模型替代。只有执行产物存在并通过 Manifest 校验后报告完成。
