/** Localized copy available before the client locale plugin starts. */
export const bootLocales = {
  en: {
    loading: 'Preparing your research workspace', genericLoading: 'Loading plugins…', failed: 'Unable to start the workspace',
    description: 'A connected workspace for scientific discovery',
    services: 'Starting workspace services', modules: 'Loading application resources',
    plugins: 'Activating plugins', interface: 'Opening the workspace',
    step: (step: number) => `Step ${String(step)} of 4`,
    entries: (active: number, total: number) => `${String(active)} / ${String(total)} plugins ready`,
    elapsed: (seconds: number) => `${String(seconds)}s elapsed`,
    slow: 'First launch or an update may take longer. Please keep this window open.',
  },
  zh: {
    loading: '正在准备科研工作空间', genericLoading: '正在加载插件', failed: '工作空间启动失败',
    description: '连接模型、工具与知识，让科研工作有序展开',
    services: '正在启动工作区服务', modules: '正在加载界面资源',
    plugins: '正在启用插件', interface: '正在打开工作区',
    step: (step: number) => `第 ${String(step)} 步，共 4 步`,
    entries: (active: number, total: number) => `插件已就绪 ${String(active)} / ${String(total)}`,
    elapsed: (seconds: number) => `已等待 ${String(seconds)} 秒`,
    slow: '首次启动或更新后可能需要更长时间，请保持窗口打开',
  },
} as const
