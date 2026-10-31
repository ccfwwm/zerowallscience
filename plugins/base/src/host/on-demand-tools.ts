import type { Context } from '@deepseek-ai/cordis'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'

const TOOL_NAME = 'capability_search'
const MAX_ENABLED_TOOLS = 12
const ON_DEMAND_TRIGGER = 100
const CORE_TOOLS = new Set([
  TOOL_NAME,
  'ask_user_question',
  'bash',
  'create_goal',
  'edit',
  'exit_plan_mode',
  'get_goal',
  'glob',
  'grep',
  'job_kill',
  'job_list',
  'job_output',
  'mcp_connect',
  'mcp_search',
  'read',
  'read_image',
  'r_download_workspace',
  'r_files',
  'research_workflow',
  'schedule_create',
  'schedule_delete',
  'schedule_list',
  'schedule_update',
  'skill_search',
  'skill',
  'subagent',
  'subagent_fork',
  'todo_write',
  'update_goal',
  'web_fetch',
  'web_search',
  'working_directory',
  'write',
  'pwsh',
])

type JsonObject = Record<string, unknown>

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map(item => item.trim()) : []
}

function terms(value: string): string[] {
  return [...new Set(value.toLocaleLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter(term => term.length > 1))]
}

function schemaProperties(schema: ToolSchema): string[] {
  const parameters = object(schema.parameters)
  const properties = object(parameters?.properties)
  return Object.keys(properties ?? {}).slice(0, 18)
}

function rank(schema: ToolSchema, queryTerms: readonly string[]): number {
  const name = schema.name.toLocaleLowerCase()
  const description = schema.description.toLocaleLowerCase()
  const properties = schemaProperties(schema).join(' ').toLocaleLowerCase()
  return queryTerms.reduce((score, term) => score
    + (name.includes(term) ? 5 : 0)
    + (description.includes(term) ? 2 : 0)
    + (properties.includes(term) ? 1 : 0), 0)
}

export function searchToolSchemas(schemas: readonly ToolSchema[], query: string, limit = 8): Array<{ name: string; description: string; parameters: string[] }> {
  const queryTerms = terms(query)
  if (queryTerms.length === 0) return []
  return schemas
    .filter(schema => schema.name !== TOOL_NAME)
    .map(schema => ({ schema, score: rank(schema, queryTerms) }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || left.schema.name.localeCompare(right.schema.name))
    .slice(0, limit)
    .map(({ schema }) => ({ name: schema.name, description: schema.description.slice(0, 240), parameters: schemaProperties(schema) }))
}

export function installOnDemandTools(ctx: Context): void {
  const tools = ctx.tools
  if (tools === undefined) return
  const restrictions = new WeakMap<object, { dispose: () => void; enabled: Set<string> }>()
  const mcpToolNames = () => tools.schemas().map((schema: ToolSchema) => schema.name).filter(name => name.startsWith('mcp__'))
  const allowFor = (agent: any, names: readonly string[]) => {
    if (agent === undefined || agent.ctx?.tools === undefined) return
    // Read the global registry so a second enable call can recover a tool
    // hidden by the agent's current restriction. The scoped view intentionally
    // excludes those names from the model surface.
    const available = new Set(tools.schemas().map((schema: ToolSchema) => schema.name))
    const allow = [...new Set(names)].filter(name => available.has(name))
    const current = restrictions.get(agent)
    current?.dispose()
    restrictions.set(agent, { dispose: agent.ctx.tools.restrict({ allow }), enabled: new Set(allow) })
  }
  ctx.on('agent/created', ({ agent }) => {
    if (tools.schemas(agent).length > ON_DEMAND_TRIGGER) allowFor(agent, [...CORE_TOOLS, ...mcpToolNames()])
  })
  ctx.on('agent/disposed', ({ agent }) => { restrictions.get(agent)?.dispose(); restrictions.delete(agent) })
  ctx.provide('zerowallToolAccess', {
    include(agent: object | undefined, names: readonly string[]) {
      if (agent === undefined || !restrictions.has(agent)) return
      const state = restrictions.get(agent)!
      const available = new Set(tools.schemas().map((schema: ToolSchema) => schema.name))
      for (const name of names) if (available.has(name) && name !== TOOL_NAME) state.enabled.add(name)
      allowFor(agent, [...CORE_TOOLS, ...state.enabled])
    },
  } as never)
  ctx.effect(() => tools.register(defineTool({
    name: TOOL_NAME,
    description: 'Find a tool by task or capability. Search returns exact available names; call again with enable set to the exact names before using them. Disable loaded tools when no longer needed.',
    parameters: {
      query: { type: 'string' },
      enable: { type: 'array', items: { type: 'string' } },
      disable: { type: 'array', items: { type: 'string' } },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args: { query?: string; enable?: string[]; disable?: string[] }, exec) {
      const available = tools.schemas()
      const byName = new Map(available.map(schema => [schema.name, schema]))
      const enabled = list(args.enable)
      const disabled = list(args.disable)
      if (enabled.length > MAX_ENABLED_TOOLS) throw new Error(`Load at most ${MAX_ENABLED_TOOLS} tools at once.`)
      for (const name of [...enabled, ...disabled]) {
        if (!byName.has(name) || name === TOOL_NAME) throw new Error(`Tool is not available to this conversation: ${name}`)
      }
      if (exec.agent !== undefined && restrictions.has(exec.agent)) {
        const state = restrictions.get(exec.agent)!
        for (const name of enabled) state.enabled.add(name)
        for (const name of disabled) state.enabled.delete(name)
        allowFor(exec.agent, [...CORE_TOOLS, ...state.enabled])
      }
      return {
        matches: searchToolSchemas(available, args.query ?? ''),
        enabled,
        disabled,
        availableCount: available.filter(schema => schema.name !== TOOL_NAME).length,
        instruction: 'Call an enabled tool in the next step. Loaded tools remain available for this session until disabled.',
      }
    },
  })), 'zerowall: on-demand tool catalog')
}
