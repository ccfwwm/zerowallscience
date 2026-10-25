export const CLAUDE_NS = 'zerowall.claude-code'

export const zh = {
  title: 'Claude Code',
  nav: 'Claude Code',
  description: '管理 ZeroWall Desktop 内置的独立 Claude Code CLI 运行环境。',
  status: '状态',
  desktopOnly: '仅 ZeroWall Desktop 支持',
  installed: '已安装',
  notInstalled: '尚未安装',
  running: '运行中',
  ready: '已就绪',
  path: '应用安装路径',
  pathUnavailable: '安装后显示应用托管的 Claude CLI 路径。',
  install: '安装 CLI',
  update: '更新 CLI',
  rollback: '回滚',
  uninstall: '卸载 CLI',
  unavailable: 'Claude Code 设置服务暂不可用。',
  busy: 'Claude Code 正在运行，请先停止当前任务。',
  uninstallConfirm: '卸载应用托管的 Claude Code 运行环境？',
  operationFailed: 'Claude Code 安装管理未完成，请重试。',
  note: '此处管理的是应用内独立运行时，不会读取或修改系统 PATH 中的 Claude 安装。',
} as const

export const en = {
  title: 'Claude Code',
  nav: 'Claude Code',
  description: 'Manage the application-managed Claude Code CLI runtime for ZeroWall Desktop.',
  status: 'Status',
  desktopOnly: 'Supported only in ZeroWall Desktop',
  installed: 'Installed',
  notInstalled: 'Not installed',
  running: 'Running',
  ready: 'Ready',
  path: 'Application install path',
  pathUnavailable: 'The application-managed Claude CLI path appears after installation.',
  install: 'Install CLI',
  update: 'Update CLI',
  rollback: 'Rollback',
  uninstall: 'Uninstall CLI',
  unavailable: 'Claude Code settings service is unavailable.',
  busy: 'Claude Code is running. Stop the current task first.',
  uninstallConfirm: 'Uninstall the application-managed Claude Code runtime?',
  operationFailed: 'Claude Code installation management did not complete. Try again.',
  note: 'This manages the application-managed runtime and does not read or change a Claude installation on PATH.',
} as const

export type ClaudeLocaleKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'zerowall.claude-code': ClaudeLocaleKey }
}
