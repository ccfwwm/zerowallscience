# 数据与标识

动态 ID 为 biomni.tool.* 或 biomni.bridge.*。search 找精确 ID，describe 读取嵌套 tool_arguments schema，再 run。工具缺依赖时报告 missing_dependencies，不把注册当成功。

provider/model/endpoint/API 类型和凭据由 Host 提供，模型不得填写密钥。仅明确的 LLM 操作需要模型路线。下载 ID、计算 job_id、session_id 不能混用。

本地 workspace 相对路径用于 Host 传输；远端 project_id + path 用于服务端数据。共享 data: 引用仅由明确支持的模块接收。图像只有显式读取才嵌入；默认输出 Manifest。输入、方法、参数、代码、环境、随机种子和输出 SHA-256 共同组成复现证据。
