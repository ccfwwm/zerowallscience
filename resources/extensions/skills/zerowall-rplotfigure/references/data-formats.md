# 数据与标识

input_refs 引用现有文件及 SHA-256，不能放 content/base64。模板自带 demo 可省 input_refs；选择 template_id 时先查看模块具体输入。

plan_id 表示已保存计划，不表示绘图完成；figureya.generate.report 当前只创建报告计划，也须运行。run.plan 返回 run_id 后工作流跟踪到 Manifest。

本地 workspace 相对路径用于 Host 传输；远端 project_id + path 用于服务端数据。共享 data: 引用仅由明确支持的模块接收。图像只有显式读取才嵌入；默认输出 Manifest。输入、方法、参数、代码、环境、随机种子和输出 SHA-256 共同组成复现证据。
