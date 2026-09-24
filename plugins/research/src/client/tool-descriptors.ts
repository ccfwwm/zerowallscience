import {
  Activity, Atom, Brain, Dna, Droplet, Fingerprint, House, Image,
  LayoutPanelLeft, Microscope,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ScienceToolId } from '../shared/workbench.js'

/**
 * The workbench shell is presentation only: every string it paints comes from
 * this module.  The dictionaries are exported so the shell can resolve them
 * directly, because the desktop locale bag in `plugins/base/src/client/locales.ts`
 * does not carry these keys.  Keying them here keeps the workbench renderable
 * on its own; a host that prefers the bag as its single review surface can
 * still spread `...WORKBENCH_LOCALES.zh` into `zh` and `...WORKBENCH_LOCALES.en`
 * into `en`, and the shell will resolve whichever form is present.
 */
const zh = {
  'science.shell.tablist': '专业工具标签',
  'science.shell.more': '更多工具',
  'science.shell.analyse': '用自然语言分析',
  'science.engine.dialog.title': '引擎设置',
  'science.engine.dialog.subtitle': '配置本机原生工具与远程引擎；探测结果全部来自宿主，未被宿主验证的引擎不会标记为可用。',
  'science.engine.dialog.intro': '路径按“项目配置 → 用户配置 → 环境变量 → 自动发现 → 默认值”解析；同一引擎的项目配置优先于用户配置。',
  'science.engine.dialog.precedence': '未保存的修改不会写入配置。',
  'science.engine.close': '关闭',
  'science.engine.save': '保存',
  'science.engine.test': '探测',
  'science.engine.reset': '恢复默认',
  'science.engine.advanced': '高级',
  'science.engine.enabled': '启用',
  'science.engine.working': '处理中…',
  'science.engine.diagnostic': '诊断输出',
  'science.engine.fiji': 'Fiji / ImageJ',
  'science.engine.napari': 'napari',
  'science.engine.brainGlobe': 'BrainGlobe',
  'science.engine.hePython': 'HE Python',
  'science.engine.heStarDist': 'HE StarDist',
  'science.engine.remoteR': '远程 R',
  'science.engine.field.fijiDirectory': 'Fiji 目录或可执行文件',
  'science.engine.field.fijiJava': 'Fiji Java 可执行文件（可选）',
  'science.engine.field.napariPython': 'napari Python 或 napari.exe',
  'science.engine.placeholder.fijiDirectory': '例如 C:\\softworks\\Fiji',
  'science.engine.placeholder.fijiJava': '留空则使用 Fiji 自带 Java',
  'science.engine.placeholder.napariPython': 'python.exe、conda 环境或 napari.exe',
  'science.engine.brainGlobe.note': '托管图谱与 BrainGlobe 环境由 ZeroWall 管理的 Python 解释器运行；此引擎没有可手工填写的可执行文件，探测与安装由下方按钮触发。',
  'science.engine.installAtlas': '安装托管图谱',
  'science.engine.atlas.starting': '正在下载托管图谱 allen_mouse_25um，可能需要数分钟；期间其他 BrainGlobe 操作不可用。',
  'science.engine.atlas.finished': '托管图谱已就绪：{directory}',
  'science.engine.atlas': '托管图谱：{status} · {name} · {version} · {directory}',
  'science.engine.atlas.installed': '已安装',
  'science.engine.atlas.present': '已存在并复核',
  'science.engine.atlas.unknownVersion': '版本未返回',
  'science.engine.atlas.unknownDirectory': '目录未返回',
  'science.engine.saved': '{engine} 配置已保存。',
  'science.engine.probed': '{engine} 探测完成。',
  'science.engine.resetDone': '{engine} 已恢复默认。',
  'science.engine.unavailable.configs': '当前宿主尚未提供引擎配置接口。',
  'science.engine.unavailable.probe': '当前宿主尚未提供探测接口。',
  'science.engine.unavailable.atlas': '当前宿主尚未提供托管图谱安装接口。',
  'science.engine.unavailable.reset': '当前宿主尚未提供恢复默认接口。',
  'science.engine.source.project': '项目配置',
  'science.engine.source.user': '用户配置',
  'science.engine.source.environment': '环境变量',
  'science.engine.source.discovered': '自动发现',
  'science.engine.source.default': '默认值',
  'science.engine.status.unknown': '状态未探测',
  'science.engine.status.available': '可用',
  'science.engine.status.invalid': '不可用',
  'science.engine.status.degraded': '部分可用',
  'science.engine.unimplemented.title': '宿主尚未实现的引擎',
  'science.engine.unimplemented.badge': '暂不可配置',
  'science.engine.unimplemented.note': '宿主尚未为 {engine} 实现可执行文件解析，暂不可配置：这里不再提供无人读取的路径输入。',
  'science.engine.launch.title': '原生图像窗口',
  'science.engine.launch.note': '在本机窗口查看图像。切换工作台页面不会关闭原生窗口；请在原生工具中另存修改。',
  'science.engine.launch.asset': '图像资产',
  'science.engine.launch.blank': '启动空白窗口',
  'science.engine.launch.registeredAsset': '已登记资产',
  'science.engine.launch.fiji': '打开 Fiji',
  'science.engine.launch.napari': '打开 napari',
  'science.engine.launch.history': '原生引擎启动记录',
  'science.engine.launch.log': '启动日志',
  'science.engine.launch.starting': '正在启动',
  'science.engine.launch.spawned': '进程已启动，窗口待检查',
  'science.engine.launch.exited': '启动进程已退出',
  'science.engine.launch.failed': '进程失败',
  'science.engine.launch.unobserved': '窗口状态待核对',
  'science.shell.engine': '引擎设置',
  'science.shell.openFromConversation': '从对话打开',
  'science.shell.chooseFile': '选择文件',
  'science.shell.close': '关闭视图',
  'science.shell.composer.label': '工具助手消息',
  'science.shell.composer.placeholder': '告诉助手下一步…',
  'science.shell.composer.send': '发送到对话',
  'science.shell.status.hint': '工具标签、资产和任务状态会保留',
  'science.shell.overflowHint': '当前工具不在此标签行，可从更多工具进入。',

  'science.shell.home.tab': '主页',
  'science.shell.home.eyebrow': '工具中心',
  'science.shell.home.heading': '主页',
  'science.shell.home.asset': '从对话打开文件或结果',
  'science.shell.home.card1': '打开最近资产',
  'science.shell.home.card1Hint': '继续上次查看的文件',
  'science.shell.home.card2': '查看运行任务',
  'science.shell.home.card2Hint': '分析仍在运行时不要关闭视图',
  'science.shell.home.card3': '配置科研引擎',
  'science.shell.home.card3Hint': '统一设置 Fiji、napari 和远程引擎',
  'science.shell.home.emptyTitle': '工具工作区',
  'science.shell.home.emptyHint': '从对话打开文件、流程或分析产物，当前工具会在这里聚焦。',
  'science.shell.home.status': '等待对话或文件',
  'science.shell.home.statusHint': '工具标签、资产和任务状态会保留',

  'science.shell.imagej.tab': 'ImageJ',
  'science.shell.imagej.eyebrow': '图像助手',
  'science.shell.imagej.heading': 'ImageJ',
  'science.shell.imagej.asset': '尚未加载图像',
  'science.shell.imagej.card1': '反相 + 高斯模糊',
  'science.shell.imagej.card1Hint': '由对话提交 ImageJ 宏',
  'science.shell.imagej.card2': 'Otsu 阈值 + 颗粒分析',
  'science.shell.imagej.card2Hint': '保留 ROI、掩膜和原始参数',
  'science.shell.imagej.card3': '测量均值 / 最大 / 最小灰度',
  'science.shell.imagej.card3Hint': '结果回写当前对话',
  'science.shell.imagej.chips': 'TIFF · OME-TIFF · OME-Zarr · ROI',
  'science.shell.imagej.emptyTitle': '尚未加载图像',
  'science.shell.imagej.emptyHint': '从对话打开图像，或选择一个已登记资产。',
  'science.shell.imagej.status': '等待图像',
  'science.shell.imagej.statusHint': '对话调用 fijiWorkflow 后自动打开此标签',

  'science.shell.he.tab': 'HE 查看器',
  'science.shell.he.eyebrow': '切片助手',
  'science.shell.he.heading': 'HE 查看器',
  'science.shell.he.asset': '尚未加载切片',
  'science.shell.he.card1': '检测组织并展示叠加图',
  'science.shell.he.card1Hint': '保持原图与掩膜分离',
  'science.shell.he.card2': '生成 256 px 图块并统计',
  'science.shell.he.card2Hint': '按瓦片执行，不全量读入',
  'science.shell.he.card3': '运行 StarDist 核分割',
  'science.shell.he.card3Hint': '任务完成后显示结果叠加',
  'science.shell.he.chips': 'SVS · NDPI · 金字塔 TIFF · StarDist',
  'science.shell.he.emptyTitle': '尚未加载切片',
  'science.shell.he.emptyHint': '选择 SVS、NDPI 或金字塔 TIFF 文件开始查看。',
  'science.shell.he.status': '等待切片',
  'science.shell.he.statusHint': '支持局部读取、ROI 和核分割任务',

  'science.shell.molecule.tab': '分子结构',
  'science.shell.molecule.eyebrow': '结构助手',
  'science.shell.molecule.heading': '分子结构查看器',
  'science.shell.molecule.asset': '尚未加载结构',
  'science.shell.molecule.card1': '加载 PDB / mmCIF',
  'science.shell.molecule.card1Hint': '从 RCSB 或本地文件打开',
  'science.shell.molecule.card2': '测量两个原子距离',
  'science.shell.molecule.card2Hint': '结果写入当前消息引用',
  'science.shell.molecule.card3': '显示表面 / 导出 PNG',
  'science.shell.molecule.card3Hint': '保留结构版本和来源哈希',
  'science.shell.molecule.chips': 'PDB · mmCIF · SDF · Mol*',
  'science.shell.molecule.emptyTitle': '尚未加载结构',
  'science.shell.molecule.emptyHint': '从 RCSB 加载 PDB、上传结构文件，或选择一个示例。',
  'science.shell.molecule.status': '等待结构',
  'science.shell.molecule.statusHint': '测距、链筛选和对接任务均关联当前对话',

  'science.shell.sanger.tab': 'Sanger 峰图',
  'science.shell.sanger.eyebrow': '测序助手',
  'science.shell.sanger.heading': 'Sanger 峰图',
  'science.shell.sanger.asset': '尚未加载 AB1 / SCF',
  'science.shell.sanger.card1': '验证克隆',
  'science.shell.sanger.card1Hint': '对照 GenBank 或参考序列',
  'science.shell.sanger.card2': '取修剪后的序列',
  'science.shell.sanger.card2Hint': '质量未知区间保持标记',
  'science.shell.sanger.card3': '双向核对 / 解卷积',
  'science.shell.sanger.card3Hint': '冲突位置进入人工复核',
  'science.shell.sanger.chips': '四色峰 · 质量 · 双向核对 · 修订历史',
  'science.shell.sanger.emptyTitle': '尚未加载峰图',
  'science.shell.sanger.emptyHint': '从对话打开 AB1/SCF 文件开始检查四色峰。',
  'science.shell.sanger.status': '等待峰图',
  'science.shell.sanger.statusHint': '人工修订会创建新版本并保留原始信号',

  'science.shell.flow.tab': '流式细胞',
  'science.shell.flow.eyebrow': '流式助手',
  'science.shell.flow.heading': '流式细胞',
  'science.shell.flow.asset': '尚未加载 FCS',
  'science.shell.flow.card1': '按 FSC/SSC 框出细胞',
  'science.shell.flow.card1Hint': '创建标准矩形门',
  'science.shell.flow.card2': '创建完整门控策略',
  'science.shell.flow.card2Hint': '门控树和统计同步保存',
  'science.shell.flow.card3': '检查补偿矩阵',
  'science.shell.flow.card3Hint': '不支持的 FlowJo 语义明确拒绝',
  'science.shell.flow.chips': 'FCS · 补偿 · arcsinh · 分层门控',
  'science.shell.flow.emptyTitle': '尚未加载 FCS',
  'science.shell.flow.emptyHint': '选择 FCS 文件或从对话中打开一个流式资产。',
  'science.shell.flow.status': '等待 FCS',
  'science.shell.flow.statusHint': '批任务与单样本视图保持独立',

  'science.shell.canvas.tab': '画布',
  'science.shell.canvas.eyebrow': '图表助手',
  'science.shell.canvas.heading': '科研画布',
  'science.shell.canvas.asset': '尚未选择图表工程',
  'science.shell.canvas.card1': '导入分析结果',
  'science.shell.canvas.card1Hint': '从对话接收图表产物',
  'science.shell.canvas.card2': '添加到多面板',
  'science.shell.canvas.card2Hint': '保持来源资产和版本引用',
  'science.shell.canvas.card3': '导出出版文件',
  'science.shell.canvas.card3Hint': 'SVG、PNG、PDF 和 JSON',
  'science.shell.canvas.chips': '多面板 · 图像 · 比例尺 · SVG / PNG / PDF',
  'science.shell.canvas.emptyTitle': '尚未打开画布',
  'science.shell.canvas.emptyHint': '从分析结果或对话产物打开科研画布。',
  'science.shell.canvas.status': '等待图表或产物',
  'science.shell.canvas.statusHint': '来源、参数和导出版本会随工程保存',

  'science.shell.cells.tab': '细胞查看器',
  'science.shell.cells.eyebrow': 'ANNDATA 助手',
  'science.shell.cells.heading': '细胞查看器',
  'science.shell.cells.asset': '尚未加载 H5AD / AnnData',
  'science.shell.cells.card1': '加载数据',
  'science.shell.cells.card1Hint': '限制预览只影响显示，不改变原始数据',
  'science.shell.cells.card2': '运行 QC',
  'science.shell.cells.card2Hint': '记录参数和输入版本',
  'science.shell.cells.card3': '按基因查看表达',
  'science.shell.cells.card3Hint': '选择细胞后导出 CSV',
  'science.shell.cells.chips': 'UMAP · PCA · QC · marker · 细胞选择',
  'science.shell.cells.emptyTitle': '尚未加载 AnnData',
  'science.shell.cells.emptyHint': '选择 H5AD 文件或从对话打开细胞数据。',
  'science.shell.cells.status': '等待 AnnData',
  'science.shell.cells.statusHint': '当前选区可回写对话并进入后续分析',

  'science.shell.sequence.tab': 'Motif 序列工作台',
  'science.shell.sequence.eyebrow': '序列助手',
  'science.shell.sequence.heading': '序列工作台',
  'science.shell.sequence.asset': '尚未加载序列',
  'science.shell.sequence.card1': '打开 FASTA / GenBank',
  'science.shell.sequence.card1Hint': '从对话或本地文件载入记录',
  'science.shell.sequence.card2': '反向互补 / 翻译',
  'science.shell.sequence.card2Hint': '确定性计算并回写当前对话',
  'science.shell.sequence.card3': '酶切 / PCR / CRISPR 候选',
  'science.shell.sequence.card3Hint': '结果附带参数与版本',
  'science.shell.sequence.chips': 'FASTA · GenBank · 限制酶 · SpCas9',
  'science.shell.sequence.emptyTitle': '尚未加载序列',
  'science.shell.sequence.emptyHint': '从对话或本地文件打开 FASTA、GenBank 记录。',
  'science.shell.sequence.status': '等待序列',
  'science.shell.sequence.statusHint': '环形/线性注释图谱与计算参数随记录保存',

  'science.shell.brainglobe.tab': '脑图谱',
  'science.shell.brainglobe.eyebrow': '脑图谱助手',
  'science.shell.brainglobe.heading': '脑图谱',
  'science.shell.brainglobe.asset': '尚未加载脑图谱',
  'science.shell.brainglobe.card1': '查询脑区',
  'science.shell.brainglobe.card1Hint': '按 Allen 小鼠 25 µm 图谱匹配',
  'science.shell.brainglobe.card2': '映射细胞坐标',
  'science.shell.brainglobe.card2Hint': '脑区归属与半球判定',
  'science.shell.brainglobe.card3': '配准 / cellfinder',
  'science.shell.brainglobe.card3Hint': '结果保留来源图像哈希',
  'science.shell.brainglobe.chips': 'Allen 25 µm · 脑区查询 · 坐标映射 · 配准',
  'science.shell.brainglobe.emptyTitle': '尚未加载脑图谱',
  'science.shell.brainglobe.emptyHint': '安装托管图谱后，从对话打开脑切片或细胞坐标。',
  'science.shell.brainglobe.status': '等待脑图谱',
  'science.shell.brainglobe.statusHint': '配准与 cellfinder 任务会登记运行和产物',
} as const

