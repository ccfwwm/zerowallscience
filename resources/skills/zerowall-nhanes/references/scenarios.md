# 场景与失败恢复

调查统计保留 R survey 链路。跨模块共享结果表，不把普通无权回归当成 NHANES 复杂抽样结果。

必须选择与研究指标匹配的权重，并记录 PSU=SDMVPSU、strata=SDMVSTRA；多周期权重调整、缺失值与纳排条件需写入分析计划。

ensure.available 可启动下载，虽无 confirm 也不是 query。datasets.ensure_available=true 同样可能写缓存；此类分析使用 run。

1. 从 examples.json 的 describe/query 开始，确认服务已连接和所需文件存在。
2. 为实际分析填写真实输入；run 的 request_id 对同一提交固定。
3. 查询本地 run_id，等待终态；失败读取返回的远程类型及该类型日志接口，禁止把 download_job_id 交给普通 R jobs。
4. 将 Manifest 中 project_id/path 传给 Host r_files download_workspace；本地路径在当前工作区内。核对大小和 SHA-256。

主 Skill 的真实年龄汇总示例使用 DEMO_J、RIDAGEYR、WTINT2YR、SDMVSTRA 和 SDMVPSU。2026-09-21 生产验收返回 9,254 行、均值 38.424、标准误 0.5244；这是该缓存数据和设置的调用验收结果，不替代具体研究的纳排分析。同步返回的统计表直接在 result 中，无须等待远程 job_id。

XPT 读取失败先查看数据完整性、下载终态与 codebook，不能把 HTML 错误页当作 XPT。缺失权重或孤立 PSU 时记录设计问题；改变调查设计前明确分析依据。按 SEQN 合并前检查一对一关系，跨周期不得直接重复使用原始两年权重。高级计划执行必须跟踪新返回的本地 run_id，plan_id 只表示计划已保存。
