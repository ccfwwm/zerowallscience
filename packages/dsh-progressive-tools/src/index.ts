/**
 * Cache-stable progressive disclosure for the DeepSeek Harness tool registry.
 *
 * The default mode keeps one byte-stable model-facing surface and dispatches
 * deferred tools through the ordinary Harness execution pipeline. A legacy
 * dynamic mode remains available for deployments that require native schemas.
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { ToolCallId, HarnessError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool, renderToolsSdk, renderToolsSdkPy } from '@deepseek-ai/dsh-tools'
import type {
  InferValue,
  JsonSchemaNode,
  ToolExecutionResult,
  ToolExecutionToken,
} from '@deepseek-ai/dsh-tools'
import {
  buildCatalog,
  estimateSchemaTokens,
  matchesToolName,
  searchTools,
} from './catalog.js'
import {
  DEFAULT_ACTIVATION_GROUP_LIMIT,
  DEFAULT_ALWAYS_VISIBLE,
  DEFAULT_CHARACTERS_PER_TOKEN,
  DEFAULT_DEFER_TOOL_GUIDANCE,
  DEFAULT_DISPATCH_TOOL_NAME,
  DEFAULT_GROUPS,
  DEFAULT_MAX_ACTIVE_GROUPS,
  DEFAULT_MAX_ACTIVE_TOOL_TOKENS,
  DEFAULT_MAX_RESULTS,
  DEFAULT_MODE,
  DEFAULT_REQUIRE_DISCOVERY,
  DEFAULT_RETENTION_TURNS,
  DEFAULT_SKILL_BINDINGS,
  DEFAULT_STATUS_GRANTS_DISCOVERY,
  DEFAULT_TOOL_NAME,
} from './defaults.js'
import {
  activateGroups,
  createProgressiveState,
  expireGroups,
  proposeSearch,
  restoreSnapshot,
  snapshotState,
  touchTool,
} from './state.js'
import type { ProgressiveState } from './state.js'
import type {
  ActiveGroupState,
  DeferredGroupSummary,
  DeferredToolMatch,
  ProgressiveMode,
  ProxySearchResultValue,
  ResolvedConfig,
  SearchResultValue,
  SkillBindingConfig,
  StateSnapshot,
  ToolGroupConfig,
  ToolSchemaView,
} from './types.js'

export { buildCatalog, estimateSchemaTokens, searchCatalog, searchTools } from './catalog.js'
export {
  activateGroups,
  createProgressiveState,
  expireGroups,
  proposeSearch,
  restoreSnapshot,
  snapshotState,
  touchTool,
} from './state.js'
export type {
  ActiveGroupState,
  CatalogTool,
  DeferredGroupSummary,
  DeferredToolMatch,
  ProgressiveMode,
  ProxySearchResultValue,
  ResolvedConfig,
  SearchMatch,
  SearchResultValue,
  SkillBindingConfig,
  StateSnapshot,
  ToolCatalog,
  ToolGroup,
  ToolGroupConfig,
  ToolSchemaView,
} from './types.js'

type JsonValue = InferValue<{ type: 'json' }>

export const name = 'progressive-tools'
export const inject = ['tools', 'systemPrompt']

export interface Config {
  /** Stable proxy is cache-friendly; dynamic exposes changing native families. */
  readonly mode?: ProgressiveMode
  /** Registered discovery tool name. */
  readonly toolName?: string
  /** Registered stable dispatcher name. */
  readonly dispatchToolName?: string
  /** Tool-name wildcard patterns that stay directly visible. */
  readonly alwaysVisible?: readonly string[]
  /** Ordered family rules. The first matching family owns a tool. */
  readonly groups?: readonly ToolGroupConfig[]
  /** Successful skill calls that make bound tools dispatchable. */
  readonly skillBindings?: readonly SkillBindingConfig[]
  /** Maximum exact search matches returned to the caller. */
  readonly maxResults?: number
  /** Highest-ranked families activated by one dynamic-mode search. */
  readonly activationGroupLimit?: number
  /** Maximum retained active families in dynamic mode. */
  readonly maxActiveGroups?: number
  /** Approximate schema-token budget for active dynamic-mode families. */
  readonly maxActiveToolTokens?: number
  /** Dynamic-mode inactivity turns before expiry; zero disables expiry. */
  readonly retentionTurns?: number
  /** Schema characters represented by one estimated token. */
  readonly charactersPerToken?: number
  /** Require a successful search or skill binding before proxy dispatch. */
  readonly requireDiscovery?: boolean
  /** Let one status listing make every cataloged name dispatchable. */
  readonly statusGrantsDiscovery?: boolean
  /** Remove exact hidden tool guidance sections from the stable prompt. */
  readonly deferToolGuidance?: boolean
}

const groupConfigSchema = z.object({
  id: z.string().required(),
  description: z.string(),
  aliases: z.array(z.string()).default([]),
  include: z.array(z.string()).required(),
  exclude: z.array(z.string()).default([]),
})

const skillBindingSchema = z.object({
  skill: z.string().required(),
  groups: z.array(z.string()).required(),
})