const en: Record<keyof typeof zh, string> = {
  'science.shell.tablist': 'Professional tool tabs',
  'science.shell.more': 'More tools',
  'science.shell.analyse': 'Analyse in natural language',
  'science.engine.dialog.title': 'Engine settings',
  'science.engine.dialog.subtitle': 'Configure local native tools and remote engines. Every probe result comes from the Host, and an engine the Host has not verified is never shown as available.',
  'science.engine.dialog.intro': 'Paths resolve as project configuration, then user configuration, environment variables, auto-discovery and the built-in default; a project entry wins over the user entry for the same engine.',
  'science.engine.dialog.precedence': 'Unsaved edits are never written to the configuration.',
  'science.engine.close': 'Close',
  'science.engine.save': 'Save',
  'science.engine.test': 'Probe',
  'science.engine.reset': 'Restore default',
  'science.engine.advanced': 'Advanced',
  'science.engine.enabled': 'Enabled',
  'science.engine.working': 'Working…',
  'science.engine.diagnostic': 'Diagnostic output',
  'science.engine.fiji': 'Fiji / ImageJ',
  'science.engine.napari': 'napari',
  'science.engine.brainGlobe': 'BrainGlobe',
  'science.engine.hePython': 'HE Python',
  'science.engine.heStarDist': 'HE StarDist',
  'science.engine.remoteR': 'Remote R',
  'science.engine.field.fijiDirectory': 'Fiji directory or executable',
  'science.engine.field.fijiJava': 'Fiji Java executable (optional)',
  'science.engine.field.napariPython': 'napari Python or napari.exe',
  'science.engine.placeholder.fijiDirectory': 'for example C:\\softworks\\Fiji',
  'science.engine.placeholder.fijiJava': 'Leave empty to use the Java bundled with Fiji',
  'science.engine.placeholder.napariPython': 'python.exe, a conda environment, or napari.exe',
  'science.engine.brainGlobe.note': 'The managed atlas and the BrainGlobe environment run in the ZeroWall-managed Python interpreter, so this engine has no executable to type in; probing and installation are triggered by the buttons below.',
  'science.engine.installAtlas': 'Install managed atlas',
  'science.engine.atlas.starting': 'Downloading the managed atlas allen_mouse_25um; this can take several minutes and blocks other BrainGlobe operations meanwhile.',
  'science.engine.atlas.finished': 'Managed atlas is ready: {directory}',
  'science.engine.atlas': 'Managed atlas: {status} · {name} · {version} · {directory}',
  'science.engine.atlas.installed': 'installed',
  'science.engine.atlas.present': 'present and re-verified',
  'science.engine.atlas.unknownVersion': 'version not reported',
  'science.engine.atlas.unknownDirectory': 'directory not reported',
  'science.engine.saved': '{engine} configuration saved.',
  'science.engine.probed': '{engine} probe finished.',
  'science.engine.resetDone': '{engine} restored to its default.',
  'science.engine.unavailable.configs': 'This Host does not expose the engine configuration interface yet.',
  'science.engine.unavailable.probe': 'This Host does not expose an engine probe interface yet.',
  'science.engine.unavailable.atlas': 'This Host does not expose the managed atlas installer yet.',
  'science.engine.unavailable.reset': 'This Host does not expose a restore-default interface yet.',
  'science.engine.source.project': 'project configuration',
  'science.engine.source.user': 'user configuration',
  'science.engine.source.environment': 'environment variable',
  'science.engine.source.discovered': 'auto-discovered',
  'science.engine.source.default': 'built-in default',
  'science.engine.status.unknown': 'not probed',
  'science.engine.status.available': 'available',
  'science.engine.status.invalid': 'unavailable',
  'science.engine.status.degraded': 'partially available',
  'science.engine.unimplemented.title': 'Engines the Host does not implement yet',
  'science.engine.unimplemented.badge': 'not configurable yet',
  'science.engine.unimplemented.note': 'The Host has no executable resolution for {engine} yet, so it cannot be configured: this panel deliberately shows no path input that nothing would read.',
  'science.engine.launch.title': 'Native image windows',
  'science.engine.launch.note': 'View images in a local window. Switching workbench pages does not close a native window; save your edits inside the native tool.',
  'science.engine.launch.asset': 'Image asset',
  'science.engine.launch.blank': 'Open a blank window',
  'science.engine.launch.registeredAsset': 'registered asset',
  'science.engine.launch.fiji': 'Open Fiji',
  'science.engine.launch.napari': 'Open napari',
  'science.engine.launch.history': 'Native engine launches',
  'science.engine.launch.log': 'Launch log',
  'science.engine.launch.starting': 'starting',
  'science.engine.launch.spawned': 'process started, window unchecked',
  'science.engine.launch.exited': 'launcher exited',
  'science.engine.launch.failed': 'process failed',
  'science.engine.launch.unobserved': 'window state unverified',
  'science.shell.engine': 'Engine settings',
  'science.shell.openFromConversation': 'Open from conversation',
  'science.shell.chooseFile': 'Choose file',
  'science.shell.close': 'Close view',
  'science.shell.composer.label': 'Tool assistant message',
  'science.shell.composer.placeholder': 'Tell the assistant what to do next…',
  'science.shell.composer.send': 'Send to conversation',
  'science.shell.status.hint': 'Tool tabs, assets and task state are retained',
  'science.shell.overflowHint': 'This tool is outside the tab row; reach it through More tools.',

  'science.shell.home.tab': 'Home',
  'science.shell.home.eyebrow': 'Tool center',
  'science.shell.home.heading': 'Home',
  'science.shell.home.asset': 'Open a file or result from the conversation',
  'science.shell.home.card1': 'Open a recent asset',
  'science.shell.home.card1Hint': 'Continue the file you viewed last',
  'science.shell.home.card2': 'View running tasks',
  'science.shell.home.card2Hint': 'Keep this view open while analysis runs',
  'science.shell.home.card3': 'Configure science engines',
  'science.shell.home.card3Hint': 'Set up Fiji, napari and remote engines in one place',
  'science.shell.home.emptyTitle': 'Tool workspace',
  'science.shell.home.emptyHint': 'Open a file, workflow or analysis artifact from the conversation; the active tool focuses here.',
  'science.shell.home.status': 'Waiting for the conversation or a file',
  'science.shell.home.statusHint': 'Tool tabs, assets and task state are retained',

  'science.shell.imagej.tab': 'ImageJ',
  'science.shell.imagej.eyebrow': 'Image assistant',
  'science.shell.imagej.heading': 'ImageJ',
  'science.shell.imagej.asset': 'No image loaded',
  'science.shell.imagej.card1': 'Invert + Gaussian blur',
  'science.shell.imagej.card1Hint': 'Submit an ImageJ macro from the conversation',
  'science.shell.imagej.card2': 'Otsu threshold + particle analysis',
  'science.shell.imagej.card2Hint': 'Keeps ROIs, masks and the original parameters',
  'science.shell.imagej.card3': 'Measure mean / max / min grey',
  'science.shell.imagej.card3Hint': 'Results write back into the current conversation',
  'science.shell.imagej.chips': 'TIFF · OME-TIFF · OME-Zarr · ROI',
  'science.shell.imagej.emptyTitle': 'No image loaded',
  'science.shell.imagej.emptyHint': 'Open an image from the conversation, or pick a registered asset.',
  'science.shell.imagej.status': 'Waiting for an image',
  'science.shell.imagej.statusHint': 'Opens this tab automatically after fijiWorkflow runs in the conversation',

  'science.shell.he.tab': 'HE viewer',
  'science.shell.he.eyebrow': 'Slide assistant',
  'science.shell.he.heading': 'HE viewer',
  'science.shell.he.asset': 'No slide loaded',
  'science.shell.he.card1': 'Detect tissue and show the overlay',
  'science.shell.he.card1Hint': 'Keeps the source image and mask separate',
  'science.shell.he.card2': 'Generate 256 px tiles and count',
  'science.shell.he.card2Hint': 'Runs tile by tile without reading everything',
  'science.shell.he.card3': 'Run StarDist nucleus segmentation',
  'science.shell.he.card3Hint': 'Shows the result overlay once the task finishes',
  'science.shell.he.chips': 'SVS · NDPI · pyramid TIFF · StarDist',
  'science.shell.he.emptyTitle': 'No slide loaded',
  'science.shell.he.emptyHint': 'Choose an SVS, NDPI or pyramid TIFF file to start viewing.',
  'science.shell.he.status': 'Waiting for a slide',
  'science.shell.he.statusHint': 'Supports region reads, ROIs and nucleus segmentation tasks',

  'science.shell.molecule.tab': 'Molecule',
  'science.shell.molecule.eyebrow': 'Structure assistant',
  'science.shell.molecule.heading': 'Molecule structure viewer',
  'science.shell.molecule.asset': 'No structure loaded',
  'science.shell.molecule.card1': 'Load PDB / mmCIF',
  'science.shell.molecule.card1Hint': 'Open from RCSB or a local file',
  'science.shell.molecule.card2': 'Measure the distance between two atoms',
  'science.shell.molecule.card2Hint': 'The result is written into the current message reference',
  'science.shell.molecule.card3': 'Show surface / export PNG',
  'science.shell.molecule.card3Hint': 'Keeps the structure version and source hash',
  'science.shell.molecule.chips': 'PDB · mmCIF · SDF · Mol*',
  'science.shell.molecule.emptyTitle': 'No structure loaded',
  'science.shell.molecule.emptyHint': 'Load a PDB from RCSB, upload a structure file, or pick an example.',
  'science.shell.molecule.status': 'Waiting for a structure',
  'science.shell.molecule.statusHint': 'Distance measurement, chain filters and docking stay linked to this conversation',

  'science.shell.sanger.tab': 'Sanger trace',
  'science.shell.sanger.eyebrow': 'Sequencing assistant',
  'science.shell.sanger.heading': 'Sanger trace',
  'science.shell.sanger.asset': 'No AB1 / SCF loaded',
  'science.shell.sanger.card1': 'Validate the clone',
  'science.shell.sanger.card1Hint': 'Against GenBank or a reference sequence',
  'science.shell.sanger.card2': 'Take the trimmed sequence',
  'science.shell.sanger.card2Hint': 'Unknown-quality regions stay flagged',
  'science.shell.sanger.card3': 'Bidirectional check / deconvolution',
  'science.shell.sanger.card3Hint': 'Conflicting positions go to manual review',
  'science.shell.sanger.chips': 'Four-colour trace · quality · bidirectional check · revision history',
  'science.shell.sanger.emptyTitle': 'No trace loaded',
  'science.shell.sanger.emptyHint': 'Open an AB1/SCF file from the conversation to inspect the four-colour trace.',
  'science.shell.sanger.status': 'Waiting for a trace',
  'science.shell.sanger.statusHint': 'Manual revisions create a new version and keep the original signal',

  'science.shell.flow.tab': 'Flow cytometry',
  'science.shell.flow.eyebrow': 'Flow assistant',
  'science.shell.flow.heading': 'Flow cytometry',
  'science.shell.flow.asset': 'No FCS loaded',
  'science.shell.flow.card1': 'Gate cells on FSC/SSC',
  'science.shell.flow.card1Hint': 'Creates a standard rectangular gate',
  'science.shell.flow.card2': 'Build a full gating strategy',
  'science.shell.flow.card2Hint': 'The gate tree and statistics are saved together',
  'science.shell.flow.card3': 'Inspect the compensation matrix',
  'science.shell.flow.card3Hint': 'Unsupported FlowJo semantics are rejected explicitly',
  'science.shell.flow.chips': 'FCS · compensation · arcsinh · hierarchical gating',
  'science.shell.flow.emptyTitle': 'No FCS loaded',
  'science.shell.flow.emptyHint': 'Choose an FCS file or open a flow asset from the conversation.',
  'science.shell.flow.status': 'Waiting for FCS',
  'science.shell.flow.statusHint': 'Batch tasks and the single-sample view stay independent',

  'science.shell.canvas.tab': 'Canvas',
  'science.shell.canvas.eyebrow': 'Figure assistant',
  'science.shell.canvas.heading': 'Science canvas',
  'science.shell.canvas.asset': 'No figure project selected',
  'science.shell.canvas.card1': 'Import analysis results',
  'science.shell.canvas.card1Hint': 'Receives figure artifacts from the conversation',
  'science.shell.canvas.card2': 'Add to a multi-panel layout',
  'science.shell.canvas.card2Hint': 'Keeps source asset and version references',
  'science.shell.canvas.card3': 'Export publication files',
  'science.shell.canvas.card3Hint': 'SVG, PNG, PDF and JSON',
  'science.shell.canvas.chips': 'Multi-panel · images · scale bars · SVG / PNG / PDF',
  'science.shell.canvas.emptyTitle': 'No canvas open',
  'science.shell.canvas.emptyHint': 'Open the science canvas from an analysis result or conversation artifact.',
  'science.shell.canvas.status': 'Waiting for a figure or artifact',
  'science.shell.canvas.statusHint': 'Sources, parameters and export versions are saved with the project',

  'science.shell.cells.tab': 'Cell viewer',
  'science.shell.cells.eyebrow': 'ANNDATA assistant',
  'science.shell.cells.heading': 'Cell viewer',
  'science.shell.cells.asset': 'No H5AD / AnnData loaded',
  'science.shell.cells.card1': 'Load data',
  'science.shell.cells.card1Hint': 'Preview limits affect the display only, never the source data',
  'science.shell.cells.card2': 'Run QC',
  'science.shell.cells.card2Hint': 'Records parameters and input versions',
  'science.shell.cells.card3': 'View expression by gene',
  'science.shell.cells.card3Hint': 'Export CSV after selecting cells',
  'science.shell.cells.chips': 'UMAP · PCA · QC · marker · cell selection',
  'science.shell.cells.emptyTitle': 'No AnnData loaded',
  'science.shell.cells.emptyHint': 'Choose an H5AD file or open cell data from the conversation.',
  'science.shell.cells.status': 'Waiting for AnnData',
  'science.shell.cells.statusHint': 'The current selection writes back into the conversation and feeds later analysis',

  'science.shell.sequence.tab': 'Motif sequence workbench',
  'science.shell.sequence.eyebrow': 'Sequence assistant',
  'science.shell.sequence.heading': 'Sequence workbench',
  'science.shell.sequence.asset': 'No sequence loaded',
  'science.shell.sequence.card1': 'Open FASTA / GenBank',
  'science.shell.sequence.card1Hint': 'Load records from the conversation or a local file',
  'science.shell.sequence.card2': 'Reverse complement / translate',
  'science.shell.sequence.card2Hint': 'Deterministic compute, written back into the current conversation',
  'science.shell.sequence.card3': 'Digest / PCR / CRISPR candidates',
  'science.shell.sequence.card3Hint': 'Results carry their parameters and version',
  'science.shell.sequence.chips': 'FASTA · GenBank · restriction enzymes · SpCas9',
  'science.shell.sequence.emptyTitle': 'No sequence loaded',
  'science.shell.sequence.emptyHint': 'Open a FASTA or GenBank record from the conversation or a local file.',
  'science.shell.sequence.status': 'Waiting for a sequence',
  'science.shell.sequence.statusHint': 'Circular/linear annotation maps and compute parameters are saved with the record',

  'science.shell.brainglobe.tab': 'Brain atlas',
  'science.shell.brainglobe.eyebrow': 'Brain atlas assistant',
  'science.shell.brainglobe.heading': 'Brain atlas',
  'science.shell.brainglobe.asset': 'No atlas loaded',
  'science.shell.brainglobe.card1': 'Query a brain region',
  'science.shell.brainglobe.card1Hint': 'Matches the Allen mouse 25 µm atlas',
  'science.shell.brainglobe.card2': 'Map cell coordinates',
  'science.shell.brainglobe.card2Hint': 'Region assignment and hemisphere',
  'science.shell.brainglobe.card3': 'Registration / cellfinder',
  'science.shell.brainglobe.card3Hint': 'Results keep the source image hash',
  'science.shell.brainglobe.chips': 'Allen 25 µm · region query · coordinate mapping · registration',
  'science.shell.brainglobe.emptyTitle': 'No atlas loaded',
  'science.shell.brainglobe.emptyHint': 'Install the managed atlas, then open a brain slice or cell coordinates from the conversation.',
  'science.shell.brainglobe.status': 'Waiting for the atlas',
  'science.shell.brainglobe.statusHint': 'Registration and cellfinder tasks register their runs and artifacts',
}

