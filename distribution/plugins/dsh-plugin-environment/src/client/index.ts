import { createElement } from 'react'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ImageModelSelection, EnvironmentVariableInfo } from '../shared/types.js'
import { EnvironmentSection } from './section.js'
import { NS as legacyNS, unwrapRemoteResult } from '@zerowall/dsh-plugin-environment/client-helpers'
import { en as legacyEn, zh as legacyZh } from './legacy-locales.js'
import { en, NS, zh } from './locales.js'
import { ContextBudgetControl } from './context-budget.js'

// Cordis uses an object inject declaration as a service-to-intercept map.  It
// does not have `required`/`optional` groups; declaring those names would make
// the plugin wait for services literally named "required" and "optional".
// Keep only the services needed to render the base environment section here.
// Domain remotes are resolved opportunistically below so the page remains
// available while AI Cloud, MCP, MinerU or PubMed are disabled/uninstalled.
export const inject = ['slots', 'locale', 'remote.zerowallEnvironment']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(legacyNS, { zh: legacyZh, en: legacyEn }))
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'zerowall: environment dictionaries')
  const t = ctx.locale.bind(NS)
  // Dotted remotes must be resolved through Cordis reflection. Falling back
  // to `ctx.remote.<name>` after `ctx.get()` returns undefined can read the
  // proxy outside the owning fiber and surface `without inject` during a
  // manual model sync.
  const environmentRemote = ctx.get('remote.zerowallEnvironment')
  let remoteRevision = 0
  const listeners = new Set<() => void>()
  const notifyAvailability = () => { remoteRevision++; for (const listener of listeners) listener() }
  const remoteAvailability = {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    snapshot: () => remoteRevision,
  }
  const optionalRemote = (name: 'remote.zerowallMcp' | 'remote.zerowallMineru' | 'remote.zerowallPubmed') => {
    let remote: any
    ctx.inject([name], scope => {
      remote = scope.get(name)
      notifyAvailability()
      scope.effect(() => () => { remote = undefined; notifyAvailability() })
    })
    // Resolve methods inside the owning injected fiber. The base page keeps
    // rendering, and its existing per-domain error states show availability.
    return new Proxy({}, { get: (_target, method) => (...args: unknown[]) => {
      if (typeof remote?.[method] !== 'function') return Promise.reject(new Error('Domain service unavailable'))
      return remote[method](...args)
    } })
  }
  const mcpRemote = optionalRemote('remote.zerowallMcp')
  const mineruRemote = optionalRemote('remote.zerowallMineru')
  const pubmedRemote = optionalRemote('remote.zerowallPubmed')
  const configuration = () => ({
      environmentRemote,
      mcpRemote,
      mineruRemote,
      pubmedRemote,
      remoteAvailability,
      unwrap: async (value: any) => unwrapRemoteResult('zerowall.environment', await value),
    })
  for (const key of ['@zerowall/dsh-plugin-environment']) {
    ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
      name: 'plugins.bundle.config', key, locale: NS,
    }, ({ view }: PluginConfigViewProps) => view === 'page' ? createElement(EnvironmentSection, { ...configuration(), t }) : null))
  }
  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'zerowall-environment', order: 25,
    label: () => t('title'), locale: NS,
    inject: configuration,
  }, EnvironmentSection)), 'zerowall: environment settings injection')
  ctx.effect(() => ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right', id: 'zerowall-context-budget', order: -20, locale: NS,
    inject: () => ({
      readBudget: (sessionId: string) => environmentRemote.getSessionContextBudget(sessionId),
      readInfo: (sessionId: string) => environmentRemote.getSessionContextInfo(sessionId),
      saveBudget: (sessionId: string, tokens: number) => environmentRemote.setSessionContextBudget(sessionId, tokens),
      t,
    }),
  }, ContextBudgetControl)), 'zerowall: session context budget injection')
}
export type { ImageModelSelection, EnvironmentVariableInfo }
