# 数据与标识

独立 rdatalinux CPU 环境，当前没有 NVIDIA GPU。公开 API 候选不等于可执行工具。availability/verification 显示缺 GPU、模型、依赖、未验证或上游禁用时据实解释。

原生工具共享同一 project_id + session_id；修改串行执行，AnnData 关键步骤持久化。会话关闭/重启后类实例必须重建，H5AD 通过 restore 恢复；不能跨会话复用句柄。

本地 workspace 相对路径用于 Host 传输；远端 project_id + path 用于服务端数据。共享 data: 引用仅由明确支持的模块接收。图像只有显式读取才嵌入；默认输出 Manifest。输入、方法、参数、代码、环境、随机种子和输出 SHA-256 共同组成复现证据。
