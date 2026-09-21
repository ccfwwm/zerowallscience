---
name: zerowall-image-intensity
description: 对项目内图像的已接受 ROI 执行可追踪的原始像素强度描述性统计；不替代 Fiji、napari 或分块/标签分析。
---

用于需要从图像 ROI 取得像素计数、总和、均值、最小值、最大值和总体标准差时。普通查看、ROI 编辑和五类 Fiji 实验应分别使用 `zerowall-fiji` 及其对应 Runner。

先发现 `science_viewer`，再用当前会话实际返回的资产和 Viewer ID。不要猜测项目、资产、Viewer 版本或标注修订 ID，也不要把预览 PNG 下载后自行统计。

## 调用流程

1. `science_viewer({"action":"list"})` 找到当前项目内的本地图像资产；远程资产先通过现有 `r_files` 链路落地并登记。
2. `science_viewer({"action":"image_open","asset_id":"实际资产ID"})` 获取 `viewer.id`、`viewer.version`、原始尺寸、页数、通道、位深和 OME 轴位置。
3. 通过 `annotation_save` 保存 ROI，并等待当前版本成为 `accepted`。矩形、多边形和点 ROI 使用原图像素边界坐标，页码从 0 开始；物理标定未知时保持未知。
4. 视图或标注没有未保存修改时，调用：

```json
{"action":"image_analyze","viewer_id":"实际Viewer ID","expected_revision":7,"annotation_revision_id":"可选的accepted修订ID"}
```

5. 只引用返回的 `imageAnalysis` 和 JSON Artifact。结果绑定源 Asset SHA-256、Viewer 版本、accepted 标注修订、尺寸、页数、通道和位深；Artifact 的 `scientificReview` 固定为 `pending`。

## 解释边界

- 统计来自源文件原始解码像素，不来自预览图，不静默归一化为 8-bit。
- 多页 TIFF 按 ROI 所在页读取；几何或通道不一致的页会被阻断。当前范围不包含 OME-Zarr、10 GiB 分块读取、标签/掩膜、分割、批处理或远程重计算。
- `mean`、`min`、`max` 和总体标准差按每个通道分别返回；缺失值、非有限值或不含像素中心的 ROI 会阻断运行。
- 数值成功只代表描述性像素计算完成。不得将它写成诊断、治疗效果、机制或统计显著性结论；任何正式主张仍须经过证据登记和人工科学复核。
- 发生 Viewer 版本冲突、没有 accepted 修订或源文件哈希改变时，先重新读取并保存新修订，不要重试旧参数掩盖冲突。
