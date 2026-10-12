---
language: python
---

# 出版级绘图专题

> 插件定位：**可视化顾问**（先思考后绘制），不是画图机器人。决策层 skill `bio-figure` + 执行层协议 `bio-proto-pub-figure` + 三个 fig 工具 + `figurelib` 库。

## 1. 三工具分工（记牢）

| 工具 | 职责 | 时机 |
|---|---|---|
| `bio_fig_qa` | 环境预检：CJK 字体、期刊预设 | **画图前**（中文图必查 cjk_ready） |
| `bio_fig_profile` | 数据剖析 + 图型建议 + 风险警告 | **选图前**（永远先跑，再决定画什么） |
| `bio_fig_export` | 图文件合规审计（DPI/格式/尺寸/字体） | **导出后**（FAIL 回改重导） |

画图本身在 `bio_python` 里完成（figurelib 可 import）。Figure 对象不能跨工具传递——自检/导出都在同一段代码里做完。

## 2. 标准闭环（8 步，顺序不可跳）

```
0. 问清论证目标（这张图要说服读者什么？）——用户没说清就主动问
1. bio_fig_profile → 列类型/样本量/分布/异常/相关 + suggestions
2. 选图：按数据形态+论证目标查 bio-figure 决策表，给推荐+理由+备选
3. 查期刊规格（bio-figure 内的期刊表：Nature 单栏 3.5in/7-8pt/300dpi…）
4. bio_fig_qa → 中文图确认 cjk_ready，false 就改英文标签
5. bio_python 绘制（配方见 bio-proto-pub-figure）
6. audit_layout(fig) 程序自检（缺字/裁切/刻度重叠/文本互叠/图例遮数据）
7. export_figure(...) 按最终尺寸导出 PDF/SVG/PNG + 灰度预览
8. bio_fig_export 审计 → FAIL 回改 → 直到 PASS
```

## 3. figurelib API 速查

```python
from figurelib.setup_style import setup_style       # setup_style(journal='nature', lang='zh', serif_for_zh=False)
from figurelib.profile_data import profile_data     # profile_data('data.csv', group_cols=['group'])
from figurelib.export_figure import export_figure   # export_figure(fig, 'figs/fig1', formats=['pdf','svg','png'], size_inches=(3.5,2.625), dpi=300, grayscale_preview=True)
from figurelib.check_figure import check_figure     # check_figure('fig1.pdf', min_dpi=300, target_inches=(3.5,2.625))
from figurelib.layout_tools import finalize_figure, add_panel_labels  # finalize_figure(fig); add_panel_labels(fig, style='nature'|'ieee')
from figurelib.visual_qa import audit_layout, print_report, render_preview  # audit_layout(fig) → [(severity, msg), ...]
```

### 出图后布局自检

agent 自绘图时，在最终尺寸和布局确定后、导出前，对同一个 Figure 调用自检：

```python
from figurelib.visual_qa import audit_layout, print_report

issues = audit_layout(fig, clip_tol_px=2, overlap_tol_px=1, legend_min_points=3)
verdict = print_report(issues)  # PASS / WARN / FAIL；WARN 不自动阻断导出
# 按报告移动重叠标注、调整字体/间距或移走图例，再自检并导出。
```

`differential_plot`（含 volcano/MA 别名）已在导出前自动审计；无 `out_file` 时也会审计。
结果在 `meta['layout_audit']`，简洁修正建议在 `meta['layout_suggestions']`，
可直接 `print_report(meta['layout_audit'])`。默认 `legend_loc='outside'` 将图例横排在
axes 上方留白区；可以显式覆盖为 `'best'` 或其他 matplotlib 位置。自定义 axes
若留白不足或带标题，按报告调整图例/标题间距，随后重新审计。

配方先确定最终轴范围，再运行标注避碰，并用渲染后的文字 bbox 做几何兜底：
可见标注保留在 axes 内，避开 outside 图例条带；靠近边界的剩余文本互叠按固定
顺序尝试邻近位置，并同步更新引导线。被最终数据范围裁掉的 annotation 不参与
避碰或文本互叠检测，显式 `annotation_clip=False` 的文字仍会检查。

裁切 WARN 的口径是**原始 Figure 画布**。配方的 `out_file` 路径自动采用
`bbox_inches='tight'`，所以 `log2FC` 等轴标签超出原画布但被 tight 导出完整包含时，
该 WARN 属已知诊断噪音，不代表导出文件裁掉标签。配方保留该报告，避免改变
调用方的 axes 尺寸/布局引擎；无 `out_file` 或后续使用普通 `savefig` 时仍需处理。
若要原始画布也容纳全部标签，可先确定布局，再调用配方；配方返回后再次执行
`finalize_figure` 等布局修改，需要重新审计。

