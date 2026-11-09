# 场景与失败恢复

有已安装模板时先选模板；自定义绘图按验证后的计划执行。普通统计准备可用 R；不要重复从 GitHub 下载服务器已有模板源。

input_refs 引用现有文件及 SHA-256，不能放 content/base64。模板自带 demo 可省 input_refs；选择 template_id 时先查看模块具体输入。

plan_id 表示已保存计划，不表示绘图完成；figureya.generate.report 当前只创建报告计划，也须运行。run.plan 返回 run_id 后工作流跟踪到 Manifest。

1. 从 examples.json 的 describe/query 开始，确认服务已连接和所需文件存在。
2. 为实际分析填写真实输入；run 的 request_id 对同一提交固定。
3. 查询本地 run_id，等待终态；失败读取返回的远程类型及该类型日志接口，禁止把 download_job_id 交给普通 R jobs。
4. 将 Manifest 中 project_id/path 传给 Host r_files download_workspace；本地路径在当前工作区内。核对大小和 SHA-256。

创建 custom_r 计划后，从 `result.plan_id` 取计划 ID，提交 `figureya.run.plan`，跟踪新返回的本地 run_id。实际远程 run_id 与底层 R job_id 均保留在结果中，不能混用。优先使用工作流转换后的 artifacts URI 下载；原始 Manifest 中 `project_artifact_path` 是项目路径，而普通 `path` 可能相对 R 作业结果目录。

输入引用校验失败时先检查 project_id、path、SHA-256，禁止把 CSV 内容塞进 input_refs。模板找不到时重新搜索目录，使用返回的 module/template ID；服务器已有模板应通过 Host `download_figureya_module` 获取源码和示例。R 包缺失时查询依赖清单。执行成功但缺 PNG 时检查输出文件名和报告状态，不能以 plan_id 作为图片成果。
