import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session'
import { createScope, scopeParentOf } from '@deepseek-ai/dsh-scope'
import type { CapabilityPolicyService } from './policy.ts'

export const SELECTION_EVENT = 'zerowall/capabilities/selection'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'zerowall/capabilities/selection': { tools: string[]; disabled: string[]; onDemand?: string[] }
  }
}

interface Selection { tools: Set<string>; disabled: Set<string>; onDemand: Set<string> }
type Tier = 'resident' | 'on-demand' | 'disabled'

/** One durable selection per session, applied to both schema projection and execution. */
export function createSelections(ctx: Context, policy: CapabilityPolicyService) {
  ;(KNOWN_SESSION_EVENT_TYPES as Set<string>).add(SELECTION_EVENT)
  const selections = new WeakMap<object, Selection>()
  const restrictions = new WeakMap<Agent, { ctx: Context; allow: string[]; dispose: () => void; disposeScope: () => Promise<void> }>()
  const catalog = <T>(agent: Agent, read: () => T): T => {
    const restriction = restrictions.get(agent)
    restriction?.dispose()
    try { return read() } finally {
      if (restriction !== undefined) restriction.dispose = restriction.ctx.tools.restrict({ allow: restriction.allow })
    }
  }
  const get = (agent: Agent): Selection => {
    const existing = selections.get(agent.session)
    if (existing !== undefined) return existing
    const saved = [...agent.session.snapshotEvents()].reverse().find(event => event.type === SELECTION_EVENT)
    const strings = (value: unknown): Set<string> => new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 4096) : [])
    const value = { tools: strings(saved?.data.tools), disabled: strings(saved?.data.disabled), onDemand: strings(saved?.data.onDemand) }
    selections.set(agent.session, value)
    return value
  }
  const visible = (name: string, agent?: Agent): boolean => {
    if (policy.isDisabledTool(name)) return false
    if (policy.metaTools().includes(name)) return true
    if (agent === undefined) return policy.isResidentTool(name)
    const state = get(agent)
    return !state.disabled.has(name) && !state.onDemand.has(name) && (policy.isResidentTool(name) || state.tools.has(name))
  }
  const classify = (name: string, kind: 'tool' | 'skill', agent?: Agent): Tier => {
    const base = policy.classifyCapability(name, kind)
    if (base === 'disabled' || agent === undefined || (kind === 'tool' && policy.metaTools().includes(name))) return base
    const state = get(agent)
    const key = kind === 'skill' ? `skill:${name}` : name
    return state.disabled.has(key) ? 'disabled' : state.onDemand.has(key) ? 'on-demand' : state.tools.has(key) ? 'resident' : base
  }
  const sync = (agent: Agent) => {
    const inherited = new Set(ctx.tools.schemas(scopeParentOf(agent)).map(tool => tool.name))
    const allow = catalog(agent, () => ctx.tools.schemas(agent)
      .filter(tool => inherited.has(tool.name) && tool.name !== 'run_code'
        && (visible(tool.name, agent) || ['mcp_search_tools', 'mcp_enable_tools', 'meta_invoke'].includes(tool.name)))
      .map(tool => tool.name))
    const prior = restrictions.get(agent)
    if (prior !== undefined && JSON.stringify(prior.allow) === JSON.stringify(allow)) return
    prior?.dispose()
    const scope = prior === undefined ? createScope(ctx, agent) : undefined
    const scoped = prior?.ctx ?? scope!.ctx
    restrictions.set(agent, { ctx: scoped, allow, dispose: scoped.tools.restrict({ allow }), disposeScope: prior?.disposeScope ?? scope!.dispose })
  }
  const update = (agent: Agent, changes: readonly { name: string; kind: 'tool' | 'skill'; tier: Tier }[]) => {
    const prior = get(agent)
    const next = { tools: new Set(prior.tools), disabled: new Set(prior.disabled), onDemand: new Set(prior.onDemand) }
    for (const { name, kind, tier } of changes) {
      if (kind === 'tool' && policy.metaTools().includes(name)) throw new Error('Discovery tools cannot be changed.')
      if (tier === 'resident' && policy.isDisabledCapability(name, kind)) throw new Error(`Capability ${name} is disabled by the profile.`)
      if (kind === 'tool' && catalog(agent, () => ctx.tools.get(name, agent)) === undefined) throw new Error(`UNKNOWN_TOOL: ${name}`)
      const key = kind === 'skill' ? `skill:${name}` : name
      next.tools.delete(key)
      next.disabled.delete(key)
      next.onDemand.delete(key)
      if (tier === 'resident') next.tools.add(key)
      else if (tier === 'disabled') next.disabled.add(key)
      else next.onDemand.add(key)
    }
    const data = { tools: [...next.tools].sort(), disabled: [...next.disabled].sort(), onDemand: [...next.onDemand].sort() }
    agent.session.append(SELECTION_EVENT, data)
    selections.set(agent.session, next)
    sync(agent)
    // The session has no capability count or schema-byte quota.  Do not use
    // Infinity here: tool results are lossless JSON and JSON has no Infinity
    // value, so the protocol validator rejects the whole meta_enable result.
    return {
      enabled: data.tools,
      disabled: data.disabled,
      unlimited: true,
      remainingTools: null,
      remainingSchemaBytes: null,
    }
  }
  const select = (agent: Agent, names: readonly string[], enable = true) => {
    for (const name of names) if (enable && classify(name, 'tool', agent) === 'disabled') throw new Error(`Capability ${name} is disabled. Change it in capability settings first.`)
    return update(agent, names.map(name => ({ name, kind: 'tool', tier: enable ? 'resident' : 'on-demand' })))
  }
  ctx.tools.guard(exec => ['run_code', 'mcp_search_tools', 'mcp_enable_tools', 'meta_invoke'].includes(exec.name) || visible(exec.name, exec.agent) ? undefined : `UNKNOWN_TOOL: ${exec.name}. Search and enable this capability first.`)
  ctx.on('system-prompt/assemble', (_assembly, context, next) => {
    if (context.scope !== undefined && 'session' in context.scope) sync(context.scope as Agent)
    return next()
  }, { prepend: true })
  ctx.on('agent/disposed', async ({ agent }) => {
    const restriction = restrictions.get(agent)
    restrictions.delete(agent)
    await restriction?.disposeScope()
  })
  const reset = (agent: Agent): void => {
    const state = { tools: new Set<string>(), disabled: new Set<string>(), onDemand: new Set<string>() }
    selections.set(agent.session, state)
    agent.session.append(SELECTION_EVENT, { tools: [], disabled: [], onDemand: [] })
    sync(agent)
  }
  return { visible, select, update, classify, reset, source: (_name: string, _kind: 'tool' | 'skill', _agent: Agent) => 'default' as const, readTool: (name: string, agent: Agent) => catalog(agent, () => ctx.tools.get(name, agent)), snapshot: (agent: Agent) => ({ tools: [...get(agent).tools], disabled: [...get(agent).disabled], onDemand: [...get(agent).onDemand] }) }
}