export { en as workbenchEn, zh as workbenchZh }
export const WORKBENCH_LOCALES = { zh, en } as const

/** Every key the workbench shell paints; spread both dictionaries into the desktop bag. */
export type WorkbenchLocaleKey = keyof typeof zh

export type WorkbenchTranslate = (key: WorkbenchLocaleKey, params?: Record<string, unknown>) => string

/**
 * Fallback resolver used when the host locale bag has not been extended yet.
 * `{name}` placeholders follow the same convention as `plugins/base`.
 */
export function translateWorkbench(locale: 'zh' | 'en', key: WorkbenchLocaleKey, params?: Record<string, unknown>): string {
  const dictionary: Record<string, string> = locale === 'en' ? en : zh
  let value = dictionary[key] ?? key
  for (const [name, replacement] of Object.entries(params ?? {})) value = value.replaceAll(`{${name}}`, String(replacement))
  return value
}

/** Default resolver: Chinese is the product default, matching the locale bag. */
export const defaultWorkbenchTranslate: WorkbenchTranslate = (key, params) => translateWorkbench('zh', key, params)

/** Icon component shape shared by tabs, the asset row and the empty state (lucide). */
export type WorkbenchIcon = LucideIcon

/**
 * Stable ids a card hands back to the parent through `onAction('action', target)`.
 * They are deliberately coarse: the parent owns what opening an asset or a file
 * picker actually means for the current session.
 */
