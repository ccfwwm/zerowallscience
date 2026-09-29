import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ImageModelSelection, EnvironmentVariableInfo } from '../shared/types.js'
import { EnvironmentSection } from './section.js'
import { unwrapRemoteResult } from '@zerowallscience/plugin-base/client-helpers'
import { en, NS, zh } from './locales.js'

export const inject = [
  'slots', 'locale', 'remote', 'remote.session', 'configForms',
  'remote.zerowallEnvironment', 'remote.zerowallAccount', 'remote.zerowallMcp', 'remote.zerowallMineru', 'remote.zerowallPubmed',
]

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'zerowall: environment dictionaries')
  const t = ctx.locale.bind(NS)
  // Dotted remotes must be resolved through Cordis reflection. Falling back
  // to `ctx.remote.<name>` after `ctx.get()` returns undefined can read the
  // proxy outside the owning fiber and surface `without inject` during a
  // manual model sync.
  const sessionRemote = ctx.get('remote.session')
  const environmentRemote = ctx.get('remote.zerowallEnvironment')
  const accountRemote = ctx.get('remote.zerowallAccount')
  const mcpRemote = ctx.get('remote.zerowallMcp')
  const mineruRemote = ctx.get('remote.zerowallMineru')
  const pubmedRemote = ctx.get('remote.zerowallPubmed')
  const reviewerScope = ctx.configForms.get<any>('zerowall-reviewer')
  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'zerowall-environment', order: 25,
    label: () => t('title'), locale: NS,
    inject: () => ({
      reviewerScope,
      environmentRemote,
      accountRemote,
      mcpRemote,
      mineruRemote,
      pubmedRemote,
      unwrap: async (value: any) => unwrapRemoteResult('zerowall.environment', await value),
      modelCatalog: async () => {
        const response = await sessionRemote.modelCatalog()
        return unwrapRemoteResult('zerowall.environment.modelCatalog', response)
      },
    }),
  }, EnvironmentSection), 'zerowall: environment settings'), 'zerowall: environment settings injection')
}

export type { ImageModelSelection, EnvironmentVariableInfo }
