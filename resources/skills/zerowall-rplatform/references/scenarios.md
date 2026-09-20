# 场景与失败恢复

用 R 处理统计、调查权重和现有 RDS 数据。单细胞原生 Python/AnnData 流程转 OmicVerse；现成绘图模板转 FigureYa。

R 脚本产物写到 `Sys.getenv("R_PLATFORM_RESULT_DIR")`；输入使用项目相对路径。保存 sessionInfo、随机种子和代码。包缺失先查询 zerowall-r-packages，不在脚本里自动安装。

R 作业的 job_id 与本地 run_id 不同；普通跟踪始终传本地 run_id。

1. 从 examples.json 的 describe/query 开始，确认服务已连接和所需文件存在。
2. 为实际分析填写真实输入；run 的 request_id 对同一提交固定。
3. 查询本地 run_id，等待终态；失败读取返回的远程类型及该类型日志接口，禁止把 download_job_id 交给普通 R jobs。
4. 将 Manifest 中 project_id/path 传给 Host r_files download_workspace；本地路径在当前工作区内。核对大小和 SHA-256。

当脚本返回 `object not found`，读取 `r.get.job.log` 的 stderr，检查变量来自哪个输入步骤；不要把上一作业的 R 内存视为仍然存在。每个 R 作业是独立进程。`there is no package called` 先查询包状态。退出码为 0 但 Manifest 无文件时，检查代码是否写入 RESULT_DIR，不能凭 stdout 宣称图表已生成。

R Manifest 的 `path` 是结果目录相对路径。例如 `result.csv` 对应 `.zerowall/jobs/<remote_id>/result/result.csv`；工作流的 `artifacts[].uri` 已转换为完整项目引用，优先复用它。上传数据使用 Host r_files；不要给服务器传 Windows 绝对路径。
