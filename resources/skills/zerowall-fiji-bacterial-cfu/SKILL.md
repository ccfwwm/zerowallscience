---
name: zerowall-fiji-bacterial-cfu
description: 使用 ImageJ 分割平板菌落，保存计数及排除依据；只有真实稀释和铺板体积时才计算 CFU/mL。
---

# 细菌菌落

先读 [Fiji 共同规范](../zerowall-fiji/SKILL.md#实验分析共同规范)，使用当前技能返回的 resourceBase 解析资源。

使用 `fiji.bacterial-cfu`。`image` 参数：plateId、threshold、minArea/maxArea（像素面积）、polarity、roi、dilutionFactor、platedVolumeMl。dilutionFactor为倒数稀释倍数，例如10^-3稀释对应1000，不是.001。体积统一mL，不能把100微升填100。

CFU/mL=colonyCount×dilutionFactor/platedVolumeMl。缺任一量时继续分割并保留 colonyCount，cfuPerMl 返回 null 和缺失标记；不能填1绕过。倒数稀释必须≥1，体积必须>0；null/省略表示未知，0不是未知。分割不能推断菌种、培养活性或污染类型。

ROI须排除平板外背景；反光、边缘、碎屑和融合菌落由人工复核mask/overlay及particles.csv。使用共同规范的 image.review 引用接受的反光/边缘排除区与手工前景区域。检测点增删与自动粘连拆分尚未实现；不可观察排除区域不自动外推。独立几何验收：2个菌落×100÷.1mL=2000 CFU/mL。

以下是工具派发包装的结构示例，资产ID、参数和请求ID须替换为核验值。

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "run",
    "workflow_id": "fiji",
    "parameters": {
      "request_id": "REPLACE_WITH_STABLE_REQUEST_ID",
      "operation": "fiji.bacterial-cfu",
      "arguments": {
        "sourceAssetId": "REPLACE_WITH_ACTUAL_ASSET_ID",
        "image": {
          "kind": "bacterial-cfu",
          "plateId": "P1",
          "threshold": 150,
          "polarity": "bright",
          "minArea": 2,
          "maxArea": 20,
          "dilutionFactor": 100,
          "platedVolumeMl": 0.1,
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
