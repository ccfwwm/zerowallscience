import type {
  CatalogTool,
  DeferredToolMatch,
  SearchMatch,
  ToolCatalog,
  ToolGroup,
  ToolGroupConfig,
  ToolSchemaView,
} from './types.js'

const WORD_PATTERN = /[\p{L}\p{N}]+/gu

function normalize(value: string): string {
  return value
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .toLocaleLowerCase('en-US')
    .match(WORD_PATTERN)
    ?.join(' ') ?? ''
}

const CJK_RUN_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu

/**
 * CJK text has no space-delimited word boundaries, so whole-phrase tokens
 * would never overlap between queries and definitions. Character bigrams give
 * both sides comparable terms without a segmentation dictionary.
 */
function tokens(value: string): string[] {
  const normalized = normalize(value)
  if (normalized === '') return []
  const result: string[] = []
  for (const token of normalized.split(' ')) {
    result.push(token)
    for (const run of token.match(CJK_RUN_PATTERN) ?? []) {
      for (let index = 0; index + 1 < run.length; index += 1) {
        const bigram = run.slice(index, index + 2)
        if (bigram !== token) result.push(bigram)
      }
    }
  }
  return result
}

function wildcard(pattern: string): RegExp {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, String.raw`\$&`)
  return new RegExp(`^${escaped.replaceAll('*', '.*')}$`, 'i')
}

export function matchesToolName(name: string, patterns: readonly string[]): boolean {
  return patterns.some(pattern => wildcard(pattern).test(name))
}

function parameterKeys(value: unknown): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return []
  const record = value as Record<string, unknown>
  const own = Object.keys(record)
  return [...own, ...Object.values(record).flatMap(parameterKeys)]
}

function schemaSearchText(value: unknown): string {
  if (value === null || typeof value !== 'object') return typeof value === 'string' ? value : ''
  if (Array.isArray(value)) return value.map(schemaSearchText).join(' ')
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => [key, schemaSearchText(child)])
    .join(' ')
}

export function estimateSchemaTokens(schema: ToolSchemaView, charactersPerToken: number): number {
  return Math.max(1, Math.ceil(JSON.stringify(schema).length / charactersPerToken))
}

function createCatalogTool(schema: ToolSchemaView, charactersPerToken: number): CatalogTool {
  return {
    ...schema,
    estimatedTokens: estimateSchemaTokens(schema, charactersPerToken),
    searchText: normalize(`${schema.name} ${schema.description} ${parameterKeys(schema.parameters).join(' ')} ${schemaSearchText(schema.parameters)}`),
  }
}

function createGroup(
  id: string,
  description: string,
  aliases: readonly string[],
  tools: readonly CatalogTool[],
): ToolGroup {
  return {
    id,
    description,
    aliases,
    tools,
    estimatedTokens: tools.reduce((total, tool) => total + tool.estimatedTokens, 0),
    searchText: normalize(`${id} ${description} ${aliases.join(' ')} ${tools.map(tool => tool.searchText).join(' ')}`),
  }
}

/**
 * Prefixes shared by unrelated tools across plugins. Merging on them would
 * bundle strangers (get_goal with get_image_generation_task), so these tools
 * stay single-tool groups instead.
 */
const GENERIC_AUTO_PREFIXES: ReadonlySet<string> = new Set([
  'get', 'set', 'list', 'create', 'delete', 'update', 'add', 'remove',
  'cancel', 'run', 'start', 'stop', 'send', 'read', 'write', 'new', 'check',
])

function automaticGroupId(name: string, prefixCounts: ReadonlyMap<string, number>): string {
  const prefix = name.includes('_') ? name.slice(0, name.indexOf('_')) : name
  if (GENERIC_AUTO_PREFIXES.has(prefix)) return name
  return (prefixCounts.get(prefix) ?? 0) >= 2 ? prefix : name
}

export function buildCatalog(
  schemas: readonly ToolSchemaView[],
  configuredGroups: readonly ToolGroupConfig[],
  charactersPerToken: number,
  excludedNames: ReadonlySet<string> = new Set(),
): ToolCatalog {
  const tools = new Map<string, CatalogTool>()
  for (const schema of schemas) {
    if (!excludedNames.has(schema.name)) tools.set(schema.name, createCatalogTool(schema, charactersPerToken))
  }

  const assigned = new Set<string>()
  const groups = new Map<string, ToolGroup>()
  for (const config of configuredGroups) {
    const members = [...tools.values()].filter(tool =>
      !assigned.has(tool.name)
      && matchesToolName(tool.name, config.include)
      && !matchesToolName(tool.name, config.exclude ?? []),
    )
    if (members.length === 0) continue
    for (const tool of members) assigned.add(tool.name)
    groups.set(config.id, createGroup(
      config.id,
      config.description ?? `${config.id} tools`,
      config.aliases ?? [],
      members,
    ))
  }

  const unassigned = [...tools.values()].filter(tool => !assigned.has(tool.name))
  const prefixCounts = new Map<string, number>()
  for (const tool of unassigned) {
    const prefix = tool.name.includes('_') ? tool.name.slice(0, tool.name.indexOf('_')) : tool.name
    prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1)
  }
  const automatic = new Map<string, CatalogTool[]>()
  for (const tool of unassigned) {
    const id = automaticGroupId(tool.name, prefixCounts)
    const bucket = automatic.get(id) ?? []
    bucket.push(tool)
    automatic.set(id, bucket)
  }
  for (const [id, members] of automatic) {
    const safeId = groups.has(id) ? `auto:${id}` : id
    groups.set(safeId, createGroup(safeId, members.length > 1 ? `${id} tool family` : members[0]!.description, [], members))
  }

  const toolToGroup = new Map<string, string>()
  for (const group of groups.values()) {
    for (const tool of group.tools) toolToGroup.set(tool.name, group.id)
  }
  return {
    tools,
    groups,
    toolToGroup,
    totalEstimatedTokens: [...tools.values()].reduce((total, tool) => total + tool.estimatedTokens, 0),
  }
}

