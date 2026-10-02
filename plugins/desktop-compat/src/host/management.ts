import type { Context } from '@deepseek-ai/cordis'

const operations: Record<string, { service: string; method: string }> = {
  'skill.list': { service: 'zerowallCapabilities', method: 'listSkills' },
  'skill.sources': { service: 'zerowallCapabilities', method: 'listSkillSources' },
  'skill.get': { service: 'zerowallCapabilities', method: 'getSkill' },
  'skill.update': { service: 'zerowallCapabilities', method: 'updateSkill' },
  'skill.rollback': { service: 'zerowallCapabilities', method: 'rollbackSkill' },
  'skill.import': { service: 'zerowallCapabilities', method: 'importSkill' },
  'skill.enable': { service: 'zerowallCapabilities', method: 'setSkillEnabled' },
  'skill.disable': { service: 'zerowallCapabilities', method: 'setSkillEnabled' },
  'skill.remove': { service: 'zerowallCapabilities', method: 'removeImportedSkill' },
  'mcp.list': { service: 'zerowallMcp', method: 'list' },
  'mcp.add': { service: 'zerowallMcp', method: 'create' },
  'mcp.edit': { service: 'zerowallMcp', method: 'update' },
  'mcp.remove': { service: 'zerowallMcp', method: 'deleteConnection' },
  'mcp.enable': { service: 'zerowallMcp', method: 'update' },
  'mcp.disable': { service: 'zerowallMcp', method: 'update' },
  'mcp.restart': { service: 'zerowallMcp', method: 'reload' },
  'mcp.update': { service: 'zerowallMcp', method: 'reload' },
  'env.list': { service: 'zerowallEnvironment', method: 'listVariables' },
  'env.check': { service: 'zerowallEnvironment', method: 'listVariables' },
  'env.set': { service: 'zerowallEnvironment', method: 'setVariable' },
  'env.delete': { service: 'zerowallEnvironment', method: 'deleteVariable' },
}

/** Fixed private IPC allowlist; secret-reading methods are never exposed. */
export function attachManagement(ctx: Context): void {
  const listener = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    const request = value as { type?: string; id?: string; operation?: string; args?: unknown[] }
    if (request.type !== 'zerowall:management' || typeof request.id !== 'string') return
    if (request.operation === 'host.health') {
      // Loader belongs to the shared Host runtime; do not bundle a second copy
      // merely to augment Cordis's Context type in this independent plugin.
      type Entry = { options: { name?: string; id?: string }; disabled?: boolean; fiber?: { state: number } }
      const loader = (ctx.root as Context & { loader?: { entries(): Iterable<Entry> } }).loader
      const entries = loader ? [...loader.entries()].filter(entry => entry.options.name?.startsWith('@zerowallscience/plugin-') && !entry.disabled) : []
      process.send?.({ type: 'zerowall:management:result', id: request.id, result: { ready: !!loader && entries.length > 0 && entries.every(entry => entry.fiber?.state === 2), entries: entries.map(entry => ({ id: entry.options.id, state: entry.fiber?.state })) } })
      return
    }
    const operation = operations[request.operation ?? '']
    const reply = (result: unknown, error?: string): void => { process.send?.({ type: 'zerowall:management:result', id: request.id, result, error }) }
    if (!operation) { reply(undefined, 'Unsupported management operation'); return }
    let completed = false
    const timer = setTimeout(() => { if (!completed) { completed = true; reply(undefined, 'Requested plugin service is unavailable') } }, 5000)
    const dispose = ctx.inject([operation.service], async scope => {
      if (completed) return
      completed = true
      clearTimeout(timer)
      try {
        const service = scope.get(operation.service) as unknown as Record<string, (...args: unknown[]) => unknown>
        if (typeof service[operation.method] !== 'function') throw new Error('Service operation unavailable')
        const result = await service[operation.method]!(...(request.args ?? []))
        if (request.operation?.startsWith('mcp.')) console.info('[zws-mcp] ' + JSON.stringify({ operation: request.operation, status: 'completed', time: new Date().toISOString() }))
        // MCP may carry inherited credential env values; publish only status.
        reply(request.operation?.startsWith('mcp.') ? sanitize(result) : result)
      } catch (error: unknown) {
        // Error messages may contain credentials supplied by a provider. Keep
        // only the error class and source frames in the desktop diagnostics.
        const failure = error instanceof Error ? error : new Error()
        console.error('[zws-management] ' + JSON.stringify({ operation: request.operation, error: failure.name, frames: failure.stack?.split('\n').filter(line => /^\s+at /.test(line)) }))
        reply(undefined, 'Plugin management operation failed; see Desktop logs')
      }
    })
    setTimeout(() => { dispose.dispose() }, 30_000).unref()
  }
  process.on('message', listener)
  ctx.effect(() => () => process.off('message', listener))
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(?:env|headers|authorization|apiKey|password|token|secret)$/i.test(key)).map(([key, item]) => [key, sanitize(item)]))
  return value
}
