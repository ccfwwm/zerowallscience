---
name: zerowall-napari
description: 从 ZeroWall 打开本机 napari 查看图像并进行单页 ROI 版本化往返；BrainGlobe、多维和标签掩膜需独立适配。
---

# napari 图像查看

先读取 `getScientificEngineConfigs({sessionId})`，确认 napari 的 `pythonPath`/环境路径和启用状态；需要修改时使用 `setScientificEngineConfig`，再用 `probeScientificEngine` 验证版本。默认解释器是 ZeroWall 稳定 Python `%APPDATA%\zerowall-science\Python\python.exe`；Host 在同一环境的 `Lib\site-packages\bin\napari.exe` 查找启动入口，缺失时用 `python -m napari`。发现 `science_viewer` 后使用 Host 启动，不修改 Qt 或全局系统 Python 环境。


- `{"action":"list"}` 获取当前项目资产；无需创建完整研究。
- `{"action":"launch_native","engine":"napari","asset_id":"实际资产ID"}` 打开本机项目内 TIFF/PNG/JPEG/BMP；省略资产启动空白窗口。远程文件先通过 `r_files` 取回并登记。
- `{"action":"native_status"}` 返回本项目进程记录。`spawned` 只说明进程已创建；GUI 就绪仍为 `unverified`。进程退出不证明图像被加载，Host 重启后的 `unobserved` 不证明原生窗口已经关闭。

Windows 验收使用原生 Qt/OpenGL 后端；Qt offscreen 不具备所需 OpenGL 时不能据此判定原生查看失败。实际验收需核对图像、标签、点图层及 2D/3D 显示。

ROI 往返使用 `image_open` → `annotation_save` → `annotation_launch(engine:"napari")` → 原生保存 → `annotation_collect`。后两者需要真实返回的 `viewer_id`、`expected_revision`（视图版本）；收取还需返回的 `launch_id`。普通 `launch_native` 不建立 ROI 交换。详细交换契约见 [Fiji 共享 ROI 流程](../zerowall-fiji/SKILL.md#内置图像与-roi-往返)，实际参数以工具 schema 为准。

原生编辑仅操作 `ZeroWall ROI` 和 `ZeroWall points` 图层；点击 `Save ROI return (once)` 后再收取。支持单页矩形、多边形、单点；旋转矩形回传为多边形，图层变换和额外图层会阻止导出，避免隐式漏掉数据。napari 像素中心与工作台像素边界之间的半像素转换由适配器完成。冲突分支需明确选择采用，不能自动覆盖。

层状态、多维 ROI/标签掩膜、OME-Zarr 适配及 BrainGlobe 尚未接入此接口。保留源资产，不把启动或 ROI 交换当作分析、配准或脑区统计完成。BrainGlobe 与 napari 共用 ZeroWall 稳定 Python，但图谱数据和动作仍由 BrainGlobe Host 管理。
