/** Python configuration uses the same Host service as the model tools. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@zerowall/dsh-plugin-python/remote'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { createElement } from 'react'
import { en, NS, zh } from './locales.js'
import { createPythonManagementClient } from '../shared/browser-management.js'
import { PythonEnvironmentPanel } from './PythonEnvironmentPanel.js'
import type { PythonEnvironmentResponse } from './desktop-api.js'

export const inject = ['slots', 'locale', 'uiWorkspace', 'remote.zerowallPythonManagement']

/** Register the existing panel in Settings and on the Python plugin's detail page. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }))
  const t = ctx.locale.bind(NS)
  const remote = ctx.get('remote.zerowallPythonManagement')
  const { api } = createPythonManagementClient(remote, () => ctx.uiWorkspace.pickDirectory())
  const configuration = () => ({ api })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'zerowall-python-environment', order: 30,
    label: () => t('title'), locale: NS, inject: configuration,
  }, PythonEnvironmentPanel))
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config', key: '@zerowall/dsh-plugin-python',
  }, ({ view }: PluginConfigViewProps) => view === 'page' ? createElement(PythonEnvironmentPanel, { api, t }) : null))
}
