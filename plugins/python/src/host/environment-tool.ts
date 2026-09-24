import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

/** Requests go only to the Electron parent which owns the environment worker. */
export function environmentRequest(operation: string, args: unknown[]): Promise<Record<string, JsonValue>> {
  if (!process.send) return Promise.reject(new Error('PYTHON_MANAGER_UNAVAILABLE: run inside ZeroWall desktop.'))
  const requestId = randomUUID()
  return new Promise((accept, reject) => {
    const cleanup = (): void => { clearTimeout(timer); process.off('message', receive) }
    const receive = (value: unknown): void => {
      if (!value || typeof value !== 'object') return
      const message = value as { kind?: string; requestId?: string; error?: string; result?: Record<string, JsonValue> }
      if (message.kind !== 'zerowall-python-response' || message.requestId !== requestId) return
      cleanup()
      if (message.error) reject(new Error(message.error)); else accept(message.result ?? {})
    }
    const timer = setTimeout(() => { cleanup(); reject(new Error('Python manager request timed out; inspect status before retrying.')) }, 900_000)
    process.on('message', receive)
    process.send?.({ kind: 'zerowall-python-request', requestId, operation, args }, undefined, undefined, (error: Error | null) => { if (error) { cleanup(); reject(error) } })
  })
}

export function registerEnvironmentTool(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'python_environment',
    description: 'Inspect and synchronize the shared ZeroWall Science Python runtime used by all scientific tools and MCP consumers. Manifest checks and previews are read-only; applying a dependency plan requires explicit confirmation. Never invokes system Python.',
    parameters: {
      action: { type: 'string', required: true, enum: ['info', 'versions', 'preview', 'apply', 'status', 'rollback', 'check_manifest', 'preview_sync', 'apply_sync', 'list_packages', 'diagnose', 'configure'] },
      query: { type: 'string' }, packages: { type: 'array', items: { type: 'string' } },
      operation: { type: 'string', enum: ['install', 'uninstall'] },
      profile: { type: 'string', description: 'Deprecated. Shared runtime installations use one package directory; separate profiles are rejected.' },
      plan_id: { type: 'string' }, task_id: { type: 'string' }, confirm: { type: 'boolean' },
      request_id: { type: 'string' }, manifest_revision: { type: 'string' }, mirror_url: { type: 'string' }, expected_revision: { type: 'integer' },
      requestId: { type: 'string' }, manifestRevision: { type: 'string' }, planId: { type: 'string' }, mirrorUrl: { type: 'string' }, expectedRevision: { type: 'integer' },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args) {
      if (args.requestId !== undefined) args.request_id ??= args.requestId
      if (args.manifestRevision !== undefined) args.manifest_revision ??= args.manifestRevision
      if (args.planId !== undefined) args.plan_id ??= args.planId
      if (args.mirrorUrl !== undefined) args.mirror_url ??= args.mirrorUrl
      if (args.expectedRevision !== undefined) args.expected_revision ??= args.expectedRevision
      if (args.profile) throw new Error('SHARED_RUNTIME_ONLY: preview compatible packages in the shared environment. Conflicts must be resolved without a second package directory.')
      if (['apply', 'rollback'].includes(args.action) && args.confirm !== true) throw new Error('CONFIRMATION_REQUIRED: show the concrete change plan and obtain approval first.')
      if (['apply_sync', 'configure'].includes(args.action) && args.action === 'apply_sync' && args.confirm !== true) throw new Error('CONFIRMATION_REQUIRED: show the signed dependency plan and obtain approval first.')
      if (['check_manifest', 'preview_sync', 'apply_sync', 'list_packages', 'diagnose', 'configure', 'rollback'].includes(args.action) || (args.action === 'status' && !args.task_id)) {
        const requestId = typeof args.request_id === 'string' && args.request_id.trim() ? args.request_id : randomUUID()
        return environmentRequest('request', [{ action: args.action, requestId, ...(args.plan_id ? { planId: args.plan_id } : {}), ...(args.manifest_revision ? { manifestRevision: args.manifest_revision } : {}), ...(args.mirror_url ? { mirrorUrl: args.mirror_url } : {}), ...(args.expected_revision !== undefined ? { expectedRevision: args.expected_revision } : {}), ...(args.confirm !== undefined ? { confirm: args.confirm } : {}) }])
      }
      switch (args.action) {
        case 'info': return environmentRequest('info', [args.query ?? ''])
        case 'versions':
          if (!args.packages?.length) throw new Error('Specify packages to check; unbounded update scans are not supported.')
          return environmentRequest('versions', [args.packages])
        case 'preview':
          if (args.profile && args.operation === 'uninstall') throw new Error('Profile removal is not supported; preview a replacement package set instead.')
          return environmentRequest('preview', [args.packages ?? [], args.operation ?? 'install', args.profile])
        case 'apply':
          if (!args.plan_id) throw new Error('plan_id is required')
          { const result = await environmentRequest('apply', [args.plan_id]); return { ...result, task_id: result.taskId ?? null } }
        case 'status': return environmentRequest('status', [args.task_id])
        case 'rollback': { const result = await environmentRequest('rollback', []); return { ...result, task_id: result.taskId ?? null } }
        default: throw new Error('Unknown Python action')
      }
    },
  }))
}
