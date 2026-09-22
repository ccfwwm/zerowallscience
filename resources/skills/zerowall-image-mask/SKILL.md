---
name: zerowall-image-mask
description: 对已接受图像 ROI 使用独立的单通道无符号整数标签掩膜执行可追踪的分标签强度统计；不替代分块分割、Fiji 或临床诊断。
---

用于细胞、组织或实验图像已有标签/掩膜时。掩膜必须作为项目内独立数据资产登记，几何、页数和源图像一致；RGB 掩膜、浮点掩膜和隐式缩放均不接受。

执行顺序：

1. 使用 `science_viewer({"action":"image_open","asset_id":"源图像资产ID"})` 打开源图像并记录 viewer 版本、尺寸、页数、通道和位深。
2. 保存并接受 ROI 修订；ROI 坐标使用原图像素边界，页码从 0 开始。
3. 使用 `science_viewer({"action":"image_mask_analyze","viewer_id":"...","expected_revision":数字,"annotation_revision_id":"...","mask_asset_id":"掩膜资产ID"})` 执行分析。需要时传入 `mask_labels`，限制到最多 256 个非负整数标签。
4. 检查返回的 `imageMaskAnalysis` 与 Artifact：源图像和掩膜 SHA-256、ROI 修订、viewer 版本、掩膜位深、每个 ROI 的标签像素数及原始强度统计必须一致。

统计对每个 ROI 和每个实际出现的标签返回像素数、每通道总和、均值、最小值、最大值和总体标准差。没有出现的显式标签不会伪造零强度记录。结果的 `scientificReview` 保持 `pending`，必须经过人工或研究审阅后才能支持正式主张。

当前边界：仅支持受限的 PNG/JPEG/TIFF 解码；不包含 OME-Zarr、10 GiB 分块读取、OpenSlide 瓦片、自动分割或远程重计算。标签值超过 256 个且未显式指定子集会阻断运行。掩膜统计是描述性结果，不能自动升级为细胞计数准确性、组织诊断、治疗效果或生物学因果结论。
