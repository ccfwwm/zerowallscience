import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ImageModelSelection, EnvironmentVariableInfo } from '../shared/types.js'
import { EnvironmentSection } from './section.js'
import { unwrapRemoteResult } from '@zerowallscience/plugin-base/client-helpers'

export const inject = [
  'slots', 'locale', 'remote', 'remote.session', 'settingsScope',
  'remote.zerowallEnvironment', 'remote.zerowallAccount', 'remote.zerowallMcp', 'remote.zerowallMineru',
]

export function apply(ctx: ClientContext): void {
  const remote = ctx.remote as any
  const sessionRemote = ctx.get('remote.session') ?? remote?.session
  const environmentRemote = ctx.get('remote.zerowallEnvironment') ?? remote?.zerowallEnvironment
  const accountRemote = ctx.get('remote.zerowallAccount') ?? remote?.zerowallAccount
  const mcpRemote = ctx.get('remote.zerowallMcp') ?? remote?.zerowallMcp
  const mineruRemote = ctx.get('remote.zerowallMineru') ?? remote?.zerowallMineru
  const reviewerScope = ctx.settingsScope.bind<any>({ namespace: 'zerowall-reviewer' })
  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'zerowall-environment', order: 25,
    label: '环境配置',
    inject: () => ({
      reviewerScope,
      environmentRemote,
      accountRemote,
      mcpRemote,
      mineruRemote,
      unwrap: async (value: any) => unwrapRemoteResult('zerowall.environment', await value),
      modelCatalog: async (check = false) => {
        const response = await sessionRemote.modelCatalog(check ? { check: true } : {})
        return unwrapRemoteResult('zerowall.environment.modelCatalog', response)
      },
    }),
  }, EnvironmentSection), 'zerowall: environment settings'), 'zerowall: environment settings injection')
}

export type { ImageModelSelection, EnvironmentVariableInfo }
