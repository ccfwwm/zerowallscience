---
name: zerowall-fiji-bacterial-cfu
description: 使用 ImageJ 分割平板菌落，保存计数及排除依据；只有真实稀释和铺板体积时才计算 CFU/mL。
---

# 细菌菌落

先读 [Fiji 共同规范](../zerowall-fiji/SKILL.md#实验分析共同规范)，使用当前技能返回的 resourceBase 解析资源。

使用 `fiji.bacterial-cfu`。`image` 参数：plateId、threshold、minArea/maxArea（像素面积）、polarity、roi、dilutionFactor、platedVolumeMl。dilutionFactor为倒数稀释倍数，例如10^-3稀释对应1000，不是.001。体积统一mL，不能把100微升填100。

CFU/mL=colonyCount×dilutionFactor/platedVolumeMl。缺任一量时当前CFU端点拒绝计算；可以保留单独计数记录和缺口，不能填1绕过。分割不能推断菌种、培养活性或污染类型。

ROI须排除平板外背景；反光、边缘、碎屑和融合菌落由人工复核mask/overlay及particles.csv。当前矩形ROI与面积阈值不能代替自由排除区、检测点手工修订或粘连分离。独立几何验收：2个菌落×100÷.1mL=2000 CFU/mL。

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
