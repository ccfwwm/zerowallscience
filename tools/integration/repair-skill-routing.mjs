import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const root = resolve(import.meta.dirname, '../../resources/skills')
let changed = 0
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory() && !['vendor', '__pycache__', '.git'].includes(entry.name)) await visit(path)
    else if (entry.name.endsWith('.md')) {
      const before = await readFile(path, 'utf8')
      let after = before.replaceAll('search_mcp_tools', 'tool_search')
      if (entry.name === 'SKILL.md' && after.includes('## ZeroWall execution contract')) {
        after = after.replace(/- Use ZeroWall tools by their actual names:.*\r?\n/u,
          '- Discover tools with `tool_search`; execute the exact returned name through `tool_dispatch` with its `arguments` object. Loading a Skill supplies instructions, not execution. Use `python` for the managed local interpreter, and discover `pwsh` on Windows or `bash` on Unix when shell work is needed.\n')
        after = after.replace(/- Do not install runtimes or dependencies automatically\..*\r?\n/u,
          '- Use `zerowall-python-packages` for managed Python dependency changes: inspect, preview, obtain confirmation, apply, and verify. Do not run pip/uv/conda against the managed snapshot. Report missing external runtimes separately.\n')
        after = after.replace(/^(allowed-tools:.*)$/mu, line => [...new Set(line.replace(/\bsearch\b/gu, 'tool_search').replace(/\bshell\b/gu, 'pwsh bash').split(/\s+/u)), 'tool_dispatch'].filter((v,i,a)=>a.indexOf(v)===i).join(' '))
      }
      if (after !== before) { await writeFile(path, after); changed++ }
    }
  }
}
await visit(root)
console.log(`Updated routing in ${changed} Skill documents.`)