export const Config = z.object({
  mode: z.string().default(DEFAULT_MODE),
  toolName: z.string().default(DEFAULT_TOOL_NAME),
  dispatchToolName: z.string().default(DEFAULT_DISPATCH_TOOL_NAME),
  alwaysVisible: z.array(z.string()).default([...DEFAULT_ALWAYS_VISIBLE]),
  groups: z.array(groupConfigSchema).default(DEFAULT_GROUPS.map(group => ({
    ...group,
    description: group.description ?? '',
    aliases: [...group.aliases ?? []],
    include: [...group.include],
    exclude: [...group.exclude ?? []],
  }))),
  skillBindings: z.array(skillBindingSchema).default([]),
  maxResults: z.number().default(DEFAULT_MAX_RESULTS),
  activationGroupLimit: z.number().default(DEFAULT_ACTIVATION_GROUP_LIMIT),
  maxActiveGroups: z.number().default(DEFAULT_MAX_ACTIVE_GROUPS),
  maxActiveToolTokens: z.number().default(DEFAULT_MAX_ACTIVE_TOOL_TOKENS),
  retentionTurns: z.number().default(DEFAULT_RETENTION_TURNS),
  charactersPerToken: z.number().default(DEFAULT_CHARACTERS_PER_TOKEN),
  requireDiscovery: z.boolean().default(DEFAULT_REQUIRE_DISCOVERY),
  statusGrantsDiscovery: z.boolean().default(DEFAULT_STATUS_GRANTS_DISCOVERY),
  deferToolGuidance: z.boolean().default(DEFAULT_DEFER_TOOL_GUIDANCE),
}) as unknown as z<Config>

function nonEmpty(value: string, path: string): string {
  const trimmed = value.trim()
  if (trimmed === '') throw new Error(`${path} must not be empty`)
  return trimmed
}

