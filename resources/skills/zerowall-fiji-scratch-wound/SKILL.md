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
