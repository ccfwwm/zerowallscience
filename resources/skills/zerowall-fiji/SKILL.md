---
name: zerowall-fiji
description: 在 ZeroWall 查看图像、管理 ROI 修订并通过本机 Fiji 编辑和回传单页 ROI；五类实验分析需各自经过验证的 Runner。
---

# Fiji 图像工作台

发现 `science_viewer` 后调用真实工具，不通过任意 shell 拼接图像路径。不覆盖现有 Fiji、Java、插件或宏。


1. `science_viewer({"action":"list"})` 列出当前会话项目资产。普通查看无需研究或冻结门禁；远程资产先走现有 `r_files` 链路。
2. `science_viewer({"action":"launch_native","engine":"fiji","asset_id":"实际返回的资产ID"})` 打开本机项目内 TIFF/PNG/JPEG/BMP。省略 `asset_id` 启动空白窗口。
3. `science_viewer({"action":"native_status"})` 检查本项目启动记录。`spawned` 只证明进程已创建；`guiReady: unverified` 不能解释成 GUI 已通过验收。`failed` 保留错误；`unobserved` 表示 Host 不再跟踪，不能凭历史 PID 自动杀进程或重启任务。
4. 核对原生窗口中的图像和比例尺；普通原生打开不建立标注回传会话。需要版本化 ROI 往返时使用下述接口。

## 内置图像与 ROI 往返

- `image_open` + `asset_id` 返回 `viewer.id`、版本和原图坐标；PNG/JPEG/TIFF 为有界预览，不能代替超大图像分块查看。随后 `image_read` + `viewer_id` 恢复视图。
- `annotation_save` 使用 `viewer_id`、`expected_revision`（视图版本）及 `annotation:{expectedRevisionId,payload}`；payload 的精确结构从真实工具 schema 和 `image_open` 返回值获得。不要混淆视图版本与 ROI 基准修订 ID。
- 保存后调用 `annotation_launch`，传 `engine:"fiji"`、`viewer_id`、`expected_revision`。当前仅支持单页图像的矩形、多边形、单点；多维、椭圆、复合 ROI、标签掩膜不在此交换范围。
- 在独立 Fiji 窗口编辑 ROI Manager；新增选区必须 Add。点击 `Save ROI Manager return (once)` 生成本次不可覆盖的回传。不要替用户确认未完成的原生编辑。
- 用户完成保存后，`annotation_collect` + `launch_id`、`viewer_id`、`expected_revision` 登记回传产物。同一回传幂等；原图/基准/会话身份须匹配，旧基准形成冲突分支，不覆盖当前标注。`native_status` 可在 Host 重启后找回启动记录。
- `annotation_export` / `annotation_import` 支持登记过的 JSON 交换资产；JSON 的 `origin` 只是来源标签，不能单凭它证明原生工具实际执行。

图像坐标以原图像素边界为准，页码从 0 开始，不推断 Z/T/通道。物理标定未知时保持未知，不从 DPI 推断。适配器负责 ImageJ 点坐标的半像素转换；不得人工再加减一次。桥接只回传 ROI，不回写原图像素。

Fiji 使用独立实例启动参数。关闭工作台页签不关闭原生窗口；关闭 Host 保留原生窗口以免丢失未保存编辑。

后续五类实验的结果必须来自已验证 Runner：Western blot 保存条带与背景 ROI、饱和检查和归一化；划痕保存时间映射、掩膜和初始面积；克隆形成分开记录计数与染色量；细菌菌落仅在稀释和体积可用时计算 CFU；成管保存骨架、拓扑原始字段及长度单位。当前启动能力不等同于这些分析能力。

实验指标的共享确定性口径已经固化：划痕以同一样本的初始面积计算闭合率，面积扩大保留为质控标记；克隆形成的独立菌落数与染色面积始终分列；菌落只有同时有稀释倍数和铺板体积才计算 CFU/mL；成管保留端点、连接点、分段、网孔和长度单位。缺少这些输入时应交付缺口或描述性结果，不能用默认值补齐。

当前 `fiji` 本地工作流提供四个可追踪的指标 Runner：`fiji.scratch-wound`、`fiji.colony-formation`、`fiji.bacterial-cfu`、`fiji.tube-formation`。它们的 `arguments.measurements` 必须是结构化数组，使用稳定 `request_id`，结果登记为项目 Artifact 并保留 `scientificReview: pending`。四类都支持项目内单张灰度图的确定性 ROI 分析：CFU 使用 4-连接组件和稀释/体积；划痕使用显式初始面积和阈值掩膜；克隆形成分开保留独立菌落数与染色面积；成管先执行 Zhang-Suen 细化，再登记骨架像素、端点、连接点、分段、网孔和单位换算。传 `sourceAssetId` 与相应 `image.kind` 配置，产物写入源 SHA-256、ROI、组件/拓扑字段和质量说明。它们仍不提供菌落身份、诊断、治疗效果或独立生物学重复推断；分割和骨架结果必须经过人工科研复核。