export type ToolActionTarget =
  /** Pick from registered assets (conversation-backed). */
  | 'open-asset'
  /** Pick a file from disk. */
  | 'pick-file'
  /** Focus running/queued tasks. */
  | 'run-task'
  /** Open the science engine settings dialog. */
  | 'engine-settings'
  /** Export the active artifact. */
  | 'export'

/** A card's scroll payload: either conversation text or a parent-handled action. */
export type ToolAction = { label: string; hint: string } & (
  | { kind: 'prompt'; prompt: string }
  | { kind: 'action'; target: ToolActionTarget }
)

/** Locale-keyed form of {@link ToolAction}; resolved by {@link toolActions}. */
export type ToolActionSpec = { labelKey: WorkbenchLocaleKey; hintKey: WorkbenchLocaleKey } & (
  | { kind: 'prompt' }
  | { kind: 'action'; target: ToolActionTarget }
)

export type WorkbenchToolDescriptor = {
  id: ScienceToolId
  /** Primary tabs follow the screenshot order; `more` tools stay reachable after the group label. */
  group: 'primary' | 'more'
  icon: WorkbenchIcon
  tabKey: WorkbenchLocaleKey
  eyebrowKey: WorkbenchLocaleKey
  headingKey: WorkbenchLocaleKey
  assetKey: WorkbenchLocaleKey
  /** Format chips; the home tab has none. */
  chipsKey?: WorkbenchLocaleKey
  emptyTitleKey: WorkbenchLocaleKey
  emptyHintKey: WorkbenchLocaleKey
  statusKey: WorkbenchLocaleKey
  statusHintKey: WorkbenchLocaleKey
  actions: readonly ToolActionSpec[]
}

