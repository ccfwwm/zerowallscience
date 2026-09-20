# 数据与标识

必须选择与研究指标匹配的权重，并记录 PSU=SDMVPSU、strata=SDMVSTRA；多周期权重调整、缺失值与纳排条件需写入分析计划。

ensure.available 可启动下载，虽无 confirm 也不是 query。datasets.ensure_available=true 同样可能写缓存；此类分析使用 run。

本地 workspace 相对路径用于 Host 传输；远端 project_id + path 用于服务端数据。共享 data: 引用仅由明确支持的模块接收。图像只有显式读取才嵌入；默认输出 Manifest。输入、方法、参数、代码、环境、随机种子和输出 SHA-256 共同组成复现证据。
