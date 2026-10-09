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
  CODING_PROFILE_PATTERNS,
  DEFAULT_ACTIVATION_GROUP_LIMIT,
  DEFAULT_ALWAYS_VISIBLE,
  DEFAULT_CAPABILITY_SUMMARY_CHARACTERS,
  DEFAULT_CHARACTERS_PER_TOKEN,
  DEFAULT_AUTOLOAD_MAX_TOOLS,
  DEFAULT_DEFER_TOOL_GUIDANCE,
  DEFAULT_DISPATCH_TOOL_NAME,
  DEFAULT_FAMILY_DISCOVERY,
  DEFAULT_GROUPS,
  DEFAULT_LEGACY_RESULTS,
  DEFAULT_MAX_ACTIVE_GROUPS,
  DEFAULT_MAX_ACTIVE_TOOL_TOKENS,
  DEFAULT_MAX_RESULT_CHARACTERS,
  DEFAULT_MAX_RESULTS,
  DEFAULT_MODE,
  DEFAULT_PROFILE,
  DEFAULT_REPEAT_DEFINITIONS,
  DEFAULT_REQUIRE_DISCOVERY,
  DEFAULT_RESULT_BUDGET,
  DEFAULT_RESULT_BUDGET_CHARACTERS,
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
import {
  capabilitySummary,
  DISPATCH_PROTOCOL_V1,
  DISPATCH_PROTOCOL_V2,
  historyText,
  projectSearch,
  SEARCH_PROTOCOL_V3,
} from './projection.js'
import { budgetDispatchContent, dropAgentResults, dropAllResults, readStoredResult } from './result-budget.js'
import type {
  ActiveGroupState,
  DeferredGroupSummary,
  DeferredToolMatch,
  FamilyDiscovery,
  ProgressiveMode,
  ProxySearchResultValue,
  RepeatDefinitions,
  ResolvedConfig,
  SearchResultValue,
  SkillBindingConfig,
  StateSnapshot,
  SurfaceProfile,
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
  /** Restore v2 search values and the v1 dispatch envelope that repeats content. */
  readonly legacyResults?: boolean
  /** Character budget for one stable search result. Schemas are not truncated. */
  readonly maxResultCharacters?: number
  /** Optional coding surface. Explicit alwaysVisible replaces the profile list. */
  readonly profile?: SurfaceProfile
  /** Return a short notice when the same definition is still in derived history. */
  readonly repeatDefinitions?: RepeatDefinitions
  /** Character budget for the frozen capability summary. */
  readonly capabilitySummaryCharacters?: number
  /** Budget model-visible direct dispatch text. Off until a measured deployment enables it. */
  readonly resultBudget?: boolean
  readonly resultBudgetCharacters?: number
  /** family keeps sibling discovery; matched discovers only returned schemas. */
  readonly familyDiscovery?: FamilyDiscovery
  /**
   * Load every deferred tool onto the frozen surface when the deferred catalog
   * is at most this size. Zero keeps the default search surface.
   */
  readonly autoloadMaxTools?: number
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
  legacyResults: z.boolean().default(DEFAULT_LEGACY_RESULTS),
  maxResultCharacters: z.number().default(DEFAULT_MAX_RESULT_CHARACTERS),
  profile: z.string().default(DEFAULT_PROFILE),
  repeatDefinitions: z.string().default(DEFAULT_REPEAT_DEFINITIONS),
  capabilitySummaryCharacters: z.number().default(DEFAULT_CAPABILITY_SUMMARY_CHARACTERS),
  resultBudget: z.boolean().default(DEFAULT_RESULT_BUDGET),
  resultBudgetCharacters: z.number().default(DEFAULT_RESULT_BUDGET_CHARACTERS),
  familyDiscovery: z.string().default(DEFAULT_FAMILY_DISCOVERY),
  autoloadMaxTools: z.number().default(DEFAULT_AUTOLOAD_MAX_TOOLS),
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
  const alwaysVisible = visiblePatterns(config)
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
    legacyResults: config.legacyResults ?? DEFAULT_LEGACY_RESULTS,
    maxResultCharacters: integer(
      config.maxResultCharacters ?? DEFAULT_MAX_RESULT_CHARACTERS,
      'maxResultCharacters',
      1,
    ),
    profile: resolveProfile(config.profile),
    repeatDefinitions: resolveRepeat(config.repeatDefinitions),
    capabilitySummaryCharacters: integer(
      config.capabilitySummaryCharacters ?? DEFAULT_CAPABILITY_SUMMARY_CHARACTERS,
      'capabilitySummaryCharacters',
      1,
    ),
    resultBudget: config.resultBudget ?? DEFAULT_RESULT_BUDGET,
    resultBudgetCharacters: integer(
      config.resultBudgetCharacters ?? DEFAULT_RESULT_BUDGET_CHARACTERS,
      'resultBudgetCharacters',
      1,
    ),
    familyDiscovery: resolveFamilyDiscovery(config.familyDiscovery),
    autoloadMaxTools: integer(
      config.autoloadMaxTools ?? DEFAULT_AUTOLOAD_MAX_TOOLS,
      'autoloadMaxTools',
      0,
    ),
  }
}

