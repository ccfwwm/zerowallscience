import type { DeferredToolMatch, ToolCatalog } from './types.js'

export const SEARCH_PROTOCOL_V3 = 'dsh-progressive-tools/v3' as const
export const DISPATCH_PROTOCOL_V2 = 'dsh-progressive-tools/dispatch-v2' as const
export const DISPATCH_PROTOCOL_V1 = 'dsh-progressive-tools/dispatch-v1' as const

export interface FamilyMemberView {
  readonly name: string
  readonly contract: 'schema' | 'name-only' | 'skill'
}

export interface FamilyView {
  readonly id: string
  readonly tools: readonly FamilyMemberView[]
}

export interface SearchMatchView {
  readonly name: string
  readonly group: string
  readonly definition: string
  readonly loaded: 'full' | 'repeat'
  readonly description?: string
  readonly parameters?: Readonly<Record<string, unknown>>
  readonly guidance?: string
}

export interface SearchBudgetView {
  readonly exceeded: boolean
  readonly omitted: number
  readonly singleDefinitionExceedsBudget: boolean
}

export interface SearchResultV3 {
  readonly protocol: typeof SEARCH_PROTOCOL_V3
  readonly mode: 'stable-proxy'
  readonly action: 'search' | 'status'
  readonly query: string
  readonly matches: readonly SearchMatchView[]
  readonly families: readonly FamilyView[]
  readonly groups?: readonly { id: string; description: string; tools: readonly string[] }[]
  readonly instruction: string
  readonly budget?: SearchBudgetView
}

export function definitionFingerprint(
  name: string,
  description: string,
  parameters: unknown,
  guidance: string,
): string {
  const payload = JSON.stringify({ name, description, parameters, guidance })
  let hash = 5381
  for (let index = 0; index < payload.length; index += 1) {
    hash = Math.imul(hash, 33) ^ payload.charCodeAt(index)
  }
  return (hash >>> 0).toString(16)
}

export function fullDefinitionId(name: string, fingerprint: string): string {
  return `full:${name}@${fingerprint}`
}

export function definitionStillVisible(historyText: string, name: string, fingerprint: string): boolean {
  return historyText.includes(fullDefinitionId(name, fingerprint))
}

function matchCharacters(match: SearchMatchView, family: FamilyView | undefined): number {
  return JSON.stringify({ match, family }).length
}

export function projectSearch(input: {
  readonly query: string
  readonly ranked: readonly DeferredToolMatch[]
  readonly guidance: ReadonlyMap<string, string>
  readonly historyText: string
  readonly reload: boolean
  readonly repeatDefinitions: 'compact' | 'full'
  readonly maxResultCharacters: number
  readonly familyDiscovery: 'family' | 'matched'
  readonly skillGranted: ReadonlySet<string>
  readonly dispatchToolName: string
  readonly searchToolName: string
}): { result: SearchResultV3; discoveredNames: readonly string[] } {
  const selected: DeferredToolMatch[] = []
  let omitted = 0
  let singleDefinitionExceedsBudget = false
  let used = 2
  const seenGroups = new Set<string>()
  for (const [index, match] of input.ranked.entries()) {
    const guidance = input.guidance.get(match.name) ?? ''
    const fingerprint = definitionFingerprint(match.name, match.description, match.parameters, guidance)
    const visible = input.repeatDefinitions === 'compact'
      && !input.reload
      && definitionStillVisible(input.historyText, match.name, fingerprint)
    const view = visible
      ? { name: match.name, group: match.group, definition: `repeat:${match.name}@${fingerprint}`, loaded: 'repeat' as const }
      : {
          name: match.name,
          group: match.group,
          definition: fullDefinitionId(match.name, fingerprint),
          loaded: 'full' as const,
          description: match.description,
          parameters: match.parameters,
          ...(guidance === '' ? {} : { guidance }),
        }
    const family = familyFor(match, input, seenGroups)
    const size = matchCharacters(view, family)
    const over = used + size > input.maxResultCharacters
    if (index === 0 && over) singleDefinitionExceedsBudget = true
    if (index > 0 && over) {
      omitted += 1
      continue
    }
    used += size
    selected.push(match)
    if (family !== undefined) seenGroups.add(match.group)
  }
  const matches: SearchMatchView[] = selected.map(match => {
    const guidance = input.guidance.get(match.name) ?? ''
    const fingerprint = definitionFingerprint(match.name, match.description, match.parameters, guidance)
    const visible = input.repeatDefinitions === 'compact'
      && !input.reload
      && definitionStillVisible(input.historyText, match.name, fingerprint)
    if (visible) {
      return {
        name: match.name,
        group: match.group,
        definition: `repeat:${match.name}@${fingerprint}`,
        loaded: 'repeat',
      }
    }
    return {
      name: match.name,
      group: match.group,
      definition: fullDefinitionId(match.name, fingerprint),
      loaded: 'full',
      description: match.description,
      parameters: match.parameters,
      ...(guidance === '' ? {} : { guidance }),
    }
  })
  const families = familiesFor(selected, input)
  const discovered = new Set<string>()
  for (const family of families) {
    for (const tool of family.tools) {
      if (input.familyDiscovery === 'matched' && tool.contract !== 'schema') continue
      discovered.add(tool.name)
    }
  }
  for (const match of selected) discovered.add(match.name)
  const budget = omitted > 0 || singleDefinitionExceedsBudget
    ? { exceeded: true, omitted, singleDefinitionExceedsBudget }
    : undefined
  const loadHint = singleDefinitionExceedsBudget
    ? ` This definition exceeds maxResultCharacters and is still returned so the tool remains discoverable. Call ${input.dispatchToolName} with this exact name.`
    : ''
  const omittedHint = omitted > 0
    ? ` ${omitted} further match(es) were omitted for the result budget; search a more specific query to load them.`
    : ''
  return {
    discoveredNames: [...discovered].sort(),
    result: {
      protocol: SEARCH_PROTOCOL_V3,
      mode: 'stable-proxy',
      action: 'search',
      query: input.query,
      matches,
      families,
      instruction: matches.length === 0
        ? `No deferred tool matched ${JSON.stringify(input.query)}. Do not invent a call.`
        : `Call ${input.dispatchToolName} with an exact name from families. schema means parameters are in this result; name-only means the sibling is dispatchable but its parameters are not loaded; skill means a bound Skill supplies the call contract. Search ${input.searchToolName} with reload true to force a full definition.${loadHint}${omittedHint}`,
      ...(budget === undefined ? {} : { budget }),
    },
  }
}

