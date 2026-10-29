import type { ScienceToolId } from '../shared/conversation.js'
import cellsImage from './assets/cells.png?inline'
import imagejImage from './assets/imagej.png?inline'
import heImage from './assets/he.png?inline'
import moleculeImage from './assets/molecule.png?inline'
import sequenceImage from './assets/sequence.png?inline'
import sangerImage from './assets/sanger.png?inline'
import flowImage from './assets/flow.png?inline'
import canvasImage from './assets/canvas.png?inline'
import brainglobeImage from './assets/brainglobe.png?inline'

export type ResearchToolDescriptor = {
  id: Exclude<ScienceToolId, 'home'>
  title: string
  description: string
  image: string
  acceptedExtensions: string[]
  viewerRoute: string
  skillId: string
}

export const RESEARCH_TOOL_DESCRIPTORS: readonly ResearchToolDescriptor[] = [
  { id: 'cells', title: '细胞查看器', description: '浏览单细胞数据与细胞分布', image: cellsImage, acceptedExtensions: ['.h5ad'], viewerRoute: 'cells', skillId: 'zerowall-cells' },
  { id: 'imagej', title: 'ImageJ 图像', description: '查看显微图像与多页 TIFF', image: imagejImage, acceptedExtensions: ['.png', '.jpg', '.jpeg', '.pgm', '.tif', '.tiff'], viewerRoute: 'imagej', skillId: 'zerowall-fiji' },
  { id: 'he', title: 'HE 切片', description: '浏览病理切片与金字塔图层', image: heImage, acceptedExtensions: ['.svs', '.ndpi', '.tif', '.tiff'], viewerRoute: 'he', skillId: 'zerowall-he' },
  { id: 'molecule', title: '分子结构', description: '查看分子结构与三维构象', image: moleculeImage, acceptedExtensions: ['.pdb', '.cif', '.mmcif', '.sdf'], viewerRoute: 'molecule', skillId: 'zerowall-molecule-viewer' },
  { id: 'sequence', title: '序列/Motif', description: '浏览核酸序列与注释', image: sequenceImage, acceptedExtensions: ['.fa', '.fasta', '.fna', '.ffn', '.frn', '.gb', '.gbk'], viewerRoute: 'sequence', skillId: 'zerowall-sequence' },
  { id: 'sanger', title: 'Sanger 峰图', description: '查看测序峰图与碱基读段', image: sangerImage, acceptedExtensions: ['.scf', '.ab1'], viewerRoute: 'sanger', skillId: 'zerowall-sanger' },
  { id: 'flow', title: '流式细胞', description: '浏览 FCS 事件与通道分布', image: flowImage, acceptedExtensions: ['.fcs'], viewerRoute: 'flow', skillId: 'zerowall-flow' },
  { id: 'canvas', title: '科研画布', description: '查看科研图板与标注结果', image: canvasImage, acceptedExtensions: [], viewerRoute: 'canvas', skillId: 'zerowall-science-canvas' },
  { id: 'brainglobe', title: '脑图谱', description: '浏览脑区与图谱切面', image: brainglobeImage, acceptedExtensions: [], viewerRoute: 'brainglobe', skillId: 'zerowall-brainglobe' },
]

/**
 * Shared locale strings for research viewers and engine settings.
 */
const zh = {
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
  'science.engine.field.napariPython': 'ZeroWall 共享 Python',
  'science.engine.placeholder.fijiDirectory': '例如 C:\\softworks\\Fiji',
  'science.engine.placeholder.fijiJava': '留空则使用 Fiji 自带 Java',
  'science.engine.placeholder.napariPython': '由 ZeroWall Science 管理；不可切换为其他解释器',
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
  'science.engine.launch.note': '在本机窗口查看图像。切换查看器不会关闭原生窗口；请在原生工具中另存修改。',
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










} as const

const en: Record<keyof typeof zh, string> = {
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
  'science.engine.field.napariPython': 'ZeroWall shared Python',
  'science.engine.placeholder.fijiDirectory': 'for example C:\\softworks\\Fiji',
  'science.engine.placeholder.fijiJava': 'Leave empty to use the Java bundled with Fiji',
  'science.engine.placeholder.napariPython': 'Managed by ZeroWall Science; alternate interpreters are not supported',
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
  'science.engine.launch.note': 'View images in a local window. Switching viewers does not close a native window; save your edits inside the native tool.',
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










}

export const SCIENCE_LOCALES = { zh, en } as const
