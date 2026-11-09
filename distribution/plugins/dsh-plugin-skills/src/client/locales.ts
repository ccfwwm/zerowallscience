/** Typed copy shared by the settings page and plugin configuration. */
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
export const NS = 'zerowall.skills'
export const en = {
  title: 'Skills', description: 'Core workflows are ready. Optional workflows activate when a task needs them. Switches control availability for all workspaces by default; manually disabled skills stay off.',
  onDemand: 'On demand',
  pluginDescription: 'These instructions help the model use this plugin. Their switch controls instructions, not plugin activation.', enableInstructions: 'Provide instructions to the model',
  search: 'Search skills', refresh: 'Refresh', source: 'Folder, ZIP, Markdown or public GitHub URL', preview: 'Preview import', install: 'Import disabled', replace: 'Replace conflicting names',
  global: 'All workspaces', workspace: 'Selected workspace', workspacePath: 'Select workspace', importNote: 'Previewing and importing never run scripts or install dependencies. Enable an imported skill after review.',
  enabled: 'Enabled', disabled: 'Disabled', shadowed: 'Overridden', enable: 'Enable skill', remove: 'Remove imported skill', detail: 'View instructions', close: 'Close',
  core: 'Core', 'academic-research': 'Academic research', 'remote-research': 'Remote research', 'paper-download': 'Literature acquisition', 'research-integrity': 'Research integrity', omics: 'Omics', 'molecular-science': 'Molecular science', documents: 'Documents', computing: 'Computing', 'specialist-science': 'Specialist science', plugin: 'Plugin instructions', imported: 'Imported',
  enableTopic: 'Enable topic', disableTopic: 'Disable topic', requirements: 'Python dependencies', license: 'License', conflict: 'Name conflict', empty: 'No matching skills', incomplete: 'Some sources could not be read. Existing entries remain visible; refresh to retry.',
  failed: 'Operation failed. Your previous state is retained.', saved: 'Saved', importedDisabled: 'Imported and kept disabled', loading: 'Loading', removeNote: 'Imported files are retained as a backup.',
} as const
export type SkillsKey = keyof typeof en
export type SkillsTranslate = Translate<SkillsKey>
export const zh: Record<SkillsKey, string> = {
  title: 'Skills 管理', description: '核心工作流直接可用，专题由模型在任务需要时按需启用；开关默认作用于所有项目，手工停用后不会自动开启',
  onDemand: '按需加载',
  pluginDescription: '这些说明帮助模型使用本插件；开关仅控制说明是否提供给模型，不控制插件启停', enableInstructions: '向模型提供使用说明',
  search: '搜索 Skill', refresh: '刷新', source: '文件夹、ZIP、Markdown 路径或公开 GitHub 地址', preview: '预览导入', install: '导入并保持停用', replace: '替换同名项',
  global: '所有项目', workspace: '所选项目', workspacePath: '选择项目目录', importNote: '预览和导入不会运行脚本或安装依赖；审核内容后再启用',
  enabled: '已启用', disabled: '已停用', shadowed: '被同名项覆盖', enable: '启用 Skill', remove: '移除导入项', detail: '查看指令', close: '关闭',
  core: '核心工作流', 'academic-research': '学术研究', 'remote-research': '远程科研', 'paper-download': '文献获取', 'research-integrity': '科研诚信', omics: '组学', 'molecular-science': '分子科学', documents: '文档', computing: '计算', 'specialist-science': '专项科研', plugin: '插件使用说明', imported: '用户导入',
  enableTopic: '启用专题', disableTopic: '停用专题', requirements: 'Python 依赖', license: '许可证', conflict: '同名冲突', empty: '没有匹配的 Skill', incomplete: '部分来源读取失败，已保留现有条目；可刷新重试',
  failed: '操作失败，已保留原有状态', saved: '已保存', importedDisabled: '已导入，保持停用', loading: '加载中', removeNote: '移除后保留导入文件作为备份',
}
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'zerowall.skills': SkillsKey } }
