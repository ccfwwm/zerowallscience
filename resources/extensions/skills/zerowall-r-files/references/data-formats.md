# 数据与标识

Windows 路径不能作为远程 path。本地 local_path 必须在当前工作区内且为相对路径；远程 path 为项目相对路径。复用返回的 project_id、path，不猜绝对路径。

文件写入同步完成，没有远程 job_id；下载必须核对字节数及 SHA-256。

本地 workspace 相对路径用于 Host 传输；远端 project_id + path 用于服务端数据。共享 data: 引用仅由明确支持的模块接收。图像只有显式读取才嵌入；默认输出 Manifest。输入、方法、参数、代码、环境、随机种子和输出 SHA-256 共同组成复现证据。