function integer(value: number, path: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${path} must be a safe integer greater than or equal to ${minimum}`)
  }
  return value
}

export function resolveConfig(config: Config = {}): ResolvedConfig {
  const mode = config.mode ?? DEFAULT_MODE
  if (mode !== 'stable-proxy' && mode !== 'dynamic') {
    throw new Error('mode must be either "stable-proxy" or "dynamic"')
  }
  const toolName = nonEmpty(config.toolName ?? DEFAULT_TOOL_NAME, 'toolName')
  const dispatchToolName = nonEmpty(
    config.dispatchToolName ?? DEFAULT_DISPATCH_TOOL_NAME,
    'dispatchToolName',
  )
  if (toolName === dispatchToolName) throw new Error('toolName and dispatchToolName must differ')
  const alwaysVisible = (config.alwaysVisible ?? DEFAULT_ALWAYS_VISIBLE)
    .map((pattern, index) => nonEmpty(pattern, `alwaysVisible[${index}]`))
  const groups = (config.groups ?? DEFAULT_GROUPS).map((group, index): ToolGroupConfig => {
    const description = group.description?.trim()
    return {
      id: nonEmpty(group.id, `groups[${index}].id`),
      ...(description === undefined || description === '' ? {} : { description }),
      aliases: (group.aliases ?? []).map((alias, aliasIndex) =>
        nonEmpty(alias, `groups[${index}].aliases[${aliasIndex}]`),
      ),
      include: group.include.map((pattern, patternIndex) =>
        nonEmpty(pattern, `groups[${index}].include[${patternIndex}]`),
      ),
      exclude: (group.exclude ?? []).map((pattern, patternIndex) =>
        nonEmpty(pattern, `groups[${index}].exclude[${patternIndex}]`),
      ),
    }
  })
  const groupIds = new Set<string>()
  for (const [index, group] of groups.entries()) {
    if (group.include.length === 0) throw new Error(`groups[${index}].include must not be empty`)
    if (groupIds.has(group.id)) throw new Error(`duplicate group id ${JSON.stringify(group.id)}`)
    groupIds.add(group.id)
  }
  const skillBindings = (config.skillBindings ?? DEFAULT_SKILL_BINDINGS).map((binding, index) => {
    const skill = nonEmpty(binding.skill, `skillBindings[${index}].skill`)
    if (binding.groups.length === 0) throw new Error(`skillBindings[${index}].groups must not be empty`)
    const boundGroups = binding.groups.map((group, groupIndex) =>
      nonEmpty(group, `skillBindings[${index}].groups[${groupIndex}]`),
    )
    for (const group of boundGroups) {
      if (!groupIds.has(group)) {
        throw new Error(`skill binding ${JSON.stringify(skill)} names unknown group ${JSON.stringify(group)}`)
      }
    }
    return { skill, groups: boundGroups }
  })
  const maxResults = integer(config.maxResults ?? DEFAULT_MAX_RESULTS, 'maxResults', 1)
  const activationGroupLimit = integer(
    config.activationGroupLimit ?? DEFAULT_ACTIVATION_GROUP_LIMIT,
    'activationGroupLimit',
    1,
  )
  const maxActiveGroups = integer(config.maxActiveGroups ?? DEFAULT_MAX_ACTIVE_GROUPS, 'maxActiveGroups', 1)
  if (activationGroupLimit > maxActiveGroups) {
    throw new Error('activationGroupLimit must not exceed maxActiveGroups')
  }
  return {
    mode,
    toolName,
    dispatchToolName,
    alwaysVisible,
    groups,
    skillBindings,
    maxResults,
    activationGroupLimit,
    maxActiveGroups,
    maxActiveToolTokens: integer(
      config.maxActiveToolTokens ?? DEFAULT_MAX_ACTIVE_TOOL_TOKENS,
      'maxActiveToolTokens',
      1,
    ),
    retentionTurns: integer(config.retentionTurns ?? DEFAULT_RETENTION_TURNS, 'retentionTurns', 0),
    charactersPerToken: integer(
      config.charactersPerToken ?? DEFAULT_CHARACTERS_PER_TOKEN,
      'charactersPerToken',
      1,
    ),
    requireDiscovery: config.requireDiscovery ?? DEFAULT_REQUIRE_DISCOVERY,
    statusGrantsDiscovery: config.statusGrantsDiscovery ?? DEFAULT_STATUS_GRANTS_DISCOVERY,
    deferToolGuidance: config.deferToolGuidance ?? DEFAULT_DEFER_TOOL_GUIDANCE,
  }
}

interface AgentState {
  readonly agent: Agent
  readonly progressive: ProgressiveState
  readonly discovered: Set<string>
  /** A status call listed the full catalog; grants dispatch only when configured. */
  catalogListed: boolean
  restriction: (() => void) | undefined
  restrictableNames: Set<string>
  eagerNames: Set<string>
  stableNames: Set<string> | undefined
  catalogDirty: boolean
  restored: boolean
}

interface LoggedCall {
  readonly name: string
  readonly arguments: unknown
  readonly turn: number
}

interface ToolSdkSchema extends ToolSchemaView {
  readonly output: JsonSchemaNode
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

function parseActiveGroup(value: unknown): ActiveGroupState | undefined {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || !Number.isSafeInteger(value.activatedAtTurn)
    || !Number.isSafeInteger(value.lastUsedTurn)) return undefined
  return {
    id: value.id,
    activatedAtTurn: value.activatedAtTurn as number,
    lastUsedTurn: value.lastUsedTurn as number,
  }
}

function parseSnapshot(value: unknown): StateSnapshot | undefined {
  if (!isRecord(value) || !Array.isArray(value.activeGroups)) return undefined
  const activeGroups: ActiveGroupState[] = []
  for (const candidate of value.activeGroups) {
    const parsed = parseActiveGroup(candidate)
    if (parsed === undefined) return undefined
    activeGroups.push(parsed)
  }
  return { activeGroups }
}

function snapshotFromSearchValue(value: unknown): StateSnapshot | undefined {
  if (!isRecord(value) || value.protocol !== 'dsh-progressive-tools/v1') return undefined
  return parseSnapshot(value.state)
}

function discoveredFromSearchValue(value: unknown): string[] | undefined {
  if (!isRecord(value) || value.protocol !== 'dsh-progressive-tools/v2') return undefined
  // Cumulative lists (older results, presentation meta) take priority; newer
  // rendered results carry per-call increments that union across events.
  if (Array.isArray(value.allDiscoveredTools)
    && value.allDiscoveredTools.every(name => typeof name === 'string')) {
    return value.allDiscoveredTools as string[]
  }
  if (Array.isArray(value.discoveredTools)
    && value.discoveredTools.every(name => typeof name === 'string')) {
    return value.discoveredTools as string[]
  }
  if (!Array.isArray(value.matches)) return undefined
  const names = value.matches
    .map(match => isRecord(match) && typeof match.name === 'string' ? match.name : undefined)
    .filter((name): name is string => name !== undefined)
  return names
}

function statusFromSearchValue(value: unknown): boolean {
  return isRecord(value)
    && value.protocol === 'dsh-progressive-tools/v2'
    && value.action === 'status'
}

function textContentValue(content: unknown): unknown {
  if (!Array.isArray(content)) return undefined
  const first = content[0]
  return isRecord(first) && first.type === 'text' ? parseJson(first.text) : undefined
}

function nestedDispatch(event: unknown): {
  name: string
  arguments: unknown
  content: unknown
} | undefined {
  if (!isRecord(event)
    || (event.type !== 'tool/ptc-dispatch' && event.type !== 'tool/code-dispatch')
    || !isRecord(event.data)
    || event.data.isError !== false
    || typeof event.data.name !== 'string') return undefined
  // Older log-only records may survive migration as ignorable events.
  return { name: event.data.name, arguments: event.data.arguments, content: event.data.content }
}

function toolResultContent(message: unknown): { callId: string; isError: boolean; value: unknown } | undefined {
  if (!isRecord(message) || !isRecord(message.source) || typeof message.source.callId !== 'string') return undefined
  if (!Array.isArray(message.content) || !isRecord(message.content[0])) return undefined
  const block = message.content[0]
  if (block.type !== 'tool-result') return undefined
  return {
    callId: message.source.callId,
    isError: block.isError === true,
    value: textContentValue(block.content),
  }
}

function skillNameFromArguments(value: unknown): string | undefined {
  const parsed = parseJson(value)
  if (!isRecord(parsed)) return undefined
  if (typeof parsed.name === 'string') return parsed.name
  if (typeof parsed.skill === 'string') return parsed.skill
  return undefined
}

function eventTurn(event: unknown): number {
  if (!isRecord(event) || !isRecord(event.data) || !Number.isSafeInteger(event.data.turn)) return 0
  return event.data.turn as number
}

function cloneSchemas(
  value: readonly { name: string; description: string; parameters: Record<string, unknown> }[],
): ToolSchemaView[] {
  return value.map(schema => ({
    name: schema.name,
    description: schema.description,
    parameters: schema.parameters,
  }))
}

function legacyStateMeta(value: SearchResultValue): JsonValue {
  return {
    protocol: value.protocol,
    state: value.state as unknown as JsonValue,
  }
}

function proxyStateMeta(value: ProxySearchResultValue): JsonValue {
  // Presentation meta never reaches the model, so it can afford the cumulative
  // list: resume restores the full discovery state from the latest entry even
  // when older events were compacted away.
  return {
    protocol: value.protocol,
    action: value.action,
    discoveredTools: [...value.allDiscoveredTools],
  }
}

const activeGroupSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    activatedAtTurn: { type: 'integer', required: true },
    lastUsedTurn: { type: 'integer', required: true },
  },
} as const

const legacySearchResultSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    protocol: { type: 'string', enum: ['dsh-progressive-tools/v1'], required: true },
    action: { type: 'string', enum: ['search', 'status', 'reset'], required: true },
    query: { type: 'string', required: true },
    matches: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          group: { type: 'string', required: true },
          description: { type: 'string', required: true },
          score: { type: 'number', required: true },
          estimatedTokens: { type: 'integer', required: true },
          tools: { type: 'array', items: { type: 'string' }, required: true },
        },
      },
    },
    activatedGroups: { type: 'array', items: { type: 'string' }, required: true },
    evictedGroups: { type: 'array', items: { type: 'string' }, required: true },
    activeGroups: { type: 'array', items: { type: 'string' }, required: true },
    activeTools: { type: 'array', items: { type: 'string' }, required: true },
    estimatedActiveTokens: { type: 'integer', required: true },
    estimatedCatalogTokens: { type: 'integer', required: true },
    estimatedSavedTokens: { type: 'integer', required: true },
    catalogTools: { type: 'integer', required: true },
    state: {
      type: 'object',
      additionalProperties: false,
      required: true,
      properties: {
        activeGroups: { type: 'array', items: activeGroupSchema, required: true },
      },
    },
  },
} as const

const proxyResultSchema = {
  type: 'object',
  additionalProperties: true,
} as const

function legacyResultFromExecution(result: Readonly<ToolExecutionResult>): SearchResultValue | undefined {
  if (result.isError || !isRecord(result.value) || result.value.protocol !== 'dsh-progressive-tools/v1') {
    return undefined
  }
  const snapshot = parseSnapshot(result.value.state)
  if (snapshot === undefined) return undefined
  return result.value as unknown as SearchResultValue
}

function proxyResultFromExecution(result: Readonly<ToolExecutionResult>): ProxySearchResultValue | undefined {
  if (result.isError || !isRecord(result.value) || result.value.protocol !== 'dsh-progressive-tools/v2') {
    return undefined
  }
  return result.value as unknown as ProxySearchResultValue
}

function proxyContent(value: unknown): ContentBlock[] {
  if (!isRecord(value) || !Array.isArray(value.content)) {
    return [{ type: 'text', text: JSON.stringify(value) }]
  }
  return value.content as ContentBlock[]
}

function exactGuidanceForDeferredTool(sectionName: string, deferredNames: ReadonlySet<string>): boolean {
  if (!sectionName.startsWith('tool:') || sectionName === 'tools:sdk' || sectionName === 'tools:code-only') {
    return false
  }
  const suffix = sectionName.slice('tool:'.length)
  for (const name of deferredNames) {
    if (suffix === name || suffix.startsWith(`${name}:`)) return true
  }
  return false
}

export function apply(ctx: Context, input: Config): void {
  const config = resolveConfig(input)
  const states = new WeakMap<Agent, AgentState>()
  const liveStates = new Set<AgentState>()
  const skillBindings = new Map(config.skillBindings.map(binding => [binding.skill, binding.groups] as const))
  const authorizedProxyParents = new Set<ToolExecutionToken>()
  let restrictionMutationDepth = 0

  const mutateRestriction = <T>(operation: () => T): T => {
    restrictionMutationDepth += 1
    try {
      return operation()
    } finally {
      restrictionMutationDepth -= 1
    }
  }

  const disposeRestriction = (state: AgentState): void => {
    const dispose = state.restriction
    state.restriction = undefined
    if (dispose !== undefined) mutateRestriction(dispose)
  }

  const latestTurn = (agent: Agent): number => agent.session.snapshotEvents().reduce(
    (maximum, event) => Math.max(maximum, eventTurn(event)),
    0,
  )

  const ensureState = (agent: Agent): AgentState => {
    const existing = states.get(agent)
    if (existing !== undefined) return existing
    const created: AgentState = {
      agent,
      progressive: createProgressiveState(buildCatalog([], config.groups, config.charactersPerToken), latestTurn(agent)),
      discovered: new Set(),
      catalogListed: false,
      restriction: undefined,
      restrictableNames: new Set(),
      eagerNames: new Set(),
      stableNames: undefined,
      catalogDirty: true,
      restored: false,
    }
    states.set(agent, created)
    liveStates.add(created)
    return created
  }

  const discoverGroups = (state: AgentState, groups: readonly string[]): void => {
    for (const groupId of groups) {
      const group = state.progressive.catalog.groups.get(groupId)
      if (group === undefined) continue
      for (const tool of group.tools) state.discovered.add(tool.name)
    }
  }

  const applySkillBinding = (state: AgentState, argumentsValue: unknown, turn: number): void => {
    const skillName = skillNameFromArguments(argumentsValue)
    if (skillName === undefined) return
    const groups = skillBindings.get(skillName)
    if (groups === undefined) return
    if (config.mode === 'stable-proxy') discoverGroups(state, groups)
    else activateGroups(state.progressive, groups, turn, config)
  }

  const restoreFromEvents = (state: AgentState): void => {
    const calls = new Map<string, LoggedCall>()
    for (const event of state.agent.session.snapshotEvents()) {
      state.progressive.currentTurn = Math.max(state.progressive.currentTurn, eventTurn(event))
      if (event.type === 'tool/call') {
        calls.set(String(event.data.callId), {
          name: event.data.name,
          arguments: event.data.arguments,
          turn: event.data.turn,
        })
        continue
      }
      if (event.type === 'tool/result') {
        const result = toolResultContent(event.data.message)
        if (result === undefined || result.isError) continue
        const call = calls.get(result.callId)
        if (call === undefined) continue
        if (call.name === config.toolName) {
          if (config.mode === 'stable-proxy') {
            const meta = isRecord(event.data.meta) ? event.data.meta : undefined
            const fromMeta = meta === undefined ? undefined : discoveredFromSearchValue(meta)
            for (const name of fromMeta ?? discoveredFromSearchValue(result.value) ?? []) {
              state.discovered.add(name)
            }
            if (statusFromSearchValue(meta) || statusFromSearchValue(result.value)) {
              state.catalogListed = true
            }
          } else {
            const snapshot = isRecord(event.data.meta)
              ? snapshotFromSearchValue({ protocol: event.data.meta.protocol, state: event.data.meta.state })
              : undefined
            const fallback = snapshotFromSearchValue(result.value)
            if (snapshot !== undefined || fallback !== undefined) {
              restoreSnapshot(state.progressive, snapshot ?? fallback!)
            }
          }
        } else if (call.name === 'skill') {
          applySkillBinding(state, call.arguments, call.turn)
        } else if (config.mode === 'dynamic') {
          touchTool(state.progressive, call.name, call.turn)
        }
        continue
      }
      const nested = nestedDispatch(event)
      if (nested === undefined) continue
      if (nested.name === config.toolName) {
        const value = textContentValue(nested.content)
        if (config.mode === 'stable-proxy') {
          for (const name of discoveredFromSearchValue(value) ?? []) state.discovered.add(name)
          if (statusFromSearchValue(value)) state.catalogListed = true
        } else {
          const snapshot = snapshotFromSearchValue(value)
          if (snapshot !== undefined) restoreSnapshot(state.progressive, snapshot)
        }
      } else if (nested.name === 'skill') {
        applySkillBinding(state, nested.arguments, eventTurn(event))
      } else if (config.mode === 'dynamic') {
        touchTool(state.progressive, nested.name, eventTurn(event))
      }
    }
  }

  const rebuildStableCatalog = (state: AgentState): void => {
    const schemas = cloneSchemas(state.agent.ctx.tools.schemas(state.agent))
    if (state.stableNames === undefined) {
      state.stableNames = new Set(schemas
        .filter(schema => schema.name === config.toolName
          || schema.name === config.dispatchToolName
          || matchesToolName(schema.name, config.alwaysVisible))
        .map(schema => schema.name))
    }
    const managed = schemas.filter(schema =>
      schema.name !== 'run_code' && !state.stableNames!.has(schema.name),
    )
    state.progressive.catalog = buildCatalog(managed, config.groups, config.charactersPerToken)
    // Discovered names deliberately survive registry refreshes (for example a
    // provider reconnect); dispatch validates catalog membership at call time.
    if (!state.restored) {
      restoreFromEvents(state)
      state.restored = true
    }
    state.catalogDirty = false
  }

  const rebuildDynamicCatalog = (state: AgentState): void => {
    const previous = snapshotState(state.progressive)
    disposeRestriction(state)
    const unrestricted = cloneSchemas(state.agent.ctx.tools.schemas(state.agent))
    const hideInherited = mutateRestriction(() => state.agent.ctx.tools.restrict({ allow: [] }))
    let ownNames: Set<string>
    try {
      ownNames = new Set(state.agent.ctx.tools.schemas(state.agent).map(schema => schema.name))
    } finally {
      mutateRestriction(hideInherited)
    }
    const restrictable = unrestricted.filter(schema => !ownNames.has(schema.name))
    const eagerNames = new Set(restrictable
      .filter(schema => schema.name === config.toolName || matchesToolName(schema.name, config.alwaysVisible))
      .map(schema => schema.name))
    const managed = restrictable.filter(schema => !eagerNames.has(schema.name))
    state.progressive.catalog = buildCatalog(managed, config.groups, config.charactersPerToken)
    state.restrictableNames = new Set(restrictable.map(schema => schema.name))
    state.eagerNames = eagerNames
    if (state.restored) restoreSnapshot(state.progressive, previous)
    else {
      restoreFromEvents(state)
      state.restored = true
    }
    state.catalogDirty = false
  }

  const installDynamicRestriction = (state: AgentState): void => {
    disposeRestriction(state)
    const allow = new Set(state.eagerNames)
    for (const groupId of state.progressive.active.keys()) {
      const group = state.progressive.catalog.groups.get(groupId)
      if (group === undefined) continue
      for (const tool of group.tools) {
        if (state.restrictableNames.has(tool.name)) allow.add(tool.name)
      }
    }
    state.restriction = mutateRestriction(() => state.agent.ctx.tools.restrict({ allow: [...allow].sort() }))
  }

  const prepareStableState = (agent: Agent): AgentState => {
    const state = ensureState(agent)
    if (state.catalogDirty) rebuildStableCatalog(state)
    return state
  }

  const prepareDynamicState = (agent: Agent, turn: number): AgentState => {
    const state = ensureState(agent)
    state.progressive.currentTurn = Math.max(state.progressive.currentTurn, turn)
    if (state.catalogDirty) rebuildDynamicCatalog(state)
    expireGroups(state.progressive, state.progressive.currentTurn, config)
    installDynamicRestriction(state)
    return state
  }

  const clampLimit = (requested: number | undefined): number => {
    if (requested === undefined) return config.maxResults
    return Math.min(Math.max(requested, 1), config.maxResults)
  }

  const deferredGroupSummaries = (state: AgentState): DeferredGroupSummary[] =>
    [...state.progressive.catalog.groups.values()]
      .map(group => ({
        id: group.id,
        description: group.description.slice(0, 180),
        tools: group.tools.map(tool => tool.name),
      }))
      .sort((left, right) => left.id.localeCompare(right.id))

  const stableSearchResult = (
    state: AgentState,
    action: 'search' | 'status',
    query: string,
    matches: readonly DeferredToolMatch[],
  ): ProxySearchResultValue => {
    // A search discovers the matched tools and their whole families, so one
    // query opens a plugin's full surface instead of only its top-ranked slice.
    const newlyDiscovered = new Set<string>()
    for (const match of matches) {
      if (!state.discovered.has(match.name)) newlyDiscovered.add(match.name)
      for (const sibling of match.groupTools) {
        if (!state.discovered.has(sibling)) newlyDiscovered.add(sibling)
      }
    }
    const allDiscovered = new Set(state.discovered)
    for (const name of newlyDiscovered) allDiscovered.add(name)
    const stableSchemas = cloneSchemas(state.agent.ctx.tools.schemas(state.agent))
      .filter(schema => state.stableNames?.has(schema.name))
    const estimatedVisibleTokens = stableSchemas.reduce(
      (total, schema) => total + estimateSchemaTokens(schema, config.charactersPerToken),
      0,
    )
    return {
      protocol: 'dsh-progressive-tools/v2',
      mode: 'stable-proxy',
      action,
      query,
      matches,
      ...(action === 'status' ? { groups: deferredGroupSummaries(state) } : {}),
      stableTools: [...state.stableNames ?? []].sort(),
      discoveredTools: [...newlyDiscovered].sort(),
      discoveredCount: allDiscovered.size,
      allDiscoveredTools: [...allDiscovered].sort(),
      catalogTools: state.progressive.catalog.tools.size,
      estimatedVisibleTokens,
      estimatedCatalogTokens: state.progressive.catalog.totalEstimatedTokens,
      estimatedSavedTokens: state.progressive.catalog.totalEstimatedTokens,
      instruction: action === 'search'
        ? `Call ${config.dispatchToolName} with an exact returned name and arguments matching its parameters schema.`
        : `Use ${config.toolName} with a task-oriented query to load exact deferred definitions.`,
    }
  }

  if (config.mode === 'stable-proxy') {
    ctx.tools.register(defineTool({
      name: config.toolName,
      description: `Search deferred tools by capability. Use this whenever the visible tools do not cover the task. Returns exact names, descriptions, and parameter schemas for ${config.dispatchToolName}.`,
      parameters: {
        query: {
          type: 'string',
          description: 'Task-oriented capability query. Include the object, action, or service involved.',
        },
        action: {
          type: 'string',
          enum: ['search', 'status'],
          description: `Search definitions, or use status to list every deferred family and catalog estimates. Defaults to search.${config.statusGrantsDiscovery ? ' Status also makes every listed name dispatchable.' : ''}`,
        },
        max_results: {
          type: 'integer',
          description: `Maximum exact tool definitions to return; values are clamped between 1 and ${config.maxResults}.`,
        },
      },
      output: {
        schema: proxyResultSchema,
        render: (_args, value) => {
          // The cumulative list lives in presentation meta only; rendering it
          // would leak the ever-growing discovery table back into the prompt.
          const rendered = { ...(value as Record<string, unknown>) }
          delete rendered.allDiscoveredTools
          return [{ type: 'text', text: JSON.stringify(rendered) }]
        },
        presentationMeta: (_args, value) => proxyStateMeta(value as unknown as ProxySearchResultValue),
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        if (exec.agent === undefined) throw new Error(`${config.toolName} requires an agent-scoped execution`)
        const state = prepareStableState(exec.agent)
        const action = args.action ?? 'search'
        const query = args.query?.trim() ?? ''
        if (action === 'search' && query === '') throw new Error('query is required when action is search')
        const matches = action === 'search'
          ? searchTools(state.progressive.catalog, query, clampLimit(args.max_results))
          : []
        return stableSearchResult(
          state,
          action,
          action === 'search' ? query : '',
          matches,
        ) as unknown as InferValue<typeof proxyResultSchema>
      },
    }))

    ctx.tools.register(defineTool({
      name: config.dispatchToolName,
      description: `Execute one exact tool returned by ${config.toolName}. Copy the returned name exactly and pass arguments that satisfy its parameters schema.`,
      parameters: {
        name: {
          type: 'string',
          required: true,
          description: `Exact tool name returned by ${config.toolName}.`,
        },
        arguments: {
          // MCP/OpenAI clients in the wild sometimes JSON-encode this nested
          // object before sending the outer dispatch envelope. `json` keeps
          // the wire contract permissive; execute() performs the strict
          // object normalization before entering the real tool pipeline.
          type: 'json',
          required: true,
          description: 'Arguments matching the selected tool parameters schema. An object is preferred; JSON text is accepted and decoded before dispatch.',
        },
      },
      output: {
        schema: proxyResultSchema,
        render: (_args, value) => proxyContent(value),
        presentationMeta: (args) => ({
          protocol: 'dsh-progressive-tools/dispatch-v1',
          tool: args.name,
        }),
      },
      // Parallel scheduling follows the real tool's own classifier so deferred
      // tools keep the concurrency they declare; unknown targets stay exclusive.
      isConcurrencySafe(args) {
        const definition = ctx.tools.get(args.name)
        if (definition?.isConcurrencySafe === undefined) return false
        try {
          const decoded = parseJson(args.arguments)
          return isRecord(decoded) && definition.isConcurrencySafe(decoded) === true
        } catch {
          return false
        }
      },
      async execute(args, exec) {
        if (exec.agent === undefined) throw new Error(`${config.dispatchToolName} requires an agent-scoped execution`)
        const state = prepareStableState(exec.agent)
        const decodedArguments = parseJson(args.arguments)
        if (!isRecord(decodedArguments)) {
          throw new Error(`tool ${JSON.stringify(args.name)} arguments must be an object; received JSON text could not be decoded`)
        }
        if (!state.progressive.catalog.tools.has(args.name)) {
          if (state.stableNames?.has(args.name)) {
            throw new Error(`tool ${JSON.stringify(args.name)} is already visible and should be called directly`)
          }
          throw new Error(`tool ${JSON.stringify(args.name)} is not in the deferred catalog`)
        }
        if (config.requireDiscovery
          && !state.discovered.has(args.name)
          && !(config.statusGrantsDiscovery && state.catalogListed)) {
          throw new Error(`tool ${JSON.stringify(args.name)} has not been discovered; call ${config.toolName} with the exact name ${JSON.stringify(args.name)} as the query to load its schema, then dispatch`)
        }
        const definition = exec.agent.ctx.tools.get(args.name, exec.agent)
        if (definition === undefined) throw new Error(`tool ${JSON.stringify(args.name)} is no longer registered`)

        authorizedProxyParents.add(exec.token)
        try {
          const nested = await exec.agent.ctx.tools.execute({
            signal: exec.signal,
            callId: ToolCallId(`${String(exec.callId)}:dispatch`),
            rootCallId: exec.rootCallId,
            parent: exec.token,
            name: args.name,
            arguments: decodedArguments,
            agent: exec.agent,
          })
          for (const context of nested.additionalContexts ?? []) exec.deferContext(context)
          if (nested.concludesTurn === true) exec.concludeTurn()
          if (nested.isError) {
            // A HarnessError keeps the real tool's routable failure identity
            // instead of collapsing it into an unstructured message.
            const failure = new HarnessError(
              `${args.name}: ${nested.error.message}`,
              nested.error.info?.code ?? 'DISPATCH_TARGET_ERROR',
            )
            if (nested.error.info !== undefined) failure.name = nested.error.info.name
            throw failure
          }
          return {
            protocol: 'dsh-progressive-tools/dispatch-v1',
            tool: args.name,
            value: nested.value,
            content: nested.content as unknown as JsonValue,
          } as InferValue<typeof proxyResultSchema>
        } finally {
          authorizedProxyParents.delete(exec.token)
        }
      },
    }))

    ctx.systemPrompt.section({
      name: 'progressive-tools:discovery',
      order: 140,
      text: `Only the common tools are listed initially. When the task needs another capability, call ${config.toolName}; then call ${config.dispatchToolName} with an exact returned name and schema-valid arguments. Tool names mentioned elsewhere in this prompt but not listed as callable must be discovered the same way before dispatch. Use action "status" to browse the complete deferred catalog. Do not claim a capability is unavailable before searching.`,
    })

    ctx.tools.guard((execution) => {
      const agent = execution.agent
      if (agent === undefined) return undefined
      // Prepare lazily so calls arriving before the first assembly or
      // session-start event are still classified against the deferred catalog.
      const state = prepareStableState(agent)
      if (execution.parent !== undefined && authorizedProxyParents.has(execution.parent)) {
        authorizedProxyParents.add(execution.token)
        return undefined
      }
      if (execution.name === 'run_code' || state.stableNames?.has(execution.name)) return undefined
      if (!state.progressive.catalog.tools.has(execution.name)) return undefined
      return `tool ${JSON.stringify(execution.name)} is deferred; use ${config.toolName} and ${config.dispatchToolName}`
    })
  } else {
    ctx.tools.register(defineTool({
      name: config.toolName,
      description: 'Search the hidden tool catalog and activate only the relevant tool families. Use status to inspect active families or reset to release them.',
      parameters: {
        query: {
          type: 'string',
          description: 'Capability to find. Required for search; use task-oriented words.',
        },
        action: {
          type: 'string',
          enum: ['search', 'status', 'reset'],
          description: 'Search activates matching families; status inspects; reset releases them.',
        },
        max_results: {
          type: 'integer',
          description: `Maximum matches to return; values are clamped between 1 and ${config.maxResults}.`,
        },
      },
      output: {
        schema: legacySearchResultSchema,
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        presentationMeta: (_args, value) => legacyStateMeta(value as unknown as SearchResultValue),
      },
      async execute(args, exec) {
        if (exec.agent === undefined) throw new Error(`${config.toolName} requires an agent-scoped execution`)
        const state = prepareDynamicState(exec.agent, latestTurn(exec.agent))
        const action = args.action ?? 'search'
        const query = args.query?.trim() ?? ''
        if (action === 'search' && query === '') throw new Error('query is required when action is search')
        return proposeSearch(
          state.progressive,
          action,
          query,
          clampLimit(args.max_results),
          config,
        ) as InferValue<typeof legacySearchResultSchema>
      },
    }))
  }

  const shapeSdkSection = (state: AgentState, visibleNames: ReadonlySet<string>, text: string): string => {
    const schemas: ToolSdkSchema[] = []
    for (const name of [...visibleNames].sort()) {
      if (name === 'run_code') continue
      const definition = state.agent.ctx.tools.get(name, state.agent)
      if (definition === undefined) continue
      schemas.push({
        name: definition.name,
        description: definition.description,
        parameters: definition.parameters,
        output: definition.output.schema,
      })
    }
    return text.includes('```python') ? renderToolsSdkPy(schemas) : renderToolsSdk(schemas)
  }

  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const resolved = await next()
    const agent = context.agent
    if (agent === undefined) return resolved
    const state = config.mode === 'stable-proxy'
      ? prepareStableState(agent)
      : prepareDynamicState(agent, latestTurn(agent))
    const visibleNames = config.mode === 'stable-proxy'
      ? new Set([...state.stableNames ?? [], 'run_code'])
      : new Set(agent.ctx.tools.schemas(agent).map(schema => schema.name))
    const deferredNames = config.mode === 'stable-proxy'
      ? new Set(state.progressive.catalog.tools.keys())
      : new Set<string>()
    const sections = resolved.sections
      .filter(section => !config.deferToolGuidance
        || !exactGuidanceForDeferredTool(section.name, deferredNames))
      .map(section => section.name === 'tools:sdk'
        ? { ...section, text: shapeSdkSection(state, visibleNames, section.text) }
        : section)
    return {
      ...resolved,
      sections,
      tools: resolved.tools.filter(schema => visibleNames.has(schema.name)),
    }
  }, { prepend: true })

  ctx.on('agent/session-start', ({ agent }) => {
    if (config.mode === 'stable-proxy') prepareStableState(agent)
    else prepareDynamicState(agent, latestTurn(agent))
  }, { prepend: true })

  ctx.on('agent/inbox/claimed', ({ agent, turn }) => {
    if (config.mode === 'dynamic') prepareDynamicState(agent, turn)
  }, { prepend: true })

  ctx.on('agent/pre-step', async ({ agent, turn }, next): Promise<PreStepDecision> => {
    if (config.mode === 'dynamic') prepareDynamicState(agent, turn)
    return next()
  }, { prepend: true })

  ctx.on('tools/result', (exec, result) => {
    authorizedProxyParents.delete(exec.token)
    const agent = exec.agent
    if (agent === undefined || result.isError) return
    const state = ensureState(agent)
    if (exec.name === config.toolName) {
      if (config.mode === 'stable-proxy') {
        const value = proxyResultFromExecution(result)
        for (const name of value?.discoveredTools ?? []) state.discovered.add(name)
        if (value?.action === 'status') state.catalogListed = true
      } else {
        const value = legacyResultFromExecution(result)
        if (value !== undefined) restoreSnapshot(state.progressive, value.state)
        if (!state.catalogDirty) installDynamicRestriction(state)
      }
      return
    }
    if (exec.name === 'skill') {
      applySkillBinding(state, exec.arguments, state.progressive.currentTurn)
      if (config.mode === 'dynamic' && !state.catalogDirty) installDynamicRestriction(state)
      return
    }
    if (config.mode === 'dynamic') touchTool(state.progressive, exec.name, state.progressive.currentTurn)
  })

  ctx.on('tools/change', () => {
    if (restrictionMutationDepth > 0) return
    for (const state of liveStates) state.catalogDirty = true
  })

  ctx.on('agent/disposed', ({ agent }) => {
    const state = states.get(agent)
    if (state === undefined) return
    disposeRestriction(state)
    states.delete(agent)
    liveStates.delete(state)
  })

  ctx.effect(() => () => {
    for (const state of liveStates) disposeRestriction(state)
    liveStates.clear()
    authorizedProxyParents.clear()
  }, 'progressive-tools.agent-state')
}
