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

## 实验分析共同规范

加载技能时使用系统返回的 `resourceBase` 解析相对资源；不要拼接开发机路径。先发现 `research_workflow`，再 `action=describe, workflow_id=fiji, operation=所选ID` 获取真实契约。业务调用用 `action=run`，`parameters.operation` 和 `parameters.arguments`，同一提交重试复用 `parameters.request_id`；输入变化使用新 ID。结果数值只读取真实 Run 的产物。运行完成、科学复核和人工认可分别记录，不把成功退出当作科学通过。

- [Western blot](../zerowall-fiji-western-blot/SKILL.md)：已保存并接受的条带／背景／加载对照 ROI、饱和阈值和归一化。
- [划痕](../zerowall-fiji-scratch-wound/SKILL.md)：样本／时间映射、基线面积与分割复核。
- [克隆形成](../zerowall-fiji-colony-formation/SKILL.md)：独立颗粒计数、染色面积和物理标定。
- [细菌菌落](../zerowall-fiji-bacterial-cfu/SKILL.md)：平板 ROI、碎屑范围、稀释和体积。
- [成管](../zerowall-fiji-tube-formation/SKILL.md)：Skeletonize3D／AnalyzeSkeleton 原生字段、骨架长度和独立图环。

除 Western blot 外，图像路径要求已登记的本地原始 8 位灰度单平面 PNG/TIFF/PGM（128 MiB、2500 万像素内），传 `arguments.sourceAssetId` 与 `arguments.image`。原生 ImageJ 拒绝 RGB／多页／其它位深的隐式转换；不从显示预览反推定量像素。所有 ROI 坐标和阈值必须来自当前原图；不能把示例数字当作待分析图像参数。原生运行输出 `result.json`、分割 `mask.png`、边界 `overlay.png`、`analysis.roi`、颗粒／边表 `particles.csv`、原生结果、请求、固定脚本和 SHA-256 完成清单。原图坐标和 ROI 局部坐标分开；保留失败日志。

`arguments.measurements` 是人工或外部工具已有测量的汇总路径；不得声称这些输入是本轮 ImageJ 从图像计算得到。涉及完整研究的正式验证遵循已冻结计划，两个人工门禁沿用研究底座；普通查看、已授权定量和恢复不增加逐阶段确认。

缺失的标定、样本映射、稀释、接种量和生物学重复保持未知。阈值与参数优化属于探索，不能选取显著性更强的版本代替冻结分析。当前没有持久批处理队列、自动粘连拆分或疾病诊断。接受的区域修订可生成手工掩膜，具体见下述契约。


### 接受的掩膜修订与排除区域

四类非 WB 图像实验可传 `image.review={annotationRevisionId,excludedRoiIds,foregroundRoiIds?,reason}`。必须引用当前源哈希匹配的最新 accepted AnnotationRevision；只允许第 0 页矩形/多边形，不允许把点计数当作分割区域。先在内置图像查看器或原生 ROI 回传中保存修订，再在实验面板刷新和选择。

省略 foregroundRoiIds 保留自动阈值掩膜；提供该字段时用所选区域并集替代前景，空数组明确表示空掩膜。excludedRoiIds 最后应用，清除反光、边缘或人工切断区域。所有坐标均在原图，Runner 转换为 ROI-local，不能手动重复减偏移。保存 automatic-mask.png、mask.png、exclusion-mask.png、accepted-review.json、overlay.png 与颗粒/骨架原始字段。原始/自动结果不覆盖；新 revision 用新 request ID 重算。

source/revision 变更后读取结果返回 needs_recheck；既有 Store 标注失效机制标记直接关联的证据/主张。划痕后续结果另外核查 baseline Run 与产物哈希及源状态。缺失区域不能按面积自动外推菌落数/浓度；人工图像修订不证明被遮挡区域没有菌落。面积来自修订掩膜，手工点数编辑暂未提供。

实验面板支持历史任务列表、按持久 Run 恢复结果/掩膜。恢复不重新运行。当前四实验的 analyze 请求仍等待本次原生计算完成，关闭页面不取消 Host 计算；按实际任务状态复核。持久批次调度尚未实现。
