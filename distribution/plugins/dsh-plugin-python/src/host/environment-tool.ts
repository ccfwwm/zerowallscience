import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

/** Register management tools against the Host-owned updater service. */
export function registerEnvironmentTool(ctx: Context, management: import('./management.js').PythonManagement): void {
  const environmentRequest = async (operation: string, args: unknown[]): Promise<Record<string, JsonValue>> => {
    return await management.operation(operation, args) as Record<string, JsonValue>
  }
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'python_environment',
    description: 'Inspect DSH Python dependencies managed by uv. Preview resolves exact package versions without changing the active environment. Applying a confirmed plan creates a new environment; skill dependencies are prepared by explicitly enabling their topic. Never selects system Python.',
    parameters: {
      action: { type: 'string', required: true, enum: ['info', 'preview', 'apply', 'status', 'rollback', 'check_manifest', 'preview_sync', 'apply_sync', 'list_packages', 'diagnose', 'configure', 'scan_local', 'install_runtime', 'task_status'] },
      query: { type: 'string' }, packages: { type: 'array', items: { type: 'string' } },
      offset: { type: 'integer' }, limit: { type: 'integer' }, layer: { type: 'string', enum: ['core', 'science', 'capability'] }, capability_id: { type: 'string' },
      operation: { type: 'string', enum: ['install'] },
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
      if (['apply', 'rollback', 'install_runtime'].includes(args.action) && args.confirm !== true) throw new Error('CONFIRMATION_REQUIRED: show the concrete change plan and obtain approval first.')
      if (['apply_sync', 'configure'].includes(args.action) && args.action === 'apply_sync' && args.confirm !== true) throw new Error('CONFIRMATION_REQUIRED: show the signed dependency plan and obtain approval first.')
      if (['check_manifest', 'preview_sync', 'apply_sync', 'list_packages', 'diagnose', 'configure', 'rollback', 'scan_local', 'install_runtime', 'task_status', 'cancel'].includes(args.action) || (args.action === 'status' && !args.task_id)) {
        const requestId = typeof args.request_id === 'string' && args.request_id.trim() ? args.request_id : randomUUID()
        return environmentRequest('request', [{ action: args.action, requestId, query: args.query, offset: args.offset, limit: args.limit ?? 50, layer: args.layer, capabilityId: args.capability_id, taskId: args.task_id, ...(args.plan_id ? { planId: args.plan_id } : {}), ...(args.manifest_revision ? { manifestRevision: args.manifest_revision } : {}), ...(args.mirror_url ? { mirrorUrl: args.mirror_url } : {}), ...(args.expected_revision !== undefined ? { expectedRevision: args.expected_revision } : {}), ...(args.confirm !== undefined ? { confirm: args.confirm } : {}) }])
      }
      switch (args.action) {
        case 'info': return environmentRequest('request', [{ action: 'list_packages', requestId: randomUUID(), query: args.query, offset: args.offset, limit: args.limit ?? 50 }])
        case 'preview':
          return environmentRequest('preview', [args.packages ?? [], args.operation ?? 'install'])
        case 'apply':
          if (!args.plan_id) throw new Error('plan_id is required')
          { const result = await environmentRequest('apply', [args.plan_id]); return { ...result, task_id: result.taskId ?? null } }
        case 'status': return environmentRequest('status', [args.task_id])
        case 'rollback': { const result = await environmentRequest('rollback', []); return { ...result, task_id: result.taskId ?? null } }
        default: throw new Error('Unknown Python action')
      }
    },
  })))
}