/**
 * The eight screenshot tabs first, then the two tools that exist in
 * `ScienceToolId` but are absent from the screenshot row.  They stay real tabs
 * (never removed) and sit behind the 更多工具 group label.
 */
export const WORKBENCH_TOOLS: readonly WorkbenchToolDescriptor[] = [
  {
    id: 'home', group: 'primary', icon: House,
    tabKey: 'science.shell.home.tab', eyebrowKey: 'science.shell.home.eyebrow', headingKey: 'science.shell.home.heading', assetKey: 'science.shell.home.asset',
    emptyTitleKey: 'science.shell.home.emptyTitle', emptyHintKey: 'science.shell.home.emptyHint', statusKey: 'science.shell.home.status', statusHintKey: 'science.shell.home.statusHint',
    actions: [
      { kind: 'action', target: 'open-asset', labelKey: 'science.shell.home.card1', hintKey: 'science.shell.home.card1Hint' },
      { kind: 'action', target: 'run-task', labelKey: 'science.shell.home.card2', hintKey: 'science.shell.home.card2Hint' },
      { kind: 'action', target: 'engine-settings', labelKey: 'science.shell.home.card3', hintKey: 'science.shell.home.card3Hint' },
    ],
  },
  {
    id: 'imagej', group: 'primary', icon: Image,
    tabKey: 'science.shell.imagej.tab', eyebrowKey: 'science.shell.imagej.eyebrow', headingKey: 'science.shell.imagej.heading', assetKey: 'science.shell.imagej.asset', chipsKey: 'science.shell.imagej.chips',
    emptyTitleKey: 'science.shell.imagej.emptyTitle', emptyHintKey: 'science.shell.imagej.emptyHint', statusKey: 'science.shell.imagej.status', statusHintKey: 'science.shell.imagej.statusHint',
    actions: [
      { kind: 'prompt', labelKey: 'science.shell.imagej.card1', hintKey: 'science.shell.imagej.card1Hint' },
      { kind: 'prompt', labelKey: 'science.shell.imagej.card2', hintKey: 'science.shell.imagej.card2Hint' },
      { kind: 'prompt', labelKey: 'science.shell.imagej.card3', hintKey: 'science.shell.imagej.card3Hint' },
    ],
  },
  {
    id: 'he', group: 'primary', icon: Microscope,
    tabKey: 'science.shell.he.tab', eyebrowKey: 'science.shell.he.eyebrow', headingKey: 'science.shell.he.heading', assetKey: 'science.shell.he.asset', chipsKey: 'science.shell.he.chips',
    emptyTitleKey: 'science.shell.he.emptyTitle', emptyHintKey: 'science.shell.he.emptyHint', statusKey: 'science.shell.he.status', statusHintKey: 'science.shell.he.statusHint',
    actions: [
      { kind: 'prompt', labelKey: 'science.shell.he.card1', hintKey: 'science.shell.he.card1Hint' },
      { kind: 'prompt', labelKey: 'science.shell.he.card2', hintKey: 'science.shell.he.card2Hint' },
      { kind: 'prompt', labelKey: 'science.shell.he.card3', hintKey: 'science.shell.he.card3Hint' },
    ],
  },
  {
    id: 'molecule', group: 'primary', icon: Atom,
    tabKey: 'science.shell.molecule.tab', eyebrowKey: 'science.shell.molecule.eyebrow', headingKey: 'science.shell.molecule.heading', assetKey: 'science.shell.molecule.asset', chipsKey: 'science.shell.molecule.chips',
    emptyTitleKey: 'science.shell.molecule.emptyTitle', emptyHintKey: 'science.shell.molecule.emptyHint', statusKey: 'science.shell.molecule.status', statusHintKey: 'science.shell.molecule.statusHint',
    actions: [
      { kind: 'action', target: 'open-asset', labelKey: 'science.shell.molecule.card1', hintKey: 'science.shell.molecule.card1Hint' },
      { kind: 'prompt', labelKey: 'science.shell.molecule.card2', hintKey: 'science.shell.molecule.card2Hint' },
      { kind: 'prompt', labelKey: 'science.shell.molecule.card3', hintKey: 'science.shell.molecule.card3Hint' },
    ],
  },
  {
    id: 'sanger', group: 'primary', icon: Activity,
    tabKey: 'science.shell.sanger.tab', eyebrowKey: 'science.shell.sanger.eyebrow', headingKey: 'science.shell.sanger.heading', assetKey: 'science.shell.sanger.asset', chipsKey: 'science.shell.sanger.chips',
    emptyTitleKey: 'science.shell.sanger.emptyTitle', emptyHintKey: 'science.shell.sanger.emptyHint', statusKey: 'science.shell.sanger.status', statusHintKey: 'science.shell.sanger.statusHint',
    actions: [
      { kind: 'prompt', labelKey: 'science.shell.sanger.card1', hintKey: 'science.shell.sanger.card1Hint' },
      { kind: 'prompt', labelKey: 'science.shell.sanger.card2', hintKey: 'science.shell.sanger.card2Hint' },
      { kind: 'prompt', labelKey: 'science.shell.sanger.card3', hintKey: 'science.shell.sanger.card3Hint' },
    ],
  },
  {
    id: 'flow', group: 'primary', icon: Droplet,
    tabKey: 'science.shell.flow.tab', eyebrowKey: 'science.shell.flow.eyebrow', headingKey: 'science.shell.flow.heading', assetKey: 'science.shell.flow.asset', chipsKey: 'science.shell.flow.chips',
    emptyTitleKey: 'science.shell.flow.emptyTitle', emptyHintKey: 'science.shell.flow.emptyHint', statusKey: 'science.shell.flow.status', statusHintKey: 'science.shell.flow.statusHint',
    actions: [
      { kind: 'prompt', labelKey: 'science.shell.flow.card1', hintKey: 'science.shell.flow.card1Hint' },
      { kind: 'prompt', labelKey: 'science.shell.flow.card2', hintKey: 'science.shell.flow.card2Hint' },
      { kind: 'prompt', labelKey: 'science.shell.flow.card3', hintKey: 'science.shell.flow.card3Hint' },
    ],
  },
  {
    id: 'canvas', group: 'primary', icon: LayoutPanelLeft,
    tabKey: 'science.shell.canvas.tab', eyebrowKey: 'science.shell.canvas.eyebrow', headingKey: 'science.shell.canvas.heading', assetKey: 'science.shell.canvas.asset', chipsKey: 'science.shell.canvas.chips',
    emptyTitleKey: 'science.shell.canvas.emptyTitle', emptyHintKey: 'science.shell.canvas.emptyHint', statusKey: 'science.shell.canvas.status', statusHintKey: 'science.shell.canvas.statusHint',
    actions: [
      { kind: 'action', target: 'open-asset', labelKey: 'science.shell.canvas.card1', hintKey: 'science.shell.canvas.card1Hint' },
      { kind: 'prompt', labelKey: 'science.shell.canvas.card2', hintKey: 'science.shell.canvas.card2Hint' },
      { kind: 'action', target: 'export', labelKey: 'science.shell.canvas.card3', hintKey: 'science.shell.canvas.card3Hint' },
    ],
  },
  {
    id: 'cells', group: 'primary', icon: Fingerprint,
    tabKey: 'science.shell.cells.tab', eyebrowKey: 'science.shell.cells.eyebrow', headingKey: 'science.shell.cells.heading', assetKey: 'science.shell.cells.asset', chipsKey: 'science.shell.cells.chips',
    emptyTitleKey: 'science.shell.cells.emptyTitle', emptyHintKey: 'science.shell.cells.emptyHint', statusKey: 'science.shell.cells.status', statusHintKey: 'science.shell.cells.statusHint',
    actions: [
      { kind: 'action', target: 'open-asset', labelKey: 'science.shell.cells.card1', hintKey: 'science.shell.cells.card1Hint' },
      { kind: 'prompt', labelKey: 'science.shell.cells.card2', hintKey: 'science.shell.cells.card2Hint' },
      { kind: 'prompt', labelKey: 'science.shell.cells.card3', hintKey: 'science.shell.cells.card3Hint' },
    ],
  },
  {
    id: 'sequence', group: 'more', icon: Dna,
    tabKey: 'science.shell.sequence.tab', eyebrowKey: 'science.shell.sequence.eyebrow', headingKey: 'science.shell.sequence.heading', assetKey: 'science.shell.sequence.asset', chipsKey: 'science.shell.sequence.chips',
    emptyTitleKey: 'science.shell.sequence.emptyTitle', emptyHintKey: 'science.shell.sequence.emptyHint', statusKey: 'science.shell.sequence.status', statusHintKey: 'science.shell.sequence.statusHint',
    actions: [
      { kind: 'action', target: 'open-asset', labelKey: 'science.shell.sequence.card1', hintKey: 'science.shell.sequence.card1Hint' },
      { kind: 'prompt', labelKey: 'science.shell.sequence.card2', hintKey: 'science.shell.sequence.card2Hint' },
      { kind: 'prompt', labelKey: 'science.shell.sequence.card3', hintKey: 'science.shell.sequence.card3Hint' },
    ],
  },
  {
    id: 'brainglobe', group: 'more', icon: Brain,
    tabKey: 'science.shell.brainglobe.tab', eyebrowKey: 'science.shell.brainglobe.eyebrow', headingKey: 'science.shell.brainglobe.heading', assetKey: 'science.shell.brainglobe.asset', chipsKey: 'science.shell.brainglobe.chips',
    emptyTitleKey: 'science.shell.brainglobe.emptyTitle', emptyHintKey: 'science.shell.brainglobe.emptyHint', statusKey: 'science.shell.brainglobe.status', statusHintKey: 'science.shell.brainglobe.statusHint',
    actions: [
      { kind: 'prompt', labelKey: 'science.shell.brainglobe.card1', hintKey: 'science.shell.brainglobe.card1Hint' },
      { kind: 'prompt', labelKey: 'science.shell.brainglobe.card2', hintKey: 'science.shell.brainglobe.card2Hint' },
      { kind: 'prompt', labelKey: 'science.shell.brainglobe.card3', hintKey: 'science.shell.brainglobe.card3Hint' },
    ],
  },
]

