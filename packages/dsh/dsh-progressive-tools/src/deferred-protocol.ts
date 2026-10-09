/**
 * Host `ToolSchema.deferLoading` asks a route that supports tool updates to
 * keep a definition out of the immediate tool list. Routes without that
 * support strip the flag and send the full schema. stable-proxy therefore
 * still removes deferred catalog tools from the assembled request, and only
 * preserves the flag on tools that are already on the stable surface.
 */
export const HOST_DEFERRED_FIELD = 'deferLoading' as const

export interface DeferredProtocolProbe {
  readonly supported: boolean
  readonly field?: typeof HOST_DEFERRED_FIELD
  readonly reason: string
}

const PUBLIC_SCHEMA_KEYS = new Set(['name', 'description', 'parameters', HOST_DEFERRED_FIELD])

export function probeDeferredProtocol(schemaKeys: readonly string[]): DeferredProtocolProbe {
  if (schemaKeys.includes(HOST_DEFERRED_FIELD)) {
    return {
      supported: true,
      field: HOST_DEFERRED_FIELD,
      reason: 'Host ToolSchema exposes deferLoading. stable-proxy still removes deferred catalog tools from the assembled request, because routes without tool updates materialize that flag as an immediate schema.',
    }
  }
  const extra = schemaKeys.filter(key => !PUBLIC_SCHEMA_KEYS.has(key))
  if (extra.length === 0) {
    return {
      supported: false,
      reason: 'Host tool schemas expose name, description, and parameters. No public deferred-tool field is available.',
    }
  }
  return {
    supported: false,
    reason: `Schema fields ${extra.join(', ')} are not a documented deferred-tool protocol. stable-proxy remains the presentation path.`,
  }
}
