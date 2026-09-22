# 7.0.0 序列 PCR、Gibson 与 Golden Gate 模拟

三类操作进入统一 `science_viewer` 的 `analyze/export`，GUI 使用同一 Host。模拟参数随结果和源资产 SHA-256、Viewer 版本、算法版本一起导出，保留 JSON 和产物 FASTA；不修改输入文件。服务 Runner 为 `zerowall-sequence/7.0.0-3`。

## 实现范围

| 方法 | 输入和实际计算 | 拒绝情况与限制 |
|---|---|---|
| PCR | 当前选区或整条环状模板；5′→3′ 双引物、显式 3′ 退火长度及 5′ 尾；精确定位并生成线性产物 | 唯一定向退火位点，12–120 nt 退火长度；多命中/无命中、重叠引物、超过一圈或产物长度限制时拒绝；不预测 Tm、二聚体、错配扩增或产率 |
| Gibson | 同文件 2–12 个完整线性片段，用户明确顺序和方向；唯一末端同源合并；线性或圆形产物 | 单片段≤100000 bp，总长度≤500000 bp；最小重叠12–80、搜索上限1000 bp；多重重叠、意外后继、全部被同源区覆盖时拒绝 |
| Golden Gate | BsaI/BsmBI，恰好一正一反向内位点；固定 4 nt 5′ 黏端；按显式方向拼成圆形 | 拒绝内部位点、重复/自互补/反向互补竞争末端、不兼容接头以及产物中新建的酶位点（包括跨原点接头）；不模拟连接效率或非理想错配 |

PCR 坐标为源记录 1-based inclusive；环状跨原点区间末端可以小于起点。拼接片段保留区间针对定向后的片段，另保留 `reverseComplement`。Gibson 产物以第一个定向片段起点开始，首尾重叠只出现一次。Golden Gate 每段保留正链区间至右侧切口之前，右侧四碱基由下一片段提供，不重复添加。

输入必须为明确 A/C/G/T。已声明为环状的 GenBank 不能默认为线性模板或直接作为线性拼接片段。FASTA 没有拓扑声明时，由用户明确选择；不会由“环形图谱布局”推断真实拓扑。拼接使用完整记录，GUI 明示忽略碱基选区。

## 验证证据

2026-09-22 新增 7 项算法测试覆盖线性/跨原点 PCR、双侧尾序列、位置回映、重复/无效模板、Gibson 线性/圆形/反向片段、歧义拒绝、BsaI/BsmBI、Type IIS 错误末端和内部位点。

实际 React → Host → Chromium 验收通过：`.build/sequence-simulation-smoke/2026-09-22T05-31-21.148Z/report.json`。三类 GUI 均导入资产、设置参数、导出并登记 3 个 Artifact、核验 JSON 哈希及 FASTA 内容，恢复保存视图。截图为同目录 `pcr.png/gibson.png/golden-gate.png`。

独立参考环境 Python 3.12.10、pydna 5.5.0、Biopython 1.88 安装于 `.build/sequence-reference-python`，不修改系统安装或生产服务器。参考使用真实 `pydna.amplify.pcr`、`pydna.assembly.Assembly`、`Dseqrecord.cut`、黏端连接与圆化、`Bio.Restriction`，不重复实现 Host 算法。线性及环状 PCR 逐字节一致；Gibson 参考返回两种方向的同一圆形产物，按旋转/反向互补等价核验；两种 Type IIS 酶的产物、切口和黏端与独立库一致。

```powershell
python -m pip install --target .build/sequence-reference-python pydna==5.5.0 biopython==1.88
pnpm --filter @zerowallscience/plugin-research exec vitest run test/sequence-simulation.spec.ts
pnpm exec tsx tools/integration/sequence-simulation-smoke.ts --run
```

上述为合成数据的软件与数值验收，不是湿实验、全基因组特异性、完整商业克隆软件功能或 packaged Electron 验收。自动 Primer3 引物设计、错配 PCR、任意 Type IIS 酶、跨资产拼接以及产物注释迁移仍需后续实现；本模块不把这些能力显示为已完成。