export const PRIMARY_TABS: readonly WorkbenchToolDescriptor[] = WORKBENCH_TOOLS.filter(tool => tool.group === 'primary')
export const MORE_TABS: readonly WorkbenchToolDescriptor[] = WORKBENCH_TOOLS.filter(tool => tool.group === 'more')

/** Descriptor lookup; falls back to the home card so an unknown id cannot blank the shell. */
export function toolDescriptor(tool: ScienceToolId): WorkbenchToolDescriptor {
  return WORKBENCH_TOOLS.find(item => item.id === tool) ?? WORKBENCH_TOOLS[0]!
}

/** Resolve a card's actions into painted copy plus their scroll payload. */
export function toolActions(tool: ScienceToolId, t: WorkbenchTranslate = defaultWorkbenchTranslate): ToolAction[] {
  return toolDescriptor(tool).actions.map(spec => {
    const label = t(spec.labelKey)
    const hint = t(spec.hintKey)
    // A prompt card sends its primary line as the instruction; the hint stays
    // descriptive so the copy can be reworded without changing what is sent.
    return spec.kind === 'prompt' ? { kind: 'prompt', label, hint, prompt: label } : { kind: 'action', target: spec.target, label, hint }
  })
}

/**
 * Every tab the workbench can focus, including `home`. It is spelled locally
 * (rather than imported from `view.tsx`) so the descriptor table stays the
 * bottom of the import graph and cannot form a cycle with its consumer.
 */
