# ZeroWall Science 7.0.5 发布说明

7.0.5 延续 7.0.0 以来的科研与桌面能力，重点将科研工作台收敛为卡片入口和查看流程，并修复模型协议与模型同步入口。本版提供 Windows x64 安装包。

## 7.0.0 至 7.0.3

- 建立研究概览、项目资产、方案与证据记录、报告和科研工具工作区，支持任务与产物溯源、研究门禁及会话恢复。
- 接入 ImageJ/Fiji、HE、细胞、流式、序列、Sanger、分子结构、科研画布和 BrainGlobe。保留各方向的独立计算、分析与导出 Host 能力。
- 增加 Fiji 实验工作流、OME 图像轴与 ROI、HE 金字塔瓦片、FCS 门控、AnnData 预览、序列模拟及分子三维查看。
- 共享 Python 环境为 MCP、科研工具和 Agent 提供运行时；增加依赖清单、源码构建、健康检测与证书路径处理。

## 7.0.4 稳定环境与文件导入

- 首次启动自动安装并校验基础 Python，安装进度可见；稳定目录为 `%APPDATA%\zerowall-science\Python`，依赖直接安装到 `Lib\site-packages`。
- 修复清单身份错误、安装后重复检测与未提示安装结果；安装状态区分成功、部分成功、失败和无需安装。
- Python 默认镜像改为中科大，提供镜像下拉；阿里云等镜像断流时清理损坏下载、退避重试并复核长度和 SHA-256。
- 科研工作台可选择项目外文件，复制到 `.zerowall/imports/`，校验大小和 SHA-256、登记资产，并自动打开对应查看器。

## 7.0.5 查看工作台与模型

- 工作台首页改为九张带主题图片的工具卡片；图片由 `gpt-image-generator` 生成，打包时内联到科研插件。
- 默认工具页只保留文件选择、当前资产、状态和查看所需控件。ImageJ 与 HE 采用只读查看器，自动执行 `image_open` / `he_open` 并显示实际加载状态。流式、细胞、序列、Sanger、分子、脑图谱和画布入口收起实验与导出表单。
- 九个科研方向对应独立 skill；分析请求必须带与工具匹配的 `skillId` 和 `actionId`，路由器校验资产/视图与动作范围。旧 Host 分析能力保留。
- 科研引擎设置显示软件稳定 Python 的实际路径。napari 自动检索同一环境 `Lib\site-packages\bin\napari.exe`，BrainGlobe 与 HE 使用共享解释器；HE StarDist 探测 Python 依赖、2D/3D 命令入口及冻结模型权重。HE 分割通过 StarDist2D Python API 执行，Fiji/ImageJ 保持独立图像引擎。
- 科研工作台启动时停留在九卡片首页；进入脑图谱页面也不会自动启动 BrainGlobe 或读取首张切片。点击“打开脑图谱”和“读取切片”后才分别执行对应动作。远程 R 设置显示 RMCP 默认端点，由 MCP 连接器负责连接检查。
- Anthropic/Claude 请求不再发送不支持的 `thinking.type.disabled`。OpenAI 系列优先使用 `/v1/responses`，仅在接口确实不支持时回退 `/v1/chat/completions`；模型检测与同步后刷新共享目录，设置页和对话入口可触发同步。

## 使用限制

- Fiji、napari、OpenSlide、BrainGlobe 等外部或托管引擎须满足各自环境条件；HE StarDist 还需要经校验的 H&E 模型权重。进程启动不等于 GUI 已确认。
- 查看器显示不代表分析完成。定量结果、科学复核和人工认可分别以 Run、Artifact、来源哈希与校验和为准。
- 7.0.5 的 Windows x64 安装包同时提供七牛云稳定更新通道和 GitHub Release 下载。
