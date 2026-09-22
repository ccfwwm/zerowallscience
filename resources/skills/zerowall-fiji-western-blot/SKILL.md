---
name: zerowall-fiji-western-blot
description: Western blot 原始灰度图的条带背景扣除、饱和检查和加载／对照归一化；需要已接受的 ROI 修订。
---

# Western blot

先读 [Fiji 共同规范](../zerowall-fiji/SKILL.md#实验分析共同规范)，使用当前技能返回的 resourceBase 解析资源。

使用 `fiji.western-blot`。先通过共享 ROI 流程取得 `viewerId`、`expectedVersion`、当前 accepted `annotationRevisionId`。每泳道明确 sampleId、真实 biologicalReplicate、group、bandRoiId、backgroundRoiId；归一化时另给 loadingRoiId 与 loadingBackgroundRoiId。不要把技术泳道数当生物学重复数。

`plan.polarity` 为 bright/dark；`saturation.lower/upper/source` 来自采集条件而非猜测；`normalization` 为 none/housekeeping/total-protein，`controlGroup` 为真实组名或 null。验证前检查饱和、ROI 重叠、背景方向、加载对照与对照均值。裁剪饱和或非正校正值保留 flags，不补写正值。

Run 可能返回运行中，使用真实研究工作流状态操作和 run_id 取回产物，不盲目重算。验收保存 ROI、像素原始统计、背景扣除值、归一化值、质控叠加与 Manifest；解释不超过描述性定量。
