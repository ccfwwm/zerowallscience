# 场景与失败恢复

明确生物能力优先检索精确工具；开放式复杂任务可用 Agent。AnnData 专项方法选择 OmicVerse；本地数据轻量计算或数据库查询见 zerowall-bio。

动态 ID 为 biomni.tool.* 或 biomni.bridge.*。search 找精确 ID，describe 读取嵌套 tool_arguments schema，再 run。工具缺依赖时报告 missing_dependencies，不把注册当成功。

provider/model/endpoint/API 类型和凭据由 Host 提供，模型不得填写密钥。仅明确的 LLM 操作需要模型路线。下载 ID、计算 job_id、session_id 不能混用。

1. 从 examples.json 的 describe/query 开始，确认服务已连接和所需文件存在。
2. 为实际分析填写真实输入；run 的 request_id 对同一提交固定。
3. 查询本地 run_id，等待终态；失败读取返回的远程类型及该类型日志接口，禁止把 download_job_id 交给普通 R jobs。
4. 将 Manifest 中 project_id/path 传给 Host r_files download_workspace；本地路径在当前工作区内。核对大小和 SHA-256。

动态工具完整示例：search `find_n_glycosylation_motifs`，describe 返回的 `biomni.tool.glycoengineering.find_n_glycosylation_motifs`，run 的业务参数为 `{"project_id":"rmcp-demo","tool_arguments":{"sequence":"NATNPSNVT"},"confirm":true}`。用独立 request_id 提交，再检查本地 run_id 的终态及 result；这是短测试序列的计算演示。

`missing_dependencies` 时先看工具的依赖条目，不重复提交；数据库请求返回空集时区分网络失败与真实无匹配。Agent 的鉴权错误先检查当前模型连接，不能在提示词补密钥或换模型。Python 写文件到任务输出目录，模型仅返回文本而无产物时不声称已生成报告。
