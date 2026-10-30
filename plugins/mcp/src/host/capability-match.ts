const SERVER_HINTS: Readonly<Record<string, string>> = {
  huagongshe: 'chemical chemistry chemicals 化工 化学 化学品',
  opcrd: 'drug target targets disease diseases clinical biomedical 药物 靶点 疾病 临床 生物医学',
  rmcp: 'r platform r-platform bioinformatics statistics genomics faers geo nhanes omicverse tooluniverse 生物信息 统计 基因组 药物警戒',
  gpsadb: 'gene expression cancer genomics database 基因 表达 癌症 基因组 数据库',
}

function normalized(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function terms(value: string): string[] {
  const output = new Set<string>()
  for (const part of value.normalize('NFKC').toLocaleLowerCase().match(/[a-z0-9][a-z0-9._-]*|[\u3400-\u9fff]+/gu) ?? []) {
    if (/^[\u3400-\u9fff]+$/u.test(part)) {
      if (part.length <= 4) output.add(part)
      for (let index = 0; index < part.length - 1; index += 1) output.add(part.slice(index, index + 2))
    } else output.add(part)
  }
  return [...output]
}

function scoreText(query: string, text: string): number {
  const queryText = normalized(query)
  const target = normalized(text)
  if (queryText === '' || target === '') return 0
  let score = queryText.length >= 3 && target.includes(queryText) ? 8 : 0
  for (const term of terms(query)) {
    const normalizedTerm = normalized(term)
    if (!normalizedTerm || !target.includes(normalizedTerm)) continue
    score += normalizedTerm.length >= 4 ? 4 : normalizedTerm.length === 3 ? 3 : 2
  }
  return score
}

export interface McpCapabilityTool {
  name: string
  description: string
}

export interface McpCapabilityMatch {
  score: number
  tools: Array<McpCapabilityTool & { score: number }>
}

export function matchMcpCapabilities(query: string, serverName: string, displayName: string, tools: readonly McpCapabilityTool[]): McpCapabilityMatch {
  const hints = SERVER_HINTS[serverName.toLocaleLowerCase()] ?? ''
  const serverScore = scoreText(query, `${serverName} ${displayName} ${hints}`)
  const prefix = `mcp__${serverName}__`
  const rankedTools = tools.map(tool => ({ ...tool, score: scoreText(query, `${tool.name.startsWith(prefix) ? tool.name.slice(prefix.length) : tool.name} ${tool.description}`) }))
    .filter(tool => tool.score > 0)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
  return { score: Math.max(serverScore, rankedTools[0]?.score ?? 0), tools: rankedTools }
}
