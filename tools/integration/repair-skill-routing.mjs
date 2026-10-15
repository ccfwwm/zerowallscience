import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const root = resolve(import.meta.dirname, '../../resources/extensions/skills')

function unwrapNativeToolCall(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  if (typeof value.name === 'string' && value.arguments !== undefined && Object.keys(value).every(key => key === 'name' || key === 'arguments')) return value.arguments
  return value
}

function migrateJsonFences(text) {
  return text.replace(/```json\r?\n([\s\S]*?)\r?\n```/gu, (whole, body) => {
    try {
      const unwrapped = unwrapNativeToolCall(JSON.parse(body))
      return `\`\`\`json\n${JSON.stringify(unwrapped, null, 2)}\n\`\`\``
    } catch { return whole }
  })
}

export function migrateRouting(text) {
  let after = migrateJsonFences(text)
  after = after.replaceAll('search_mcp_tools', 'the native tool registry')
  after = after.replace(/Discover tools with `tool_search`; execute the exact returned name through `tool_dispatch` with its `arguments` object\./gu,
    'Call the exact native tool name with its argument object; use the host tool list to confirm the current schema.')
  after = after.replace(/先用 `tool_search` 搜索并发现精确工具，再由 `tool_dispatch` 调用。/gu,
    '直接调用 Host 暴露的精确工具名，并以当前 schema 为准。')
  after = after.replace(/先 `tool_search` 搜索 `research_workflow`，使用返回的真实工具名和 schema。下列 JSON 是交给 `tool_dispatch` 的完整包装；/gu,
    '直接调用 `research_workflow`，并以当前 schema 为准。下列 JSON 是该工具的参数；')
  after = after.replace(/先 `tool_search` 搜索 `research_workflow`，使用返回的真实工具名和 schema。/gu,
    '直接调用 `research_workflow`，并以当前 schema 为准。')
  after = after.replace(/Discover `python_environment` with `tool_search`, then use `tool_dispatch` with the exact returned name and argument schema\./gu,
    'Call `python_environment` directly with its current argument schema.')
  after = after.replace(/用 tool_search 发现工具，用 tool_dispatch 执行：/gu,
    '直接调用下列 Host 工具，并以当前 schema 为准：')
  after = after.replace(/discover optional MCP capabilities with `tool_search`/gu,
    'use the exact optional MCP tool name exposed by the Host')
  after = after.replace(/`tool_search` skill/gu, 'Host tool registry')
  after = after.replace(/`tool_search`/gu, 'Host tool registry')
  after = after.replace(/`tool_dispatch`/gu, 'the native tool')
  after = after.replace(/tool_dispatch\.name/gu, 'research_workflow')
  after = after.replace(/\btool_search\b/gu, 'the native tool registry')
  after = after.replace(/\btool_dispatch\b/gu, 'the native tool')
  after = after.replace(/\btool_result_read\b/gu, 'the native result reader')
  after = after.replace(/^(allowed-tools:.*)$/gmu, line => line
    .replace(/\btool_search\b|\btool_dispatch\b|\btool_result_read\b/gu, '')
    .replace(/\bthe native (?:tool registry|tool|result reader)\b/gu, '')
    .replace(/\s{2,}/gu, ' ').replace(/:\s+/u, ': ').trim())
  return after
}

let changed = 0
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory() && !['vendor', '__pycache__', '.git'].includes(entry.name)) await visit(path)
    else if (entry.name.endsWith('.md')) {
      const before = await readFile(path, 'utf8')
      let after = migrateRouting(before)
      if (entry.name === 'SKILL.md' && after.includes('## ZeroWall execution contract')) {
        after = after.replace(/- Use ZeroWall tools by their actual names:.*\r?\n/u,
          '- Call the exact native tool name with its argument object; use the host tool list to confirm the current schema. Loading a Skill supplies instructions, not execution. Use `python` for the managed local interpreter, and use `pwsh` on Windows or `bash` on Unix when shell work is needed.\n')
        after = after.replace(/- Do not install runtimes or dependencies automatically\..*\r?\n/u,
          '- Use `zerowall-python-packages` for managed Python dependency changes: inspect, preview, obtain confirmation, apply, and verify. Do not run pip/uv/conda against the managed snapshot. Report missing external runtimes separately.\n')
        after = after.replace(/^(allowed-tools:.*)$/mu, line => [...new Set(line.replace(/\bsearch\b/gu, 'grep').replace(/\bshell\b/gu, 'pwsh bash').split(/\s+/u).filter(Boolean))].join(' '))
      }
      if (after !== before) { await writeFile(path, after); changed++ }
    }
  }
}
await visit(root)
console.log(`Updated routing in ${changed} Skill documents.`)
