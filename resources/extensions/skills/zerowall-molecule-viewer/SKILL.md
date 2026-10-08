---
name: zerowall-molecule-viewer
description: 在 ZeroWall 查看 PDB、mmCIF、SDF 分子结构，按项目资产和 Host 版本执行测量及导出。
---

# 分子结构查看器

选择 PDB/CIF/mmCIF/SDF 文件后调用桌面导入，将文件复制、校验 SHA-256 并登记到当前项目。外部导入上限 128 MiB；PDB/mmCIF 查看器解析还有 16 MiB、首模型 100,000 原子的限制，以 Host 实际错误为准。通过 `science_viewer` 的 `molecule_open` 获取 viewer ID、结构和可视状态；后续 `molecule_read` 使用已返回的 viewer ID 和版本。

默认查看器只提供旋转、平移、缩放、链/表示切换与刷新。未选择资产提示“请先选择资产”，解析/引擎失败提示“打开失败”或“引擎未配置”，原生进程 `spawned` 只能提示“进程已启动，窗口状态待确认”。不在默认页面显示测量、对接、导出或分析参数。

测量和导出由本 skill 调用 `science_workbench`，传 `tool=molecule`、`skill_id=zerowall-molecule-viewer`、真实 `action_id`（例如 `molecule_measure`）、`viewer_id`、`request_id` 和 Host schema 要求的参数。不要把原子可视化当作能量或对接结果。核对源文件哈希、viewer 版本、距离单位 Å、Artifact URI 与 SHA-256；远程对接另用 `zerowall-molecule-docking`。
