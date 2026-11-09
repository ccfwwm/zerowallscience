# 场景与失败恢复

公共表达数据发现和现有 R 分析优先本模块。需要 OmicVerse 方法时先确认完整下载，再传共享数据引用。

真实计算前核对物种、基因 ID、raw counts、样本分组、生物学重复与批次。排除 .partial/.aria2。dry_run 只估算下载，不能当成数据已就绪。

下载使用 confirm_large 而非 confirm；GEO 返回 job_id，但状态接口参数名是 download_job_id。工作流按目录映射，不能调用普通 R job 查询。

1. 从 examples.json 的 describe/query 开始，确认服务已连接和所需文件存在。
2. 为实际分析填写真实输入；run 的 request_id 对同一提交固定。
3. 查询本地 run_id，等待终态；失败读取返回的远程类型及该类型日志接口，禁止把 download_job_id 交给普通 R jobs。
4. 将 Manifest 中 project_id/path 传给 Host r_files download_workspace；本地路径在当前工作区内。核对大小和 SHA-256。

失败示例：把 operation 写为 not.registered 会被拒绝，不创建远程任务；回 describe 获取精确 ID。缺输入时先检查当前项目目录，不扩大上传范围。超时不代表远端失败，先查询历史。
