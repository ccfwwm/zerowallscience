# 数据与标识

真实计算前核对物种、基因 ID、raw counts、样本分组、生物学重复与批次。排除 .partial/.aria2。dry_run 只估算下载，不能当成数据已就绪。

下载使用 confirm_large 而非 confirm；GEO 返回 job_id，但状态接口参数名是 download_job_id。工作流按目录映射，不能调用普通 R job 查询。

本地 workspace 相对路径用于 Host 传输；远端 project_id + path 用于服务端数据。共享 data: 引用仅由明确支持的模块接收。图像只有显式读取才嵌入；默认输出 Manifest。输入、方法、参数、代码、环境、随机种子和输出 SHA-256 共同组成复现证据。