function familyFor(
  match: DeferredToolMatch,
  input: { familyDiscovery: 'family' | 'matched'; skillGranted: ReadonlySet<string> },
  seenGroups: ReadonlySet<string>,
): FamilyView | undefined {
  if (seenGroups.has(match.group)) return undefined
  return {
    id: match.group,
    tools: memberViews(match, input),
  }
}

function memberViews(
  match: DeferredToolMatch,
  input: { familyDiscovery: 'family' | 'matched'; skillGranted: ReadonlySet<string> },
): FamilyMemberView[] {
  const names = input.familyDiscovery === 'matched' ? [match.name] : match.groupTools
  return names.map(name => ({
    name,
    contract: name === match.name
      ? 'schema'
      : input.skillGranted.has(name) ? 'skill' : 'name-only',
  }))
}

function familiesFor(
  selected: readonly DeferredToolMatch[],
  input: { familyDiscovery: 'family' | 'matched'; skillGranted: ReadonlySet<string> },
): FamilyView[] {
  const families: FamilyView[] = []
  const seen = new Set<string>()
  for (const match of selected) {
    if (seen.has(match.group)) {
      const family = families.find(item => item.id === match.group)
      const member = family?.tools.find(tool => tool.name === match.name)
      if (family !== undefined && member !== undefined && member.contract !== 'schema') {
        const tools = family.tools.map(tool => tool.name === match.name ? { ...tool, contract: 'schema' as const } : tool)
        const index = families.findIndex(item => item.id === match.group)
        families[index] = { id: family.id, tools }
      }
      continue
    }
    seen.add(match.group)
    families.push({ id: match.group, tools: memberViews(match, input) })
  }
  return families
}

export function capabilitySummary(catalog: ToolCatalog, maxCharacters: number): string {
  const lines = [...catalog.groups.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(group => `${group.id}: ${group.description}`)
  const text = lines.length === 0
    ? 'Deferred capability classes: none registered.'
    : `Deferred capability classes (members are not listed; search to load a definition):\n${lines.join('\n')}`
  if (text.length <= maxCharacters) return text
  return `${text.slice(0, Math.max(0, maxCharacters - 1))}…`
}

export function historyText(messages: readonly { content?: unknown }[]): string {
  return messages.map(message => {
    try {
      return JSON.stringify(message.content)
    } catch {
      return ''
    }
  }).join('\n')
}