function scoreGroup(group: ToolGroup, query: string): number {
  const normalizedQuery = normalize(query)
  if (normalizedQuery === '') return 0
  const queryTokens = tokens(query)
  const labels = [group.id, ...group.aliases, ...group.tools.map(tool => tool.name)]
    .map(normalize)
    .filter(label => label !== '')
  const groupTokens = new Set(tokens(`${group.id} ${group.aliases.join(' ')}`))
  const toolNameTokens = new Set(group.tools.flatMap(tool => tokens(tool.name)))
  const descriptionTokens = new Set(tokens(`${group.description} ${group.tools.map(tool => tool.description).join(' ')}`))
  let score = 0
  if (normalize(group.id) === normalizedQuery) score += 120
  if (group.aliases.some(alias => normalize(alias) === normalizedQuery)) score += 110
  if (group.tools.some(tool => normalize(tool.name) === normalizedQuery)) score += 100
  if (labels.some(label => normalizedQuery.includes(label))) score += 36
  if (group.searchText.includes(normalizedQuery)) score += 24
  for (const token of queryTokens) {
    if (groupTokens.has(token)) score += 20
    if (toolNameTokens.has(token)) score += 12
    if (descriptionTokens.has(token)) score += 4
  }
  return score
}

export function searchCatalog(catalog: ToolCatalog, query: string, limit: number): SearchMatch[] {
  return [...catalog.groups.values()]
    .map(group => ({ group, score: scoreGroup(group, query) }))
    .filter(candidate => candidate.score > 0)
    .sort((left, right) => right.score - left.score
      || left.group.estimatedTokens - right.group.estimatedTokens
      || left.group.id.localeCompare(right.group.id))
    .slice(0, limit)
    .map(({ group, score }) => ({
      group: group.id,
      description: group.description.slice(0, 180),
      score,
      estimatedTokens: group.estimatedTokens,
      tools: group.tools.map(tool => tool.name),
    }))
}

function termFrequency(documentTokens: readonly string[], term: string): number {
  return documentTokens.reduce((count, token) => count + (token === term ? 1 : 0), 0)
}

/**
 * Rank individual tools with exact-name bonuses and a compact BM25-style score.
 * Definitions, parameter descriptions, enums, and nested property names all
 * participate in the searchable document.
 */
export function searchTools(catalog: ToolCatalog, query: string, limit: number): DeferredToolMatch[] {
  const normalizedQuery = normalize(query)
  const queryTokens = [...new Set(tokens(query))]
  if (normalizedQuery === '' || queryTokens.length === 0) return []

  const documents = [...catalog.tools.values()].map(tool => ({
    tool,
    group: catalog.groups.get(catalog.toolToGroup.get(tool.name) ?? ''),
    text: '',
    tokens: [] as string[],
  }))
  for (const document of documents) {
    const groupText = document.group === undefined
      ? ''
      : `${document.group.id} ${document.group.description} ${document.group.aliases.join(' ')}`
    document.text = normalize(`${document.tool.searchText} ${groupText}`)
    document.tokens = tokens(document.text)
  }
  const averageLength = documents.length === 0
    ? 1
    : documents.reduce((total, document) => total + document.tokens.length, 0) / documents.length
  const k1 = 1.2
  const b = 0.75

  return documents
    .map(({ tool, group, text, tokens: documentTokens }) => {
      let score = 0
      const normalizedName = normalize(tool.name)
      if (normalizedName === normalizedQuery) score += 160
      else if (normalizedName.includes(normalizedQuery)) score += 48
      if (text.includes(normalizedQuery)) score += 20
      const labels = [group?.id ?? '', ...group?.aliases ?? []]
        .map(normalize)
        .filter(label => label !== '')
      if (labels.some(label => normalizedQuery.includes(label))) score += 40

      for (const term of queryTokens) {
        const frequency = termFrequency(documentTokens, term)
        if (frequency === 0) continue
        const documentFrequency = documents.reduce(
          (count, document) => count + (document.tokens.includes(term) ? 1 : 0),
          0,
        )
        const inverseFrequency = Math.log(
          1 + (documents.length - documentFrequency + 0.5) / (documentFrequency + 0.5),
        )
        const denominator = frequency + k1 * (1 - b + b * documentTokens.length / averageLength)
        score += inverseFrequency * (frequency * (k1 + 1)) / denominator * 10
        if (tokens(tool.name).includes(term)) score += 18
      }

      return {
        tool,
        score,
        group: catalog.toolToGroup.get(tool.name) ?? tool.name,
      }
    })
    .filter(candidate => candidate.score > 0)
    .sort((left, right) => right.score - left.score
      || left.tool.estimatedTokens - right.tool.estimatedTokens
      || left.tool.name.localeCompare(right.tool.name))
    .slice(0, limit)
    .map(({ tool, score, group }) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      group,
      score: Math.round(score * 100) / 100,
      estimatedTokens: tool.estimatedTokens,
      groupTools: catalog.groups.get(group)?.tools.map(member => member.name) ?? [tool.name],
    }))
}

export function matchingToolNames(catalog: ToolCatalog, patterns: readonly string[]): string[] {
  return [...catalog.tools.keys()].filter(name => matchesToolName(name, patterns))
}
