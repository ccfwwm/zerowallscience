# @zerowall/dsh-plugin-mineru

[English](README.md) | 中文

为 ZeroWallScience 提供 MinerU 文档解析，运行基线为 DSH 0.2.2-rc.1 和 Node.js 24.9 或更新版本。包提供 `mineru_activate`、`mineru_parse`、`mineru_batch_parse` 和 `mineru_task`。在环境设置或本插件的配置页设置 API 地址、解析模式和令牌。插件使用 Host 凭据存储，并在读取 `MINERU_API_TOKEN` 前等待官方环境初始化完成。

输入可以是 HTTP(S) 文档 URL、当前会话工作区内的文件，或通过当前会话用户消息和 SHA-256 摘要验证的原生文件附件。工作区外的本地路径需要通过已授权的会话附件提供。路径从所选工作区或 `DSH_HOME` 解析，不依赖以前的安装目录。

任务记录以及带校验和的 Markdown、规范化内容列表和图片产物写入会话工作区配置的产物目录。没有工作区的会话将产物保存到 `DSH_HOME` 或标准 DSH 用户目录下。中断的上传和解析通过 `mineru_task` 使用原任务 ID 恢复，不会重复提交文档。服务停用时先取消并等待正在执行的解析，再释放状态。

此包不安装 Python 环境或独立 MinerU Skill。缺少令牌时会明确报错，设置页提供不提交文档的连接测试。

开发检查：`node ../../scripts/build-plugin.mjs`、`node node_modules/vitest/vitest.mjs run` 和 `node node_modules/typescript/bin/tsc -p tsconfig.build.json --noEmit`。
