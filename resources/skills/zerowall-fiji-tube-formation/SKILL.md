---
name: zerowall-fiji-tube-formation
description: 使用真实 Skeletonize3D 和 AnalyzeSkeleton 计算成管骨架、端点、连接点、分段和独立图环，保留原始插件字段和标定。
---

# 成管骨架

先读 [Fiji 共同规范](../zerowall-fiji/SKILL.md#实验分析共同规范)，使用当前技能返回的 resourceBase 解析资源。

使用 `fiji.tube-formation`。`image` 参数：sampleId、threshold、polarity、roi、unit=pixel/um/mm、unitScale。unitScale表示每像素线性单位；当前仅支持等距二维标定，pixel时必须为1；未知物理标定保留pixel，不从DPI补齐。

在ImageJ二值阈值mask上调用已安装Skeletonize3D，再以AnalyzeSkeleton原生API运行，剪枝为none。端点、连接点、分段分别汇总原生endPoints、junctions、branches；长度累加经校准edge.getLength，不用骨架像素数充当几何长度。插件缺失或重复版本明确失败，不自动下载替代版本。

`meshes`明确为原生图的独立环数Σ(E−V+1)，不等于空间网孔个数、网孔面积、Angiogenesis Analyzer字段或血管功能。原始tree、branches、endPoints、junctionVoxels、junctions、slabs、triples、quadruples、平均／最大分段长度、图边与坐标保存在skeleton-topology.json；插件对空图返回的null数组原样保留。

复核mask、overlay、skeleton.png、skeleton-tags.tif和原始字段。保留插件文件名及SHA-256。独立几何验收：13像素直线在.5um/pixel时为6um、2端点、1段、0环；单闭环为0端点、1独立环；空图为0长度、0段、0环。真实生物图像仍需阈值／粘连／边界复核，不得自动推出促血管机制。

以下是工具派发包装的结构示例，资产ID、参数和请求ID须替换为核验值。

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "run",
    "workflow_id": "fiji",
    "parameters": {
      "request_id": "REPLACE_WITH_STABLE_REQUEST_ID",
      "operation": "fiji.tube-formation",
      "arguments": {
        "sourceAssetId": "REPLACE_WITH_ACTUAL_ASSET_ID",
        "image": {
          "kind": "tube-formation",
          "sampleId": "S1",
          "threshold": 128,
          "polarity": "bright",
          "unit": "pixel",
          "unitScale": 1,
          "roi": {
            "x": 0,
            "y": 0,
            "width": 20,
            "height": 20
          }
        }
      }
    }
  }
}
```


接受的 ROI 区域可通过共同规范 `image.review` 修改前景或排除片段后重算骨架；必须保留自动/接受掩膜、插件原始图和长度。图环与断环合成参考验证 E−V+C 的 1→0 变化，不代表真实血管网孔分割准确度。当前区域修订通过 ROI Manager/内置多边形完成，不支持任意二值标签文件的直接接受导入。
