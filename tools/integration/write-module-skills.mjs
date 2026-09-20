// Only generated references are owned by this script. SKILL.md and scenarios are editorial.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { rWorkflows } from '../../plugins/mcp/src/shared/r-workflows.ts'
const root = resolve(import.meta.dirname, '../../resources/skills')
const check = process.argv.includes('--check')
for (const module of rWorkflows.modules) {
  const directory = resolve(root, module.skill, 'references')
  const json = JSON.stringify({ protocol_version: rWorkflows.protocol_version, catalog_version: rWorkflows.catalog_version, content_sha256: rWorkflows.content_sha256, ...module }, null, 2) + '\n'
  const text = '# 生成操作目录\n\n此文件来自实际服务端注册。离线注册不等于运行时可用；精确执行前使用 describe。\n\n' + module.operations.map(op => `## ${op.id}\n\n${op.summary}\n\n- 工具族：${op.public_tool}；副作用：${op.effects}；query：${op.query_allowed}；执行：${op.execution}。\n- 确认字段：${op.confirmation_fields.join(', ') || '无'}。\n- 输出：${op.output}\n\n` + '```json\n' + JSON.stringify({ input_schema: op.input_schema, lifecycle: op.lifecycle }, null, 2) + '\n```\n').join('\n')
  for (const [name, content] of [['operations.json', json], ['operations.md', text]]) {
    const path = resolve(directory, name)
    if (check) { if (await readFile(path, 'utf8') !== content) throw new Error(`Generated reference drift: ${path}`) }
    else { await mkdir(directory, { recursive: true }); await writeFile(path, content) }
  }
  const skill = await readFile(resolve(root, module.skill, 'SKILL.md'), 'utf8')
  if (!skill.includes('references/operations.md')) throw new Error(`Missing operation reference: ${module.skill}`)
}
console.log(check ? 'Generated references match; editorial skills untouched' : 'Updated generated operation references only')
