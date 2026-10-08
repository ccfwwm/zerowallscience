import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ImageModelSelection, EnvironmentVariableInfo } from '../shared/types.js'
import { EnvironmentSection } from './section.js'
import { unwrapRemoteResult } from '@zerowallscience/plugin-base/client-helpers'
import { en, NS, zh } from './locales.js'

// Cordis uses an object inject declaration as a service-to-intercept map.  It
// does not have `required`/`optional` groups; declaring those names would make
// the plugin wait for services literally named "required" and "optional".
// Keep only the services needed to render the base environment section here.
// Domain remotes are resolved opportunistically below so the page remains
// available while AI Cloud, MCP, MinerU or PubMed are disabled/uninstalled.
export const inject = ['slots', 'locale', 'remote', 'remote.session', 'configForms', 'remote.zerowallEnvironment']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'zerowall: environment dictionaries')
  const t = ctx.locale.bind(NS)
  // Dotted remotes must be resolved through Cordis reflection. Falling back
  // to `ctx.remote.<name>` after `ctx.get()` returns undefined can read the
  // proxy outside the owning fiber and surface `without inject` during a
  // manual model sync.
  const sessionRemote = ctx.get('remote.session')
  const environmentRemote = ctx.get('remote.zerowallEnvironment')
  const optionalRemote = (name: 'remote.zerowallAccount' | 'remote.zerowallMcp' | 'remote.zerowallMineru' | 'remote.zerowallPubmed') => {
    let remote: any
    ctx.inject([name], scope => {
      remote = scope.get(name)
      scope.effect(() => () => { remote = undefined })
    })
    // Resolve methods inside the owning injected fiber. The base page keeps
    // rendering, and its existing per-domain error states show availability.
    return new Proxy({}, { get: (_target, method) => (...args: unknown[]) => {
      if (typeof remote?.[method] !== 'function') return Promise.reject(new Error('Domain service unavailable'))
      return remote[method](...args)
    } })
  }
  const accountRemote = optionalRemote('remote.zerowallAccount')
  const mcpRemote = optionalRemote('remote.zerowallMcp')
  const mineruRemote = optionalRemote('remote.zerowallMineru')
  const pubmedRemote = optionalRemote('remote.zerowallPubmed')
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
