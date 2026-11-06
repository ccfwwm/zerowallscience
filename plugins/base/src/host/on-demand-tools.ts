import type { Context } from '@deepseek-ai/cordis'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createToolLoaders, type ToolLoader } from './tool-loaders.ts'
import { TASK_ROUTING } from './task-routing.ts'

const TOOL_NAME = 'capability_search'
const MAX_ENABLED_TOOLS = 12
const ON_DEMAND_TRIGGER = 100
// Exact exported names from dsh-ppt-maker's suite, not a prefix fallback.
// An absent/disabled provider must never trigger disk discovery or installation.
const PPT_TOOLS = ['ppt_create', 'ppt_themes', 'ppt_edit', 'ppt_undo', 'ppt_redo', 'ppt_render', 'ppt_export', 'ppt_check', 'ppt_import', 'ppt_open', 'ppt_patch'] as const
const CORE_TOOLS = new Set([
  TOOL_NAME,
  'ask_user_question',
  'bash',
  'create_goal',
  'edit',
  'exit_plan_mode',
  'get_goal',
  'generate_image',
  'edit_image',
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
  if (TASK_ROUTING.isContinuation(query)) return []
  const queryTerms = TASK_ROUTING.terms(query)
  if (queryTerms.length === 0) return []
  const hints = [...new Set(TASK_ROUTING.match(query).flatMap(route => [...route.tools]))]
  const exactNames = new Set(queryTerms)
  return [...new Map(schemas.map(schema => [schema.name, schema])).values()]
    .filter(schema => schema.name !== TOOL_NAME)
    .map(schema => {
      const position = hints.indexOf(schema.name)
      const score = (exactNames.has(schema.name.toLocaleLowerCase()) ? 10_000 : 0)
        + (position < 0 ? 0 : 1000 - position * 10) + Math.min(50, rank(schema, queryTerms))
      return { schema, score }
    })
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || left.schema.name.localeCompare(right.schema.name))
    .slice(0, limit)
    .map(({ schema }) => ({ name: schema.name, description: schema.description.slice(0, 240), parameters: schemaProperties(schema) }))
}

export function installOnDemandTools(ctx: Context): void {
  const tools = ctx.tools
  if (tools === undefined) return
  const restrictions = new Map<object, { dispose: () => void; enabled: Set<string> }>()
  ctx.effect(() => () => { for (const state of restrictions.values()) state.dispose(); restrictions.clear() })
  const loaders = createToolLoaders(name => tools.get(name) !== undefined)
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
  const include = (agent: object | undefined, names: readonly string[]) => {
    if (agent === undefined || !restrictions.has(agent)) return
    const state = restrictions.get(agent)!
    const available = new Set(tools.schemas().map((schema: ToolSchema) => schema.name))
    let changed = false
    for (const name of names) if (available.has(name) && name !== TOOL_NAME && !state.enabled.has(name)) { state.enabled.add(name); changed = true }
    if (changed) allowFor(agent, [...CORE_TOOLS, ...state.enabled])
  }
  const ensure = async (agent: object | undefined, name: string, signal?: AbortSignal) => {
    if (!await loaders.ensure(name, signal)) return false
    include(agent, [name])
    return true
  }
  ctx.provide('zerowallToolAccess', {
    include,
    ensure,
    registerLoader: (loader: ToolLoader) => loaders.register(loader),
  } as never)
  ctx.inject(['dshPptMakerTools'], (providerCtx) => {
    const provider = providerCtx.get('dshPptMakerTools') as { ensureRegistered(): void } | undefined
    if (provider === undefined) return
    providerCtx.effect(() => loaders.register({
      id: 'dsh-ppt-maker', names: PPT_TOOLS,
      description: 'PPT PowerPoint presentation tools: create, edit, check, render, export, import, open, patch, themes, undo and redo.',
      load: () => provider.ensureRegistered(),
    }))
  })
  // Around-dispatch runs AFTER policy, human approval and monotonic guards.
  // Loading in pre-execute would miss approved `ask` calls and load denied
  // guard calls. Reuse the original dispatch once; never replay a tool body.
  ctx.on('tools/execute', async (exec, next) => {
    await ensure(exec.agent, exec.name, exec.signal)
    return next()
  })
  ctx.effect(() => tools.register(defineTool({
    name: TOOL_NAME,
    description: 'Find an installed tool by task or capability. Search includes declared local tools awaiting registration without loading them. Enable exact names to load and expose their real schemas before use. Disable tools when no longer needed.',
    parameters: {
      query: { type: 'string' },
      enable: { type: 'array', items: { type: 'string' } },
      disable: { type: 'array', items: { type: 'string' } },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args: { query?: string; enable?: string[]; disable?: string[] }, exec) {
      const available = [...tools.schemas(), ...loaders.catalog()]
      const byName = new Map(available.map(schema => [schema.name, schema]))
      const enabled = list(args.enable)
      const disabled = list(args.disable)
      if (enabled.length > MAX_ENABLED_TOOLS) throw new Error(`Load at most ${MAX_ENABLED_TOOLS} tools at once.`)
      for (const name of [...enabled, ...disabled]) {
        if (!byName.has(name) || name === TOOL_NAME) throw new Error(`Tool is not available to this conversation: ${name}`)
      }
      for (const name of enabled) await ensure(exec.agent, name, exec.signal)
      if (exec.agent !== undefined && restrictions.has(exec.agent)) {
        const state = restrictions.get(exec.agent)!
        for (const name of enabled) state.enabled.add(name)
        for (const name of disabled) state.enabled.delete(name)
        allowFor(exec.agent, [...CORE_TOOLS, ...state.enabled])
      }
      // Independent conversation restrictions still apply after our own
      // on-demand mask is lifted. Never claim a hidden tool was enabled.
      const visible = tools.schemas(exec.agent)
      const visibleNames = new Set(visible.map(schema => schema.name))
      const unavailable = enabled.filter(name => !visibleNames.has(name))
      return {
        matches: searchToolSchemas([...tools.schemas(), ...loaders.catalog()], args.query ?? ''),
        enabled: enabled.filter(name => visibleNames.has(name)),
        schemas: visible.filter(schema => enabled.includes(schema.name)).map(schema => ({
          name: schema.name, description: schema.description, parameters: JSON.parse(JSON.stringify(schema.parameters)),
        })),
        ...(unavailable.length ? { unavailable } : {}),
        disabled,
        availableCount: available.filter(schema => schema.name !== TOOL_NAME).length,
        instruction: unavailable.length
          ? 'Some requested tools remain hidden by this conversation\'s tool restrictions. Their schemas were not exposed. Do not reconnect unrelated MCP servers or claim those tools are enabled.'
          : 'Call an enabled tool in the next step using its real schema. Loaded tools remain available for this session until disabled.',
      }
    },
  })), 'zerowall: on-demand tool catalog')
}