function resolveProfile(value: string | undefined): SurfaceProfile {
  const profile = value ?? DEFAULT_PROFILE
  if (profile !== 'default' && profile !== 'coding' && profile !== 'auto') {
    throw new Error('profile must be "default", "coding", or "auto"')
  }
  return profile
}

function resolveRepeat(value: string | undefined): RepeatDefinitions {
  const repeat = value ?? DEFAULT_REPEAT_DEFINITIONS
  if (repeat !== 'compact' && repeat !== 'full') {
    throw new Error('repeatDefinitions must be either "compact" or "full"')
  }
  return repeat
}

function resolveFamilyDiscovery(value: string | undefined): FamilyDiscovery {
  const discovery = value ?? DEFAULT_FAMILY_DISCOVERY
  if (discovery !== 'family' && discovery !== 'matched') {
    throw new Error('familyDiscovery must be either "family" or "matched"')
  }
  return discovery
}

function samePatterns(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((pattern, index) => pattern === right[index])
}

function visiblePatterns(config: Config): readonly string[] {
  const explicit = config.alwaysVisible
  const coding = (config.profile ?? DEFAULT_PROFILE) === 'coding'
  if (!coding) return explicit ?? [...DEFAULT_ALWAYS_VISIBLE]
  // A schema default fills alwaysVisible before apply. Treat that default as
  // "not customized" so the coding profile can add registered terminal tools.
  // Any other list is an explicit user surface and wins.
  if (explicit === undefined || samePatterns(explicit, DEFAULT_ALWAYS_VISIBLE)) {
    return [...DEFAULT_ALWAYS_VISIBLE, ...CODING_PROFILE_PATTERNS]
  }
  return explicit
}

function freezeStableNames(schemas: readonly ToolSchemaView[], config: ResolvedConfig): Set<string> {
  let patterns = config.alwaysVisible
  if (config.profile === 'auto' && samePatterns(patterns, DEFAULT_ALWAYS_VISIBLE)) {
    const terminal = schemas.some(schema =>
      schema.name !== 'run_code' && matchesToolName(schema.name, CODING_PROFILE_PATTERNS),
    )
    if (terminal) patterns = [...DEFAULT_ALWAYS_VISIBLE, ...CODING_PROFILE_PATTERNS]
  }
  const names = new Set(schemas
    .filter(schema => schema.name === config.toolName
      || schema.name === config.dispatchToolName
      || (config.resultBudget && schema.name === 'tool_result_read')
      || matchesToolName(schema.name, patterns))
    .map(schema => schema.name))
  if (config.autoloadMaxTools > 0) {
    const deferred = schemas.filter(schema => schema.name !== 'run_code' && !names.has(schema.name))
    if (deferred.length > 0 && deferred.length <= config.autoloadMaxTools) {
      for (const schema of deferred) names.add(schema.name)
    }
  }
  return names
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
  readonly guidance: Map<string, string>
  readonly skillGranted: Set<string>
  capabilityText: string | undefined
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

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) return undefined
  return value as string[]
}

function discoveredFromSearchValue(value: unknown): string[] | undefined {
  if (!isRecord(value)) return undefined
  if (value.protocol !== 'dsh-progressive-tools/v2' && value.protocol !== SEARCH_PROTOCOL_V3) return undefined
  // Cumulative lists (older results, presentation meta) take priority; newer
  // rendered results carry per-call increments that union across events.
  const cumulative = stringArray(value.allDiscoveredTools)
  if (cumulative !== undefined) return cumulative
  const increment = stringArray(value.discoveredTools)
  if (increment !== undefined) return increment
  const names = new Set<string>()
  if (Array.isArray(value.families)) {
    for (const family of value.families) {
      if (!isRecord(family) || !Array.isArray(family.tools)) continue
      for (const tool of family.tools) {
        if (typeof tool === 'string') names.add(tool)
        else if (isRecord(tool) && typeof tool.name === 'string') names.add(tool.name)
      }
    }
  }
  if (Array.isArray(value.matches)) {
    for (const match of value.matches) {
      if (!isRecord(match)) continue
      if (typeof match.name === 'string') names.add(match.name)
      for (const name of stringArray(match.groupTools) ?? []) names.add(name)
    }
  }
  return names.size > 0 ? [...names] : undefined
}