export type WorkbenchTabId = ScienceToolId

/**
 * The action vocabulary `view.tsx#runAction` honours. Anything outside this set
 * is a deliberate no-op, so a card that cannot express itself here must be
 * re-authored rather than filtered at the shell.
 */
export type WorkbenchActionValue =
  | 'overview' | 'data' | 'plan' | 'evidence' | 'report'
  | 'engine-settings' | 'refresh' | 'register-workspace' | 'pick-file' | 'open-from-conversation'

/** A painted card plus the payload the shell hands back through `onAction`. */
export type WorkbenchCard = { key: string; label: string; hint: string } & (
  | { kind: 'prompt'; value: string }
  | { kind: 'action'; value: WorkbenchActionValue }
)

/**
 * The resolved shape the shell paints. Strings, not locale keys, because the
 * shell has no locale service of its own: resolution happens here, once, against
 * the embedded dictionary.
 */
export type WorkbenchDescriptor = {
  eyebrow: string
  heading: string
  asset: string
  /** Format chips; the home tab has none. */
  chips?: string
  emptyTitle: string
  emptyHint: string
  status: string
  statusHint: string
  cards: readonly WorkbenchCard[]
}

/**
 * A card target is authored in UI terms (open an asset, focus the task graph),
 * while the parent only accepts its own destinations. The two are kept apart so
 * neither side has to know the other's vocabulary.
 */
