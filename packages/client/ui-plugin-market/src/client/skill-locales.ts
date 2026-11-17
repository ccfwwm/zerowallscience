/** Online skill copy owned by the existing market UI. */
export const skillZh = {
  title: '技能', description: '从在线目录添加技能；已安装项的更新统一在更新中心管理',
  refresh: '刷新目录', install: '安装', update: '更新', installed: '已安装', empty: '暂无可用技能',
  unavailable: '请先在已安装插件中启用 Skills 管理', failed: '操作未完成，请查看详情后重试',
  partial: '技能可能已导入，但配置未完成；请先在 Skills 管理中检查，再重试',
  details: '查看详情', loading: '正在加载技能目录', updates: '技能更新', current: '技能已是最新版本', updateAll: '更新全部技能',
  done: '技能已安装或更新', confirm: '安装此技能？', trust: '技能可能包含可执行脚本，请确认你信任此来源', cancel: '取消',
}
/** English skill catalog copy, also used by the locale fallback. */
export const skillEn = {
  title: 'Skills', description: 'Add skills from the online catalog. Manage installed updates in Updates.',
  refresh: 'Refresh catalog', install: 'Install', update: 'Update', installed: 'Installed', empty: 'No skills available',
  unavailable: 'Enable Skills management in Installed plugins first.', failed: 'The operation did not finish. Review the details and retry.',
  partial: 'Skills may have been imported before configuration failed. Inspect Skills management before retrying.',
  details: 'View details', loading: 'Loading skill catalog', updates: 'Skill updates', current: 'Skills are up to date', updateAll: 'Update all skills',
  done: 'Skill installed or updated', confirm: 'Install this skill?', trust: 'Skills can contain executable scripts. Confirm that you trust this source.', cancel: 'Cancel',
} satisfies Record<keyof typeof skillZh, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'pluginMarket.skills': keyof typeof skillZh }
}
