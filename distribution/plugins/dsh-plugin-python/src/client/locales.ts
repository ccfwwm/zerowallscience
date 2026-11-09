/** Typed copy for the uv dependency manager. */
export const NS = 'zerowall.python'
export const en = {
  managerVersion: 'uv version', searchCatalog: 'Search packages', searching: 'Searching…', searchPlaceholder: 'Partial name or package==version', searchResults: 'Matching packages', noMatches: 'No matching packages.', filterVersions: 'Filter versions', chooseVersion: 'Choose a version', versionSource: 'Names and versions come from PyPI; installation uses your selected index and checks compatibility in the preview.', plannedChanges: '{count} package changes',
  title: 'Python dependencies', description: 'DSH supplies Python. Core dependencies prepare automatically; optional skill topics use separate environments.',
  refresh: 'Refresh', retry: 'Retry preparation', busy: 'Preparing dependencies…', ready: 'Ready', failed: 'Preparation failed', idle: 'Waiting for preparation',
  version: 'Python version', executable: 'Interpreter', packages: 'Installed packages', search: 'Filter installed packages', folder: 'Open dependency folder',
  custom: 'Additional packages', customNote: 'Preview resolves exact versions. Applying validates a new environment before switching; running tasks keep their current environment.',
  spec: 'Package specification', preview: 'Preview dependency plan', apply: 'Apply dependency plan', rollback: 'Restore previous environment',
  mirror: 'Package index', save: 'Save package index', saved: 'Saved', error: 'Operation failed', diagnose: 'Check dependencies', healthy: 'Dependency checks passed',
  downloading: 'Downloading dependencies…', verifying: 'Verifying resources…', ocr: 'OCR resources', ocrMirror: 'Models download from the RapidAI ModelScope mirror in mainland China. Retry preparation if the connection fails.', mirrorPreset: 'Choose package mirror', customMirror: 'Custom HTTPS index',
  ocrDownloadFailed: 'Model download failed. Check your connection or model mirror, then retry.', ocrIntegrityFailed: 'Model verification failed. Check the model mirror, then retry.', ocrStorageFailed: 'Cannot save OCR resources. Check the data directory permissions and free disk space, then retry.', ocrCancelled: 'OCR preparation was cancelled. Retry to continue.',
} as const
type Key = keyof typeof en
export const zh: Record<Key, string> = {
  managerVersion: 'uv 版本', searchCatalog: '搜索依赖', searching: '正在搜索…', searchPlaceholder: '输入部分名称或 包名==版本', searchResults: '匹配的依赖', noMatches: '没有匹配的依赖。', filterVersions: '模糊筛选版本号', chooseVersion: '选择版本', versionSource: '包名和版本来自 PyPI；安装使用选定下载源，预览时检查兼容性', plannedChanges: '{count} 项依赖变更',
  title: 'Python 依赖', description: '复用 DSH 内置 Python，自动准备核心依赖；可选 Skills 专题使用独立环境',
  refresh: '刷新', retry: '重试准备', busy: '正在准备依赖…', ready: '已就绪', failed: '准备失败', idle: '等待准备',
  version: 'Python 版本', executable: '解释器', packages: '已安装依赖', search: '筛选已安装依赖', folder: '打开依赖目录',
  custom: '额外依赖', customNote: '预览会解析准确版本；应用时先创建并验证新环境，再切换。正在运行的任务继续使用原环境',
  spec: '依赖名称与版本', preview: '预览依赖计划', apply: '应用依赖计划', rollback: '恢复上一个环境',
  mirror: '依赖下载源', save: '保存下载源', saved: '已保存', error: '操作失败', diagnose: '检查依赖', healthy: '依赖检查通过',
  downloading: '正在下载依赖…', verifying: '正在校验资源…', ocr: 'OCR 资源', ocrMirror: '模型使用 RapidAI 官方 ModelScope 国内地址下载；连接失败后可重试准备', mirrorPreset: '选择依赖镜像', customMirror: '自定义 HTTPS 下载源',
  ocrDownloadFailed: '模型下载失败，请检查网络或模型镜像后重试', ocrIntegrityFailed: '模型校验失败，请检查模型镜像后重试', ocrStorageFailed: '无法保存 OCR 资源，请检查数据目录权限和剩余磁盘空间后重试', ocrCancelled: 'OCR 准备已取消，重试可继续',
}
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'zerowall.python': Key } }
