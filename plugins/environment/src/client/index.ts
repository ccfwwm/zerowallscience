import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ImageModelSelection, EnvironmentVariableInfo } from '../shared/types.js'
import { EnvironmentSection } from './section.js'
import { unwrapRemoteResult } from '@zerowallscience/plugin-base/client-helpers'

export const inject = [
  'slots', 'locale', 'remote', 'connection', 'settingsScope',
  'remote.zerowallEnvironment', 'remote.zerowallAccount', 'remote.zerowallMcp',
]

export function apply(ctx: ClientContext): void {
  const remote = ctx.remote as any
  const connection = ctx.get('connection') as ConnectionHandle
  const environmentRemote = ctx.get('remote.zerowallEnvironment') ?? remote?.zerowallEnvironment
  const accountRemote = ctx.get('remote.zerowallAccount') ?? remote?.zerowallAccount
  const mcpRemote = ctx.get('remote.zerowallMcp') ?? remote?.zerowallMcp
  const reviewerScope = ctx.settingsScope.bind<any>({ namespace: 'zerowall-reviewer' })
  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'zerowall-environment', order: 25,
    label: '环境配置',
    inject: () => ({
      reviewerScope,
      environmentRemote,
      accountRemote,
      mcpRemote,
      unwrap: async (value: any) => unwrapRemoteResult('zerowall.environment', await value),
      modelCatalog: async (check = false) => {
        const response = await connection.api.llm.models(check ? { check: true } : {})
        if (!response.result.ok) throw new Error(`模型目录加载失败：${response.result.error.message}`)
        return response.result.value
      },
    }),
  }, EnvironmentSection), 'zerowall: environment settings'), 'zerowall: environment settings injection')
}

export type { ImageModelSelection, EnvironmentVariableInfo }
