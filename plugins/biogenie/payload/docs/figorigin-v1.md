# figorigin v1 —— 图来源记录（轻量侧车）

> 目的：**一切图（含发育树、示意图等无逐点映射的图）都可查原始来源**——输入文件、生成参数、工具。

## 开关（设置 → BioGenie → 图来源记录）

- `auto`（默认）：凡经 `figurelib.export_figure` 导出的图，落盘时自动写 `<同名>.figorigin.json`。
- `off`：不写。
- 存储：`<DSH_HOME>/dsh-bio-genie/config.json` 的 `figorigin` 字段；Python 侧经环境变量 `DSH_BIO_FIGORIGIN` 读取（`src/python.js` 安装注入）。

## 声明输入上下文（可选，建议）

画图脚本中：
```python
from figurelib.origin import set_source_context
set_source_context(
    inputs=[{'path': 'data.csv', 'note': '差异表'}],   # 文件路径（自动算 sha256）
    params={'alpha': 0.05}, tool='figurelib.differential_plot', note='...')
```
未声明时仍记录：图片元数据、生成时间、Python 版本（inputs 为空并注明）。

## 侧车字段（schema_version=1, kind=figorigin）

| 字段 | 说明 |
|---|---|
| figure_id / image{path,sha256,width,height} | 图标识与图片指纹 |
| generator{module,python,written} | 生成器与时间 |
| source / inputs[] | 主来源与全部输入（path/kind/sha256/note） |
| params / tool / note | 参数、工具、备注 |

## 前端

- 图卡（对话）：每张图带「来源」按钮（任一 sidecar 或预览图）→ 侧栏打开来源查看 tab。
- 来源查看器：图标识/时间/工具/备注 + 输入文件列表（sha256 前缀 + 复制路径）+ 参数 JSON。

## 与 fig-viewer 的关系

figorigin 管**来源**（一切图）；fig-viewer bundle 管**点级交互**（散点类图）。两者并存、互补；
同 stem 的两份侧车可同时存在。

## BACKLOG（root cause）

- 本机 0.2.0-rc.2 实测：`installFigureViewer` 内单独注册 `sidebar.right.pane.tab` slot 曾出现
  不渲染（与 figure 的 hello+viewer 双层注册同构的双注册为工作配置）。待深挖宿主 slot 注入时序。
