/** Session-local discovery of optional tool definitions for standard conversations. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { NativeToolExecutor } from '@deepseek-ai/dsh-tool-executor-native'
import { defineTool, projectToolSchema } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition, ToolModelInput } from '@deepseek-ai/dsh-tools'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { matchMcpCapabilities } from './capability-match.js'

/** Deployment defaults for tools shown before a capability search. */
export const BASE_TOOLS = [
  'read', 'write', 'edit', 'glob', 'grep', 'pwsh', 'bash',
  'ask_user_question', 'todo_write', 'skill', 'tool_search', 'mcp_search', 'mcp_connect',
  'web_search', 'web_fetch', 'job_output', 'job_kill', 'subagent',
]

/** Tool presentation policy; execution continues through the native pipeline. */
export interface ToolDiscoveryConfig {
  toolLoading?: 'on-demand' | 'all'
  alwaysAvailableTools?: string[]
  toolSearchLimit?: number
}

interface Selection {
  names: Set<string>
  discoveryCalls: Set<string>
}

/** Restore only tools selected by completed discovery calls, never a legacy full header. */
function acceptEvent(selection: Selection, event: SessionEvent): void {
  if (event.type === 'tool/call' && ['tool_search', 'mcp_search', 'mcp_connect'].includes(event.data.name)) {
    selection.discoveryCalls.add(event.data.callId)
  }
  if (event.type !== 'tool/result' || event.data.message.isError
    || !selection.discoveryCalls.delete(event.data.message.toolCallId)) return
  for (const block of event.data.message.content) {
    if (block.type !== 'text') continue
    let value: unknown
    try { value = JSON.parse(block.text) }
    catch (_error) { continue /* Only JSON discovery results carry selected names. */ }
    if (value === null || typeof value !== 'object') continue
    const names = 'loadedToolNames' in value ? value.loadedToolNames : 'tools' in value ? value.tools : undefined
    if (!Array.isArray(names)) continue
    for (const name of names) if (typeof name === 'string') selection.names.add(name)
  }
}

class DiscoveryExecutor extends NativeToolExecutor {
  constructor(ctx: Context, private readonly selected: Set<string>, private readonly baseline: Set<string>) { super(ctx) }

  override describe(tools: readonly ToolDefinition[]): ToolModelInput {
    return {
      schemas: tools.filter(tool => this.baseline.has(tool.name) || this.selected.has(tool.name))
        .map(tool => projectToolSchema(tool, false)),
      knownNames: tools.map(tool => tool.name),
    }
  }
}

/**
 * Install scoped native presenters and a registry search, disposed with this plugin.
 * @param ctx - MCP plugin owner; custom and PTC presets keep their executors.
 * @param config - deployment tool-loading policy and search result limit.
 * @returns selection publisher used by MCP connection and search tools.
 */
export function installToolDiscovery(ctx: Context, config: ToolDiscoveryConfig): (agent: object, names: readonly string[]) => void {
  const selections = new WeakMap<Session, Selection>()
  const mounted = new WeakMap<Agent, () => void>()
  const baseline = new Set(config.alwaysAvailableTools ?? BASE_TOOLS)
  const selectionFor = (session: Session): Selection => {
    let selection = selections.get(session)
    if (selection !== undefined) return selection
    selection = { names: new Set(), discoveryCalls: new Set() }
    for (const event of session.snapshotEvents()) acceptEvent(selection, event)
    selections.set(session, selection)
    return selection
  }
  const include = (agent: object, names: readonly string[]): void => {
    if (!('session' in agent)) return
    const session = (agent as Agent).session
    for (const name of names) selectionFor(session).names.add(name)
  }
  if (config.toolLoading === 'all') return include
  const mount = (agent: Agent): void => {
    if (mounted.has(agent) || (agent.session.header.agentPreset ?? 'standard') !== 'standard') return
    const dispose = ctx.effect(function* () {
      yield agent.ctx.tools.setExecutor(new DiscoveryExecutor(agent.ctx, selectionFor(agent.session).names, baseline))
      yield agent.ctx.systemPrompt.section({
      name: 'zerowall:tool-discovery', order: 1050,
      text: 'Only basic tool definitions are initially shown. Use tool_search with a capability or exact tool name to load optional scientific, literature, database, media, SSH, and computer tools for the next step. Use mcp_search to discover or connect remote MCP capabilities. Search results are available only to this conversation; do not guess tool arguments before loading their definitions.',
      })
    })
    mounted.set(agent, dispose)
  }
  ctx.on('agent/created', ({ agent }) => { mount(agent) })
  ctx.on('agent/disposed', ({ agent }) => { mounted.get(agent)?.(); mounted.delete(agent) })
  for (const agent of ctx.get('agents')?.list() ?? []) mount(agent)
  ctx.on('session/event', (session, event) => {
    const selection = selections.get(session)
    if (selection !== undefined) acceptEvent(selection, event)
  })
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'tool_search',
    description: 'Search optional tool capabilities or an exact tool name and load matching definitions for the next model step. Covers scientific research, literature, databases, images, presentations, SSH, and computer tools. Use mcp_search for a remote server that is not connected.',
    parameters: { query: { type: 'string', required: true } },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      const tools = ctx.tools.schemas(exec.agent, exec.toolSet)
      const exact = tools.find(tool => tool.name === args.query.trim())
      const matches = exact === undefined
        ? matchMcpCapabilities(args.query, '', '', tools).tools.slice(0, config.toolSearchLimit ?? 5)
        : [exact]
      const loadedToolNames = matches.map(tool => tool.name)
      if (exec.agent !== undefined) include(exec.agent, loadedToolNames)
      return {
        loadedToolNames,
        matches: matches.map(tool => ({ name: tool.name, description: tool.description.slice(0, 240) })),
        instruction: matches.length > 0 ? 'Matching tool definitions are available on the next model step.' : 'No connected tool matched. Try mcp_search for a remote capability, or search a more specific tool name.',
      }
    },
  })))
  return include
}
