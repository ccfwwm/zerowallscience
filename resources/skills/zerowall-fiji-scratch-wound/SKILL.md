---
name: zerowall-fiji-scratch-wound
description: 使用 ImageJ 对划痕图像 ROI 分割并计算相对同一样本初始面积的闭合率，保留基线和时间对应。
---

# 划痕愈合

先读 [Fiji 共同规范](../zerowall-fiji/SKILL.md#实验分析共同规范)，使用当前技能返回的 resourceBase 解析资源。

使用 `fiji.scratch-wound`。`image` 参数：sampleId、time、initialArea、threshold、polarity、roi。initialArea 与当前分割必须使用同一像素尺度及可比 ROI；当前接口单位为像素面积，不能直接填 mm²。不同采集尺度必须先建立可追踪的尺度匹配方案。

先登记样本→时间→资产→ROI 表和真正的 t0 面积。当前 Runner 一次分析一张图，不自动补齐时间序列、生成缺失 t0 或推测处理组。闭合率=(initialArea−remainingArea)/initialArea；面积扩大保留负闭合率，闭合100%不自动代表细胞迁移机制。

复核 wound 是否对应同一解剖／培养区域、反光或细胞内空洞误分割、采集边界和缺失时间点。检查 mask 与 overlay 后再登记证据。独立几何验收：19 像素残余／38 像素基线=50%；非全图 ROI 另有12／24=50%验证。

以下是工具派发包装的结构示例，资产ID、参数和请求ID须替换为核验值。

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "run",
    "workflow_id": "fiji",
    "parameters": {
      "request_id": "REPLACE_WITH_STABLE_REQUEST_ID",
      "operation": "fiji.scratch-wound",
      "arguments": {
        "sourceAssetId": "REPLACE_WITH_ACTUAL_ASSET_ID",
        "image": {
          "kind": "scratch-wound",
          "sampleId": "S1",
          "time": "24h",
          "initialArea": 38,
          "threshold": 150,
          "polarity": "bright",
          "roi": {
            "x": 0,
            "y": 0,
            "width": 20,
            "height": 12
          }
        }
      }
    }
  }
}
```


### 关联真实基线

新图像时间序列使用 `image.timeline={fieldId,timeHours,baselineRunId?,expectedHours,pixelSpacing:{x,y,unit,source}}`。时间单位固定 h；expectedHours 包含 0 和当前点且不能重复。像素间距来源必须真实可核验。0h 不传 baselineRunId，Runner 从当前接受掩膜计算 baseline 初始面积；后续点必须引用成功基线，Host 忽略用户手填 initialArea 并取基线实算面积。样本/视野、ROI、间距/单位和预定时间点须对应。当前不执行空间配准或跨尺度面积换算。

同一 baseline/timeHours 原子复用同一计算；参数变化触发幂等冲突，修改序列需要新的基线/方案版本，不创建两个同时间点观察。状态列出 observedHours/missingHours，缺点不插值，负闭合率保留。基线源改变或基线标注过期，使后续读取标记 needs_recheck。
