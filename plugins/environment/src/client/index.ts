import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ImageModelSelection, EnvironmentVariableInfo } from '../shared/types.js'
import { EnvironmentSection } from './section.js'
import { unwrapRemoteResult } from '@zerowallscience/plugin-base/client'

export const inject = ['slots', 'locale', 'remote', 'settingsScope']

export function apply(ctx: ClientContext): void {
  const remote = ctx.remote as any
  const reviewerScope = ctx.settingsScope.bind<any>({ namespace: 'zerowall-reviewer' })
  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'zerowall-environment', order: 25,
    label: '环境配置',
    inject: () => ({
      reviewerScope,
      environmentRemote: remote?.zerowallEnvironment,
      accountRemote: remote?.zerowallAccount,
      mcpRemote: remote?.zerowallMcp,
      unwrap: unwrapRemoteResult,
    }),
  }, EnvironmentSection), 'zerowall: environment settings'), 'zerowall: environment settings injection')
}

export type { ImageModelSelection, EnvironmentVariableInfo }
