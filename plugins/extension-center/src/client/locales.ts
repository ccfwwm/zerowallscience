import type { TranslateNS } from '@deepseek-ai/dsh-client-locale'

export const NS = 'zerowall.extensionCenter' as const
export const zh = {
  title: '扩展中心',
  intro: '管理 ZeroWall 插件、Skills 和 MCP 资源。检查只读，安装与升级由你手动触发。',
  refresh: '检查更新',
  checking: '正在检查…',
  ready: '已完成检查',
  unavailable: '桌面资源服务暂不可用',
  failed: '检查失败',
  cancelled: '资源任务已取消',
  empty: '暂时没有可用的更新。',
  installed: '已安装',
  available: '可更新',
  update: '更新',
  rollback: '回滚',
  disable: '停用',
  enable: '启用',
  remove: '卸载',
  restart: '需要重启 Host',
  signed: '已验签',
  unsigned: '未签名',
  plugins: '插件',
  skills: 'Skills',
  mcp: 'MCP',
  task: '任务',
  source: '来源',
  version: '版本',
  status: '状态',
  noDesktop: '当前运行环境没有 ZeroWall 桌面资源桥接。',
} satisfies Record<string, string>

export const en: typeof zh = {
  title: 'Extension Center',
  intro: 'Manage ZeroWall plugins, Skills, and MCP resources. Checks are read-only; installation and upgrades are manual.',
  refresh: 'Check for updates', checking: 'Checking…', ready: 'Check complete', unavailable: 'Desktop resource service unavailable', failed: 'Check failed', cancelled: 'Resource task was cancelled', empty: 'No updates are available.', installed: 'Installed', available: 'Update available', update: 'Update', rollback: 'Rollback', disable: 'Disable', enable: 'Enable', remove: 'Uninstall', restart: 'Host restart required', signed: 'Signature verified', unsigned: 'Unsigned', plugins: 'Plugins', skills: 'Skills', mcp: 'MCP', task: 'Task', source: 'Source', version: 'Version', status: 'Status', noDesktop: 'The ZeroWall desktop resource bridge is unavailable.',
}

export type ExtensionTranslate = TranslateNS<typeof NS>
