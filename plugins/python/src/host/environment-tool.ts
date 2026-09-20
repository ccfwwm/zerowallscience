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
    description: 'Inspect managed Python and package versions; preview install/upgrade/uninstall, apply an approved plan, track progress, or roll back. Never invokes system Python.',
    parameters: {
      action: { type: 'string', required: true, enum: ['info', 'versions', 'preview', 'apply', 'status', 'rollback'] },
      query: { type: 'string' }, packages: { type: 'array', items: { type: 'string' } },
      operation: { type: 'string', enum: ['install', 'uninstall'] },
      profile: { type: 'string', description: 'Optional isolated dependency directory, e.g. sbol; uses the same managed interpreter.' },
      plan_id: { type: 'string' }, task_id: { type: 'string' }, confirm: { type: 'boolean' },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args) {
      if (['apply', 'rollback'].includes(args.action) && args.confirm !== true) throw new Error('CONFIRMATION_REQUIRED: show the concrete change plan and obtain approval first.')
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
