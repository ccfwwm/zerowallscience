# BrainGlobe 坐标正确性与后续基准审计

2026-09-22 只读确认本机 Python 为 `C:/Program Files/Python312/python.exe` 3.12.10；用户 site 已安装 atlasapi 3.0.1、brainreg 1.0.16、cellfinder 1.10.1、brainrender 2.2.1。没有修改用户 napari、已有引擎或生产服务。受管理图谱位于 `.zerowall/brainglobe-managed`；用户 `.brainglobe` 另有同类安装，不将两者混为一个引擎包。

## 本次已修正确性问题

atlasapi 3.0.1 的 `_idx_from_coords` 直接 `int(c)` 后索引 NumPy：负值会截断或成为负索引。旧 Runner 未先检查边界，负坐标可能被映射到合法组织。已在 `zerowall-brainglobe/7.0.0-2` 修正：

- 只接受有限数值的三元组、已知单位，坐标数限制 1–100000。
- 明确 atlas `asr`，数组轴为 AP、SI、RL，原点为 anterior/superior/right，坐标从零开始；单位转换使用各轴 resolution。
- 在任何整数化/数组索引前检查 `0 <= coordinate/resolution < shape`。越界和背景标签 0 统一记为 outside，保留原始坐标和总数；ontology 损坏或非预期执行异常不再静默伪装 outside。
- GUI 和 Skill 明确禁止将 cellfinder x,y,z 直接当作图谱坐标。

3 项 Python Runner 契约测试覆盖三轴负值、负小数、排他上界、各向异性单位转换、不对称参考点、非数值及错误方向。实际受管理 Allen 25 µm 图谱运行通过，独立直接 NumPy 查得 `[16,128,192]` → OLF/698；7 个 voxel 越界和2个 micron 越界均未映射。报告：`.build/brain-coordinate-smoke/2026-09-22T05-43-14.187Z/report.json`。Host/client/strict workbench 检查通过。

## 待实现，不能作为当前完成能力

1. **真实变换契约。** `cellfinder.core.main` 输入体积/体素尺寸为 z,y,x，输出 Cell 字段为 x,y,z；图谱数组为 AP,SI,RL。brainreg 还包括输入 orientation、重排、下采样与非刚性变换，不能只交换三个坐标。新增持久变换对象时必须记录源/目标资产和哈希、体素尺寸、轴序、原点、采样规则、变换方向、场文件哈希及配准人工复核状态。
2. **brainreg 输出几何。** 目前只验文件存在/非空/JSON/hash；下一步检查 registered_atlas 与 downsampled 体积 shape、标签字典、deformation_field_0/1/2 有限值及方向。已读上游 `niftyreg/run.py`：导出的 registered_atlas 是重采样的标签，deformation field 由 `reg_transform -def <control-point> -ref <downsampled_filtered>` 产生。必须用已知非对称平移/轴翻转参考与上游点变换结果核验，不能猜测场含义或盲目求逆。
3. **cellfinder 阳性。** 现有 4×8×8 实例仅证明执行链路。先准备 64×128×128、固定种子背景和若干分离球状亮点的合成体，固定已知中心/物理半径，使用 CPU、单任务、检测模式，不下载分类模型；记录检测中心误差、漏检/误检及边界目标。合成阳性只验证算法连接，不替代真实注释基准。
4. **真实样例候选。** 已安装 brainreg `napari/sample_data.py` 自带固定 Git SHA `72b73c52f19cee2173467ecdca60747a60e5fb95` 的 `test_brain.zip`，SHA-256 `7bcfbc45bb40358cd8811e5264ca0a2367976db90bcefdcd67adf533e0162b5f`，270切片、体素50×40×40µm、orientation psl。当前仅从安装源码确认候选，尚未下载/核验许可、字节数或人工解剖标注，因此不得当作已通过配准质量数据。
5. **资源与产物。** 当前 cellfinder 在 voxel上限检查之前转换整个输入为float32来检查finite，且缺背景时分配全零体；后续应先校验shape/size再分块finite扫描。brainreg 使用 n_free_cpus 并不保证最多8线程，需转换为明确线程额度并验证CLI实际行为。进程异常日志和失败目录须绑定 Run，不仅抛出错误字符串。

本次只修坐标正确性，不宣称完成 brainreg 解剖配准、样本到图谱非刚性变换、cellfinder 阳性灵敏度或 BrainGlobe 离线引擎包。