function statusFromSearchValue(value: unknown): boolean {
  return isRecord(value)
    && (value.protocol === 'dsh-progressive-tools/v2' || value.protocol === SEARCH_PROTOCOL_V3)
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
  if (!Array.isArray(message.content)) return undefined
  const block = message.content[0]
  // Older logs wrap the model content in a tool-result block. Current host
  // messages carry that content directly and put isError on the message.
  if (isRecord(block) && block.type === 'tool-result') {
    return {
      callId: message.source.callId,
      isError: block.isError === true,
      value: textContentValue(block.content),
    }
  }
  return {
    callId: message.source.callId,
    isError: message.isError === true,
    value: textContentValue(message.content),
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

function proxyContent(value: unknown): ContentBlock[] {
  if (!isRecord(value) || !Array.isArray(value.content)) {
    return [{ type: 'text', text: JSON.stringify(value) }]
  }
  return value.content as ContentBlock[]
}

function deferredToolForSection(sectionName: string, deferredNames: ReadonlySet<string>): string | undefined {
  if (!exactGuidanceForDeferredTool(sectionName, deferredNames)) return undefined
  const suffix = sectionName.slice('tool:'.length)
  for (const name of deferredNames) {
    if (suffix === name || suffix.startsWith(`${name}:`)) return name
  }
  return undefined
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
      guidance: new Map(),
      skillGranted: new Set(),
      capabilityText: undefined,
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
    if (config.mode === 'stable-proxy') {
      discoverGroups(state, groups)
      for (const groupId of groups) {
        const group = state.progressive.catalog.groups.get(groupId)
        if (group === undefined) continue
        for (const tool of group.tools) state.skillGranted.add(tool.name)
      }
    } else activateGroups(state.progressive, groups, turn, config)
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
      state.stableNames = freezeStableNames(schemas, config)
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

  const pendingCumulative = new Map<string, { names: readonly string[]; omittedDefinitionTokens: number }>()
  const dispatchContent = new Map<ToolExecutionToken, ContentBlock[]>()

  const searchPresentationMeta = (value: unknown): JsonValue => {
    if (isRecord(value) && value.protocol === SEARCH_PROTOCOL_V3) {
      const resume = typeof value.resume === 'string' ? value.resume : ''
      const pending = pendingCumulative.get(resume)
      const discovered = pending?.names ?? discoveredFromSearchValue(value) ?? []
      const omitted = pending?.omittedDefinitionTokens ?? 0
      return {
        protocol: SEARCH_PROTOCOL_V3,
        action: value.action === 'status' ? 'status' : 'search',
        discoveredTools: [...discovered],
        omittedDefinitionTokens: omitted,
        estimatedSavedTokens: omitted,
      }
    }
    return proxyStateMeta(value as unknown as ProxySearchResultValue)
  }

  const currentSearchResult = (
    state: AgentState,
    callId: string,
    action: 'search' | 'status',
    query: string,
    matches: readonly DeferredToolMatch[],
    reload: boolean,
  ): Record<string, unknown> => {
    const resume = String(callId)
    if (action === 'status') {
      pendingCumulative.set(resume, {
        names: [...state.discovered].sort(),
        omittedDefinitionTokens: state.progressive.catalog.totalEstimatedTokens,
      })
      return {
        protocol: SEARCH_PROTOCOL_V3,
        mode: 'stable-proxy',
        action,
        query: '',
        matches: [],
        families: [],
        groups: deferredGroupSummaries(state),
        instruction: `Use ${config.toolName} with a task-oriented query to load exact deferred definitions. Status does not repeat parameter schemas.`,
        resume,
      }
    }
    const projected = projectSearch({
      query,
      ranked: matches,
      guidance: state.guidance,
      historyText: historyText(state.agent.session.deriveMessages()),
      reload,
      repeatDefinitions: config.repeatDefinitions,
      maxResultCharacters: config.maxResultCharacters,
      familyDiscovery: config.familyDiscovery,
      skillGranted: state.skillGranted,
      dispatchToolName: config.dispatchToolName,
      searchToolName: config.toolName,
    })
    const cumulative = new Set(state.discovered)
    for (const name of projected.discoveredNames) cumulative.add(name)
    pendingCumulative.set(resume, {
      names: [...cumulative].sort(),
      omittedDefinitionTokens: state.progressive.catalog.totalEstimatedTokens,
    })
    return { ...projected.result, resume }
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
      description: `Search deferred tools by task-oriented capability when the visible tools cannot do the work. Do not use this only to prove that a requested name is missing; refuse invented or uncallable names from the visible surface.`,
      parameters: {
        query: {
          type: 'string',
          description: 'Task-oriented capability query. Include the object, action, or service involved. Do not pass an invented tool name just to confirm it is absent.',
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
        reload: {
          type: 'boolean',
          description: 'Return full parameter schemas even when the same definition is already in the conversation.',
        },
      },
      output: {
        schema: proxyResultSchema,
        render: (_args, value) => {
          // Cumulative discovery stays in presentation meta. The rendered copy
          // also drops the resume handle used only to populate that meta.
          const rendered = { ...(value as Record<string, unknown>) }
          delete rendered.allDiscoveredTools
          delete rendered.resume
          return [{ type: 'text', text: JSON.stringify(rendered) }]
        },
        presentationMeta: (_args, value) => searchPresentationMeta(value),
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
        if (config.legacyResults) {
          return stableSearchResult(
            state,
            action,
            action === 'search' ? query : '',
            matches,
          ) as unknown as InferValue<typeof proxyResultSchema>
        }
        return currentSearchResult(state, exec.callId, action, query, matches, args.reload === true) as unknown as InferValue<typeof proxyResultSchema>
      },
    }))

    ctx.tools.register(defineTool({
      name: config.dispatchToolName,
      description: `Execute one exact tool returned by ${config.toolName}. Copy the returned name exactly and pass arguments that satisfy its parameters schema. A program receives { protocol, tool, value }; value is the target canonical value and does not repeat rendered content.`,
      parameters: {
        name: {
          type: 'string',
          required: true,
          description: `Exact tool name returned by ${config.toolName}.`,
        },
        arguments: {
          type: 'object',
          additionalProperties: true,
          required: true,
          description: 'Arguments matching the selected tool parameters schema.',
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
      finalizeContent(exec, result) {
        const stored = dispatchContent.get(exec.token)
        dispatchContent.delete(exec.token)
        if (result.isError || stored === undefined) return undefined
        // Nested calls keep the target rendering. The outer run_code result
        // carries the separate model-text budget, so the body is not compressed twice.
        if (!config.resultBudget || exec.parent !== undefined || exec.agent === undefined) return [...stored]
        const toolName = isRecord(exec.arguments) && typeof exec.arguments.name === 'string'
          ? exec.arguments.name
          : config.dispatchToolName
        return budgetDispatchContent(String(exec.agent.id), toolName, stored, config.resultBudgetCharacters)
      },
      isConcurrencySafe(args) {
        const definition = ctx.tools.get(args.name)
        if (definition?.isConcurrencySafe === undefined) return false
        try {
          return definition.isConcurrencySafe(args.arguments) === true
        } catch {
          return false
        }
      },
      async execute(args, exec) {
        if (exec.agent === undefined) throw new Error(`${config.dispatchToolName} requires an agent-scoped execution`)
        const state = prepareStableState(exec.agent)
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
            arguments: args.arguments,
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
          if (config.legacyResults) {
            return {
              protocol: DISPATCH_PROTOCOL_V1,
              tool: args.name,
              value: nested.value,
              content: nested.content as unknown as JsonValue,
            } as InferValue<typeof proxyResultSchema>
          }
          dispatchContent.set(exec.token, [...nested.content])
          return {
            protocol: DISPATCH_PROTOCOL_V2,
            tool: args.name,
            value: nested.value,
          } as InferValue<typeof proxyResultSchema>
        } finally {
          authorizedProxyParents.delete(exec.token)
        }
      },
    }))

    if (config.resultBudget) {
      ctx.tools.register(defineTool({
        name: 'tool_result_read',
        description: 'Read the original text of a budgeted tool result by its ref. Use range or keyword search before asking for the full text.',
        parameters: {
          ref: { type: 'string', required: true, description: 'Reference from a budgeted tool result.' },
          mode: { type: 'string', enum: ['full', 'range', 'search'], description: 'Defaults to range.' },
          start: { type: 'integer', description: 'Inclusive character start for range.' },
          end: { type: 'integer', description: 'Exclusive character end for range.' },
          keyword: { type: 'string', description: 'Substring for search mode.' },
        },
        output: {
          schema: proxyResultSchema,
          render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        async execute(args, exec) {
          if (exec.agent === undefined) throw new Error('tool_result_read requires an agent-scoped execution')
          const mode = args.mode === 'full' || args.mode === 'search' ? args.mode : 'range'
          const read = readStoredResult(String(exec.agent.id), args.ref, {
            mode,
            ...(args.start === undefined ? {} : { start: args.start }),
            ...(args.end === undefined ? {} : { end: args.end }),
            ...(args.keyword === undefined ? {} : { keyword: args.keyword }),
          })
          if (!read.ok) throw new Error(read.message)
          return { protocol: 'dsh-progressive-tools/result-read-v1', text: read.text }
        },
      }))
    }

    const skillFamilies = config.skillBindings.map(binding => `${binding.skill}: ${binding.groups.join(', ')}`).join('; ')
    ctx.systemPrompt.section({
      name: 'progressive-tools:discovery',
      order: 140,
      text: `Only the common tools are listed initially. When the task needs another capability, call ${config.toolName} with a task-oriented query; then call ${config.dispatchToolName} with an exact returned name and schema-valid arguments. Tool names mentioned elsewhere in this prompt but not listed as callable must be discovered the same way before dispatch. Use action "status" to browse the complete deferred catalog. Search before declaring a needed capability class unavailable. Do not search merely to prove a named tool is missing: invented names, and names that are not on the visible surface when a refusal is enough, should be refused without searching. A program result from ${config.dispatchToolName} is { protocol, tool, value }; value is the target canonical value. Skill bindings supply the call contract for their families${skillFamilies === '' ? ' (none configured)' : `: ${skillFamilies}`}.`,
    })

    ctx.tools.guard((execution) => {
      const agent = execution.agent
      if (agent === undefined) return undefined
      // Prepare lazily so calls arriving before the first assembly or
      // agent/created event are still classified against the deferred catalog.
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
    const guidance = new Map<string, string>()
    const sections = []
    for (const section of resolved.sections) {
      const guided = config.mode === 'stable-proxy' && config.deferToolGuidance
        ? deferredToolForSection(section.name, deferredNames)
        : undefined
      if (guided !== undefined) {
        const previous = guidance.get(guided)
        guidance.set(guided, previous === undefined ? section.text : `${previous}\n\n${section.text}`)
        continue
      }
      sections.push(section.name === 'tools:sdk'
        ? { ...section, text: shapeSdkSection(state, visibleNames, section.text) }
        : section)
    }
    if (config.mode === 'stable-proxy') {
      state.guidance.clear()
      for (const [name, text] of guidance) state.guidance.set(name, text)
      if (state.capabilityText === undefined) {
        state.capabilityText = capabilitySummary(
          state.progressive.catalog,
          config.capabilitySummaryCharacters,
        )
      }
      sections.push({
        name: 'progressive-tools:capabilities',
        order: 141,
        text: state.capabilityText,
      })
    }
    return {
      ...resolved,
      sections,
      tools: resolved.tools.filter(schema => visibleNames.has(schema.name)),
    }
  }, { prepend: true })

  ctx.on('agent/created', ({ agent }) => {
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

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    if (!config.resultBudget || config.mode !== 'stable-proxy') return decision
    if (exec.name !== 'run_code' || exec.parent !== undefined || exec.agent === undefined) return decision
    if (result.isError || decision.kind !== 'accept' || Object.hasOwn(decision, 'value')) return decision
    const content = decision.content ?? result.content
    const text = content.map(block => block.type === 'text' ? block.text : '').join('')
    if (text.length <= config.resultBudgetCharacters) return decision
    const budgeted = budgetDispatchContent(
      String(exec.agent.id),
      'run_code',
      content,
      config.resultBudgetCharacters,
    )
    return {
      kind: 'accept',
      content: budgeted,
      ...(decision.additionalContexts === undefined ? {} : { additionalContexts: decision.additionalContexts }),
    }
  }, { prepend: true })

  ctx.on('tools/result', (exec, result) => {
    authorizedProxyParents.delete(exec.token)
    dispatchContent.delete(exec.token)
    if (!result.isError && isRecord(result.value) && typeof result.value.resume === 'string') {
      pendingCumulative.delete(result.value.resume)
    }
    const agent = exec.agent
    if (agent === undefined || result.isError) return
    const state = ensureState(agent)
    if (exec.name === config.toolName) {
      if (config.mode === 'stable-proxy') {
        for (const name of discoveredFromSearchValue(result.value) ?? []) state.discovered.add(name)
        if (statusFromSearchValue(result.value)) state.catalogListed = true
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
    dropAgentResults(String(agent.id))
    states.delete(agent)
    liveStates.delete(state)
  })

  ctx.effect(() => () => {
    for (const state of liveStates) disposeRestriction(state)
    liveStates.clear()
    authorizedProxyParents.clear()
    pendingCumulative.clear()
    dispatchContent.clear()
    dropAllResults()
  }, 'progressive-tools.agent-state')
}