const ACTION_BY_TARGET: Record<ToolActionTarget, WorkbenchActionValue> = {
  // Registered assets are picked on the data page, beside the conversation
  // references and the document registry that describe them.
  'open-asset': 'pick-file',
  'pick-file': 'pick-file',
  // The task graph lives on the plan page; running tasks are inspected there.
  'run-task': 'plan',
  'engine-settings': 'engine-settings',
  // Export is a report-page delivery, so it routes there rather than to a
  // dialog the parent does not open.
  export: 'report',
}

function toDescriptor(tool: WorkbenchToolDescriptor, t: WorkbenchTranslate): WorkbenchDescriptor {
  return {
    eyebrow: t(tool.eyebrowKey),
    heading: t(tool.headingKey),
    asset: t(tool.assetKey),
    // Spread rather than assign: `exactOptionalPropertyTypes` forbids writing an
    // explicit `undefined` into an absent optional field.
    ...(tool.chipsKey ? { chips: t(tool.chipsKey) } : {}),
    emptyTitle: t(tool.emptyTitleKey),
    emptyHint: t(tool.emptyHintKey),
    status: t(tool.statusKey),
    statusHint: t(tool.statusHintKey),
    cards: toolActions(tool.id, t).map((action, index): WorkbenchCard => action.kind === 'prompt'
      ? { key: `${tool.id}:${index}`, kind: 'prompt', value: action.prompt, label: action.label, hint: action.hint }
      : { key: `${tool.id}:${index}`, kind: 'action', value: ACTION_BY_TARGET[action.target], label: action.label, hint: action.hint }),
  }
}

/**
 * The table the workbench shell paints, keyed by every {@link WorkbenchTabId}
 * (the eight screenshot tabs plus the two overflow tools plus `home`). Built
 * from {@link WORKBENCH_TOOLS} so the copy above stays the single source.
 */
export const toolDescriptors: Record<WorkbenchTabId, WorkbenchDescriptor> = Object.fromEntries(
  WORKBENCH_TOOLS.map(tool => [tool.id, toDescriptor(tool, defaultWorkbenchTranslate)]),
) as Record<WorkbenchTabId, WorkbenchDescriptor>
