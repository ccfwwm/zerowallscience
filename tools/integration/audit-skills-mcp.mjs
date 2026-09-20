import { createHash } from 'node:crypto'
import { readFile, readdir, mkdir, writeFile, access } from 'node:fs/promises'
import { resolve, relative, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
const root = resolve(import.meta.dirname, '../..'); const directory = resolve(root, 'resources/skills')
const rows = []; const names = new Map(); const hashes = new Map()
const changed = new Set(execFileSync('git', ['diff', '--name-only', '--', 'resources/skills'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/u))
async function exists(path) { return access(path).then(() => true, () => false) }
async function files(path) { const result = []; for (const entry of await readdir(path, { withFileTypes: true })) { if (['vendor', '.git', '__pycache__', 'node_modules'].includes(entry.name)) continue; const child = resolve(path, entry.name); if (entry.isDirectory()) result.push(...await files(child)); else result.push(child) } return result }
for (const entry of await readdir(directory, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const path = resolve(directory, entry.name, 'SKILL.md'); if (!await exists(path)) continue
  const content = await readFile(path, 'utf8'); const name = /^name:\s*(.+)$/mu.exec(content)?.[1]?.trim().replace(/^['"]|['"]$/gu, '')
  const hash = createHash('sha256').update(content.replaceAll('\r\n', '\n')).digest('hex')
  const issues = []
  if (!name || !/^description:/mu.test(content)) issues.push('missing frontmatter')
  if (names.has(name)) issues.push(`duplicate name: ${names.get(name)}`)
  if (hashes.has(hash)) issues.push(`identical document: ${hashes.get(hash)}`)
  if (/search_mcp_tools|meta_search/u.test(content)) issues.push('obsolete discovery tool')
  names.set(name, entry.name); hashes.set(hash, entry.name)
  const skillFiles = await files(dirname(path)); const broken = []; const reviewedExamples = []
  for (const file of skillFiles.filter(file => file.endsWith('.md'))) {
    const text = (await readFile(file, 'utf8')).replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gmu, '').replace(/`[^`\n]*`/gu, '')
    for (const match of text.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/gu)) {
      const target = match[1].replace(/^<|>$/gu, '').split('#')[0]
      if ((entry.name === 'datamol' && target === '=[O:4]') || (entry.name === 'timesfm-forecasting' && target === 'forecast_visualization.png')) { reviewedExamples.push(`${relative(dirname(path), file)} -> ${target}`); continue }
      if (!target || /^(?:https?:|mailto:|data:|app:|#|\/)|[{}<>]|\s["']/u.test(target) || /^(?:url\d*|path|source_url|\.\.\.args)$/u.test(target)) continue
      if (!await exists(resolve(dirname(file), decodeURIComponent(target)))) broken.push(`${relative(dirname(path), file)} -> ${target}`)
    }
  }
  const scripts = skillFiles.filter(file => /\.(py|mjs|js|sh|ps1)$/u.test(file)).map(file => relative(root, file).replaceAll('\\', '/'))
  const runtimes = [...new Set((content.match(/\b(?:python|Rscript|R|CUDA|GPU|docker|uv|conda|node)\b/gu) ?? []))]
  const conditional = /API[_ -]?KEY|credential|token|GPU|CUDA|license|requires.*(?:install|account|server)/iu.test(content)
  rows.push({ name: name ?? entry.name, action: entry.name === 'zerowall-bio' ? '合并入口' : changed.has(`resources/skills/${entry.name}/SKILL.md`) ? '修复' : conditional ? '条件可用' : '保留', reason: entry.name === 'zerowall-bio' ? '统一 Bio Tools / BioGenie / Biomni 后端导航' : changed.has(`resources/skills/${entry.name}/SKILL.md`) ? '统一发现/调用与托管环境契约' : conditional ? '运行取决于凭据、后端、模型或可选运行时；不自动安装' : '未发现重复注册或过期发现入口', allowedTools: /^allowed-tools:\s*(.*)$/mu.exec(content)?.[1] ?? '', scripts, runtimes, brokenLinks: broken, reviewedExamples, issues })
}
const out = resolve(root, 'docs/integration/skills-mcp'); await mkdir(out, { recursive: true })
const summary = { total: rows.length, issues: rows.filter(r => r.issues.length).length, brokenLinks: rows.reduce((sum,r) => sum+r.brokenLinks.length,0), scripts: rows.reduce((sum,r) => sum+r.scripts.length,0) }
await writeFile(resolve(out, 'skill-audit.json'), JSON.stringify({ generatedAt: new Date().toISOString(), summary, skills: rows }, null, 2))
await writeFile(resolve(out, 'skill-audit.md'), `# Skills 逐项审计\n\n共 ${rows.length} 项。注册/全文重复/过期发现入口异常 ${summary.issues} 项，待核对链接 ${summary.brokenLinks} 项。此表是静态检查，不代表所有外部服务和模型已运行验收。详细脚本、环境、链接和工具声明见 skill-audit.json。\n\n| Skill | 处理 | 原因 | 链接异常 |\n|---|---|---|---|\n` + rows.map(row => `| ${row.name} | ${row.action} | ${row.reason} | ${row.brokenLinks.length} |`).join('\n') + '\n')
console.log(JSON.stringify(summary))
if (summary.issues) process.exitCode = 1
