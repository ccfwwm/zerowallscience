import { createHash, randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { isSkillName } from '@deepseek-ai/dsh-skill'

const LEGACY = /\b(?:tool_search|tool_dispatch|tool_result_read)\b/u

function unwrapNativeCall(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  if (typeof record.name === 'string' && record.arguments !== undefined && Object.keys(record).every(key => key === 'name' || key === 'arguments')) return record.arguments
  return value
}

/** Convert old Progressive Tools examples into direct native tool arguments. */
export function migrateSkillRoutingText(text: string): string {
  let result = text.replace(/```json\r?\n([\s\S]*?)\r?\n```/gu, (whole, body: string) => {
    try { return `\`\`\`json\n${JSON.stringify(unwrapNativeCall(JSON.parse(body)), null, 2)}\n\`\`\`` } catch { return whole }
  })
  result = result
    .replaceAll('search_mcp_tools', 'the native tool registry')
    .replace(/Discover tools with `tool_search`; execute the exact returned name through `tool_dispatch` with its `arguments` object\./gu, 'Call the exact native tool name with its argument object; use the host tool list to confirm the current schema.')
    .replace(/先用 `tool_search` 搜索并发现精确工具，再由 `tool_dispatch` 调用。/gu, '直接调用 Host 暴露的精确工具名，并以当前 schema 为准。')
    .replace(/先 `tool_search` 搜索 `research_workflow`，使用返回的真实工具名和 schema。/gu, '直接调用 `research_workflow`，并以当前 schema 为准。')
    .replace(/Discover `python_environment` with `tool_search`, then use `tool_dispatch` with the exact returned name and argument schema\./gu, 'Call `python_environment` directly with its current argument schema.')
    .replace(/用 tool_search 发现工具，用 tool_dispatch 执行：/gu, '直接调用下列 Host 工具，并以当前 schema 为准：')
    .replace(/discover optional MCP capabilities with `tool_search`/gu, 'use the exact optional MCP tool name exposed by the Host')
    .replace(/`tool_search` skill/gu, 'Host tool registry')
    .replace(/`tool_search`/gu, 'Host tool registry')
    .replace(/`tool_dispatch`/gu, 'the native tool')
    .replace(/tool_dispatch\.name/gu, 'research_workflow')
    .replace(/\btool_search\b/gu, 'the native tool registry')
    .replace(/\btool_dispatch\b/gu, 'the native tool')
    .replace(/\btool_result_read\b/gu, 'the native result reader')
  result = result.replace(/^(allowed-tools:.*)$/gmu, line => line
    .replace(/\bthe native (?:tool registry|tool|result reader)\b/gu, '')
    .replace(/\s{2,}/gu, ' ').trim())
  return result
}

export interface SkillRoutingMigrationRecord {
  readonly name: string
  readonly state: 'enabled' | 'disabled'
  readonly files: number
  readonly beforeSha256: string
  readonly afterSha256: string
  readonly backupPath: string
}

export interface SkillRoutingMigrationReport {
  readonly schema: 1
  readonly migratedAt: string
  readonly records: readonly SkillRoutingMigrationRecord[]
  readonly failures: readonly { name: string; state: string; error: string }[]
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex') }

function markdownFiles(root: string): string[] {
  const files: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Skill migration refuses symbolic link: ${path}`)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path)
    }
  }
  visit(root)
  return files
}

/** Migrate enabled and disabled user Skills once, with an on-disk rollback copy. */
export function migrateUserSkillRouting(userSkillsDirectory: string): SkillRoutingMigrationReport {
  const base = resolve(userSkillsDirectory)
  const report: { schema: 1; migratedAt: string; records: SkillRoutingMigrationRecord[]; failures: { name: string; state: string; error: string }[] } = {
    schema: 1, migratedAt: new Date().toISOString(), records: [], failures: [],
  }
  for (const state of ['enabled', 'disabled'] as const) {
    const root = state === 'enabled' ? base : join(dirname(base), 'disabled')
    if (!existsSync(root)) continue
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isSkillName(entry.name)) continue
      const skillRoot = join(root, entry.name)
      try {
        const files = markdownFiles(skillRoot)
        const contents = files.map(path => ({ path, before: readFileSync(path, 'utf8') }))
        if (!contents.some(item => LEGACY.test(item.before))) continue
        const backup = join(dirname(base), 'history-routing', `${Date.now()}-${randomUUID()}`, state, entry.name)
        mkdirSync(dirname(backup), { recursive: true })
        cpSync(skillRoot, backup, { recursive: true, errorOnExist: true, force: false })
        const before = contents.map(item => item.before).join('\u0000')
        for (const item of contents) {
          const next = migrateSkillRoutingText(item.before)
          const temporary = `${item.path}.${randomUUID()}.tmp`
          writeFileSync(temporary, next, 'utf8')
          renameSync(temporary, item.path)
        }
        const after = files.map(path => readFileSync(path, 'utf8')).join('\u0000')
        report.records.push({ name: entry.name, state, files: files.length, beforeSha256: sha256(before), afterSha256: sha256(after), backupPath: backup })
      } catch (error) {
        report.failures.push({ name: entry.name, state, error: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  const log = join(dirname(base), 'routing-migration.json')
  mkdirSync(dirname(log), { recursive: true })
  writeFileSync(log, JSON.stringify(report, null, 2) + '\n', 'utf8')
  return report
}
