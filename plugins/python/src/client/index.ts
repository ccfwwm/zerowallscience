import type { Context } from '@deepseek-ai/cordis'
import { NS } from '@zerowallscience/plugin-base/client-helpers'
import { PythonEnvironmentPanel } from './PythonEnvironmentPanel.js'

export const inject = ['slots', 'locale']
export function apply(ctx: Context): void {
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'zerowall-python-environment', order: 30,
    label: () => t('mcp.pythonEnvironment'), locale: NS, inject: () => ({}),
  }, PythonEnvironmentPanel))
}
