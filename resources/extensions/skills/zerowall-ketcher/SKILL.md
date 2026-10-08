---
name: zerowall-ketcher
description: 在现有工作台用离线 Ketcher 编辑分子、读取手工修改、原子高亮、保存结构和导出。
allowed-tools: tool_search tool_dispatch
---

发现 Ketcher Chemistry 的 open_sketcher 后通过 tool_dispatch 调用。输入 SMILES、Molfile、KET、RXN，或工作区内 filename。返回 ready 才表示初始化成功；awaiting_mount、not_mounted、closed、timeout 不能描述为成功。

后续操作必须使用该工作区的 artifact_id：set_structure 设置结构，get_structure 读取当前结构，highlight_atoms 高亮零起始原子 ID，export_structure 导出文件，close_sketcher 保存后关闭。重新打开传 artifact_id 或已保存的 filename。保留立体化学时优先 KET 或 V3000 Molfile，并回读验证手性。模型修改之后不要覆盖用户在编辑器里的新修改，读取当前结构后再操作。

编辑器及 WASM 由本地资源服务加载，无需远程网站。不要请求整个编辑器 HTML，也不要将浏览器桥接地址或令牌写入聊天。导出文件需位于当前工作区，核对返回字节数和 SHA-256。
