import { readFile, writeFile } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
const root = resolve(import.meta.dirname, '../..')
const audit = JSON.parse(await readFile(resolve(root, 'docs/integration/skills-mcp/skill-audit.json'), 'utf8'))
let count = 0
for (const skill of audit.skills) for (const issue of [...new Set(skill.brokenLinks)]) {
  const [file, target] = issue.split(' -> ')
  const path = resolve(root, 'resources/skills', skill.name, file)
  let text = await readFile(path, 'utf8')
  let replacement
  if (skill.name === 'markdown-mermaid-writing' && ['markdown_style_guide.md', 'mermaid_style_guide.md'].includes(basename(target))) replacement = '../references/' + basename(target)
  if (replacement) text = text.replaceAll(`](${target})`, `](${replacement})`)
  else if (['academic-paper', 'academic-pipeline', 'paper-download'].includes(skill.name)) {
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    text = text.replace(new RegExp(`\\[([^\\]]+)\\]\\(${escaped}\\)`, 'g'), '$1（上游参考文件未随包附带；不要作为本地执行依赖）')
  } else if (skill.name === 'markdown-mermaid-writing') {
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    text = text.replace(new RegExp(`\\[([^\\]]+)\\]\\(${escaped}\\)`, 'g'), '$1（模板示例：生成文档时替换为实际项目路径）')
  }
  if (text !== await readFile(path, 'utf8')) { await writeFile(path, text); count++ }
}
console.log(`Repaired ${count} stale document references; scientific notation and generated example artifacts are left intact.`)
