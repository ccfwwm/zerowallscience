# 数据与标识

R 脚本输出使用项目相对路径；保存 sessionInfo、随机种子和代码。包缺失先查询 zerowall-r-packages，不在脚本里自动安装。

R 作业的 job_id 与本地 run_id 不同；普通跟踪始终传本地 run_id。

本地 workspace 相对路径用于 Host 传输；远端 project_id + path 用于服务端数据。共享 data: 引用仅由明确支持的模块接收。图像只有显式读取才嵌入；默认输出 Manifest。输入、方法、参数、代码、环境、随机种子和输出 SHA-256 共同组成复现证据。
