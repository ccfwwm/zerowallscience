// Only generated references are owned by this script. SKILL.md and scenarios are editorial.
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { moduleProvenance, moduleReference } from './module-skill-provenance.mjs'
import { rWorkflows } from '../../plugins/mcp/src/shared/r-workflows.ts'
const root = resolve(import.meta.dirname, '../../resources/extensions/skills')
const check = process.argv.includes('--check')
const selected = process.argv.filter(arg=>arg.startsWith('--skill=')).map(arg=>arg.slice(8))
const provenancePath = resolve(import.meta.dirname, '../../config/integrations/module-skill-provenance.json')
const provenance = JSON.parse(await readFile(provenancePath, 'utf8'))
if (provenance.schema !== 1) throw new Error('Unsupported module Skill provenance schema')
const nextProvenance = { schema: 1, modules: selected.length ? {...provenance.modules} : {} }
for(const skill of selected)if(!rWorkflows.modules.some(module=>module.skill===skill))throw new Error(`Unknown module Skill: ${skill}`)
for (const module of rWorkflows.modules) {
  if(selected.length&&!selected.includes(module.skill))continue
  const directory = resolve(root, module.skill, 'references')
  const snapshot = moduleProvenance(rWorkflows, module, provenance.modules[module.skill], check)
  nextProvenance.modules[module.skill] = snapshot
  const json = moduleReference(module, snapshot)
  const text = '# 生成操作目录\n\n此文件来自实际服务端注册。离线注册不等于运行时可用；精确执行前使用 describe。\n\n' + module.operations.map(op => `## ${op.id}\n\n${op.summary}\n\n- 工具族：${op.public_tool}；副作用：${op.effects}；query：${op.query_allowed}；执行：${op.execution}。\n- 确认字段：${op.confirmation_fields.join(', ') || '无'}。\n- 输出：${op.output}\n\n` + '```json\n' + JSON.stringify({ input_schema: op.input_schema, lifecycle: op.lifecycle }, null, 2) + '\n```\n').join('\n')
  for (const [name, content] of [['operations.json', json], ['operations.md', text]]) {
    const path = resolve(directory, name)
    if (check) { if (await readFile(path, 'utf8') !== content) throw new Error(`Generated reference drift: ${path}`) }
    else { await mkdir(directory, { recursive: true }); await writeFile(path, content) }
  }
  const skill = await readFile(resolve(root, module.skill, 'SKILL.md'), 'utf8')
  if (!skill.includes('references/operations.md')) throw new Error(`Missing operation reference: ${module.skill}`)
}
const provenanceText = JSON.stringify(nextProvenance, null, 2) + '\n'
if (check) { if (await readFile(provenancePath, 'utf8') !== provenanceText) throw new Error('Generated module Skill provenance drift') }
else await writeFile(provenancePath, provenanceText)
const liveSkills = new Set(rWorkflows.modules.map(module => module.skill))
for (const entry of await readdir(root, { withFileTypes: true })) {
  if(selected.length)break
  if (!entry.isDirectory() || liveSkills.has(entry.name)) continue
  const directory = resolve(root, entry.name, 'references')
  const jsonPath = resolve(directory, 'operations.json')
  const generated = await readFile(jsonPath, 'utf8').then(JSON.parse, () => undefined)
  if (generated?.protocol_version !== rWorkflows.protocol_version || typeof generated.content_sha256 !== 'string' || typeof generated.skill !== 'string') continue
  if (check) throw new Error(`Stale generated reference: ${jsonPath}`)
  await rm(jsonPath, { force: true })
  await rm(resolve(directory, 'operations.md'), { force: true })
}
console.log(check ? 'Generated references match; editorial skills untouched' : 'Updated generated operation references only')
