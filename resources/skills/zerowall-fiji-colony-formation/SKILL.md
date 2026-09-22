---
name: zerowall-fiji-colony-formation
description: 使用 ImageJ ParticleAnalyzer 计数克隆形成颗粒，分开报告计数、染色面积、碎屑和物理标定。
---

# 克隆形成

先读 [Fiji 共同规范](../zerowall-fiji/SKILL.md#实验分析共同规范)，使用当前技能返回的 resourceBase 解析资源。

使用 `fiji.colony-formation`。`image` 参数：wellId、threshold、minArea/maxArea（像素面积）、polarity、roi；可选 stainUnit=pixel/um2/mm2。物理单位必须同时给 pixelArea，表示每个像素对应所选面积单位；仅写 mm2 不能改变像素计数的单位。

ParticleAnalyzer 使用8连通，minArea/maxArea保留区间内的颗粒；触碰克隆不会自动分裂。计数为 accepted颗粒数；染色面积为 accepted颗粒原始Area之和再标定，两者不能互相替代。保存每个颗粒面积、ROI局部质心及accepted字段；说明碎屑、边缘和粘连排除情况。

接种量、孔位和生物学重复由样本记录提供；当前不自动计算成克隆率或推断克隆形成效率。独立几何验收：面积12与6的两颗粒加1像素碎屑，minArea=2时得到2个、18pixel；pixelArea=.01 mm2得到.18mm2。

以下是工具派发包装的结构示例，资产ID、参数和请求ID须替换为核验值。

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "run",
    "workflow_id": "fiji",
    "parameters": {
      "request_id": "REPLACE_WITH_STABLE_REQUEST_ID",
      "operation": "fiji.colony-formation",
      "arguments": {
        "sourceAssetId": "REPLACE_WITH_ACTUAL_ASSET_ID",
        "image": {
          "kind": "colony-formation",
          "wellId": "A1",
          "threshold": 150,
          "polarity": "bright",
          "minArea": 2,
          "maxArea": 20,
          "stainUnit": "mm2",
          "pixelArea": 0.01,
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