文本互叠排除刻度及科学计数法偏移文字、同一 legend 内的条目/标题配对；
annotation 只比较文字 bbox，不把箭头穿越当成文本互叠。图例检测默认至少 3 个
可见且未被裁剪的独立 scatter 中心或 line 顶点落入 bbox 才 WARN，同坐标分层
绘制不重复计数。阈值可调；稀疏折线的段穿越、marker 边缘、bar/image 等未覆盖，
仍需渲染预览读图复核。原有缺字 FAIL、裁切/刻度 WARN 语义保持不变。

## 4. 中文图（方框问题的根治）

- 根因：默认字体无 CJK 字符表。**画前 `bio_fig_qa` 探测**。
- `setup_style(lang='zh')` 自动按优先级找 `Noto Sans CJK SC > Source Han Sans SC > SimHei > Microsoft YaHei`，并修负号方框（`axes.unicode_minus=False`）。
- cjk_ready=false 时：**改用英文标签**，或提示用户安装 Noto Sans CJK（给下载链接）。
- 中文期刊混排约定（宋体正文 + Times 数字）：`setup_style(lang='zh', serif_for_zh=True)`。

## 5. 主动拦截（顾问职责：不默默照做）

用户要求触发以下错误时，先说明再给替代方案，用户坚持才照做（留下劝阻记录）：

| 用户要求 | 问题 | 替代方案 |
|---|---|---|
| n<10/组 均值柱状图 | 掩盖分布，审稿人怀疑 | 箱线/小提琴 + stripplot 叠加每个点 |
| 双 Y 轴 | 捏造视觉相关性 | 拆上下子图共享 x |
| 饼图展示占比 | 人眼判角度差 3 倍 | 横向柱状（按值排序） |
| rainbow/jet 热图 | 感知不均匀、造假峰 | viridis / RdBu_r |
| 一图塞多个结论 | 没论点 | 拆图，一图一结论 |

完整 18 条陷阱见 bio-figure skill。

## 6. 五条硬性原则

1. **按最终尺寸出图**：figsize 直接设论文实际尺寸（Nature 单栏 3.5in），导出后禁止在 Word/LaTeX 缩放（字号是绝对 pt）。
2. **矢量优先**：线/柱/散点/热图 → PDF/SVG/EPS；显微图才用 PNG/TIFF(300-600dpi)；**数据图绝不用 JPEG**。
3. **色盲友好**：colorblind 调色板 + 冗余编码（线型/marker）+ 灰度预览检查。
4. **字号**：正文 7-9pt，最小 ≥6pt（按最终尺寸）。
5. **误差必有交代**：图注写误差类型（SD/SEM/95%CI）+ n + 检验方法 + 校正。

## 7. AI 读图复核（能力边界）

scipilot 原版有"渲 PNG → 多模态读图核对"环节。dsh 插件本身**无多模态能力**：
- 机器自检全保留（audit_layout + bio_fig_export）。
- 若当前 dsh 会话的模型支持读图：把 `export_figure` 的 PNG 预览交给模型复核（图例压数据/子图对齐/灰度可分），发现问题回改重渲。
- 不支持读图就依赖程序自检 + 清单核对，并在结论中说明此局限。

## 8. 高频坑

- 显著性标注必须先跑统计检验（bio-proto-statistics），图注写校正方法。
- 表达热图别用 jet（P14）。
- 子图 a/b/c 用 `add_panel_labels`，别手摆 `ax.text`（会错位）。
- 导出前 `finalize_figure(fig)` 兜底版面；`audit_layout` 只对 Figure 对象有效（落盘文件只能走 bio_fig_export）。
- bio_fig_export 的 PDF 审计需要 pypdf（不在环境）→ 字体嵌入检查会降级为 INFO 提示，这不是失败；PNG 审计（DPI/尺寸）是完整能力。

## 9. 显式导出 fig-viewer sidecar v1

需要逐点查原始数据时，在仍持有源表和 Figure 的配方调用中 opt-in：

```python
fig, ax, meta = differential_plot(
    df, label_col='gene', out_file='figs/volcano.pdf',
    viewer={'figure_id': 'volcano-001', 'output_dir': 'figs/viewer'})
manifest_path = meta['viewer_manifest']
```

无 `out_file` 时，`viewer=True` 只登记 `fig.figview_binding`；完成轴尺度、布局和
DPI 设置后调用 `figurelib.figview.export_bundle(fig.figview_binding, 'figs/viewer',
figure_id='volcano-001', dpi=300)`。自定义散点需使用 `FigureBinding` 和
`bind_points` 显式登记源行组；现有 PNG/PDF 无法补猜出行映射。

源表缺失时仅导出 preview；点数、JSON 或 PNG 超限会拒绝并给出缩减建议。
交付 manifest 引用，不把全部 rows/hits 塞入会话；sidecar 中的脚本仅供哈希追溯，
禁止直接执行。合同、校验命令、预算及能力边界见
[sidecar v1](../fig-viewer-sidecar-v1.md)。原工具 schema 与默认出图返回不变。
