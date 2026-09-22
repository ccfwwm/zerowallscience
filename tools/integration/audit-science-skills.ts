/** Read-only registry/schema audit. pnpm exec tsx tools/integration/audit-science-skills.ts */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { researchToolConfig } from './research-tool-config.mjs'
import { rWorkflows } from '../../plugins/mcp/src/shared/r-workflows.js'
import * as Research from '../../plugins/research/src/host/index.js'

const root = resolve(import.meta.dirname, '../..')
const output = resolve(root, process.argv.find(v => v.startsWith('--output='))?.slice(9) ?? '.build/science-skills-audit')
const bundled = resolve(root, 'resources/skills')
await mkdir(output, { recursive: true })
const require = createRequire(join(root, 'plugins/research/package.json'))
const load = (id: string) => import(pathToFileURL(require.resolve(id)).href)
const [{ Context }, { default: Skills }, Filesystem, { default: SystemPrompt }, Tools] = await Promise.all([
  load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-skill'), load('@deepseek-ai/dsh-skill-filesystem'), load('@deepseek-ai/dsh-system-prompt'), load('@deepseek-ai/dsh-tools'),
])
const ctx = new Context()
const oldDb = process.env.ZEROWALL_RESEARCH_DB
process.env.ZEROWALL_RESEARCH_DB = join(output, 'schema-inspection.sqlite')
const exists = async (path: string) => access(path).then(() => true, () => false)
const sha = (value: string) => createHash('sha256').update(value).digest('hex')
const portable = (path: string) => relative(root, path).replaceAll('\\', '/')
async function files(path: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (['.git', '__pycache__', 'node_modules'].includes(entry.name) || entry.isSymbolicLink()) continue
    const full = join(path, entry.name)
    if (entry.isDirectory()) out.push(...await files(full)); else if (entry.isFile()) out.push(full)
  }
  return out
}
const wildcard = (pattern: string, value: string) => new RegExp(`^${pattern.split('*').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(value)
try {
  await ctx.plugin(Skills)
  await ctx.plugin(Filesystem, { providerName: 'zerowall-audit-bundled', includeDefaultRoots: false, bundledSkillDir: bundled, watch: false })
  const custom = process.argv.find(v => v.startsWith('--user-skills='))?.slice(14)
  if (custom) await ctx.plugin(Filesystem, { providerName: 'zerowall-audit-user', includeDefaultRoots: false, customSkillDirs: [resolve(custom)], watch: false })
  await ctx.plugin(SystemPrompt); await ctx.plugin(Tools.default); await ctx.plugin(Research)
  const registered = await ctx.skills.list()
  const hostSchemas = ctx.tools.schemas()
  const remoteSchemas = rWorkflows.modules.flatMap(module => module.operations.map(operation => ({ name: `mcp__rmcp__${operation.public_tool}`, operation: operation.id, inputSchema: operation.input_schema })))
  const evidenceRecords: any[] = []
  for (const [path, skills, scope] of [
    ['../raiagentai/output/nhanes-v7-reference/nhanes-public-reference.json', ['zerowall-nhanes'], 'Public-cycle numerical reference; not a full Skill execution.'],
    ['../raiagentai/output/bulk-v7-reference-20260922.log', ['zerowall-omicverse-bulk'], 'Synthetic remote bulk runner reference; not biological validation.'],
    ['../raiagentai/output/pseudobulk-v7-reference-20260922.log', ['zerowall-omicverse-singlecell'], 'Synthetic donor aggregation and DE reference; not biological validation.'],
  ] as const) if (await exists(resolve(root, path))) {
    const bytes = await readFile(resolve(root, path))
    evidenceRecords.push({ path, skills, scope, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, status: 'existing-record-not-rerun' })
  }
  // Existing dependency audit scans executable imports and declared installations.
  execFileSync(process.env.ZEROWALL_AUDIT_PYTHON ?? 'python', [join(root, 'tools/release/audit-skill-dependencies.py'), '--skills-root', bundled, '--output', join(output, 'dependency-candidates.json')], { cwd: root, windowsHide: true, stdio: 'pipe' })
  const dependencies = JSON.parse(await readFile(join(output, 'dependency-candidates.json'), 'utf8'))
  const rows: any[] = []
  for (const summary of registered) {
    const skill = await ctx.skills.get(summary.name)
    if (!skill) { rows.push({ name: summary.name, classification: '需适配', issues: ['Registry could not load its listed entry.'] }); continue }
    const base = skill.resourceBase?.kind === 'directory' ? skill.resourceBase.path : dirname(skill.path)
    const listed = await files(base)
    const issues: string[] = [], missingResources: any[] = [], unresolvedReferences: any[] = []
    for (const file of listed.filter(path => path.endsWith('.md'))) {
      const source = await readFile(file, 'utf8')
      const targets = [...source.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)].map(match => match[1]!)
      // Inline local resource references matter even when they are not Markdown links.
      for (const match of source.matchAll(/`((?:\.{1,2}\/)?(?:references|scripts|assets|agents|shared)\/[^`\n]+\.(?:md|py|json|yaml|yml|sh|ps1|ts|mjs|js))`/g)) targets.push(match[1]!)
      for (const target of new Set(targets)) {
        const cleaned = target.replace(/^<|>$/g, '').split('#')[0]!
        if (!cleaned || /^(https?:|mailto:|data:|app:|#)/.test(cleaned)) continue
        if (/[{}<>*]|\s["']|^\/|^[A-Za-z]:/.test(cleaned)) { unresolvedReferences.push({ source: portable(file), target, reason: 'dynamic-or-external-path' }); continue }
        let decoded: string
        try { decoded = decodeURIComponent(cleaned) } catch { unresolvedReferences.push({ source: portable(file), target, reason: 'invalid-encoding' }); continue }
        if (!await exists(resolve(dirname(file), decoded))) missingResources.push({ source: portable(file), target })
      }
    }
    const bindings = researchToolConfig.skillBindings.filter((binding: any) => binding.skill === skill.name).flatMap((binding: any) => binding.groups)
    const groups = bindings.map((id: string) => researchToolConfig.groups.find((group: any) => group.id === id))
    if (groups.some((group: any) => !group)) issues.push('Skill binding names an unknown tool group.')
    const patterns = groups.filter(Boolean).flatMap((group: any) => group.include ?? [])
    const host = hostSchemas.filter((schema: any) => patterns.some((pattern: string) => wildcard(pattern, schema.name)))
    const remote = remoteSchemas.filter(schema => patterns.some((pattern: string) => wildcard(pattern, schema.name)))
    const examples: any[] = []
    for (const match of skill.content.matchAll(/```json\s*\n([\s\S]*?)\n```/g)) {
      let value: any
      try { value = JSON.parse(match[1]!) } catch { examples.push({ status: 'example-not-json', note: 'May be a template; review manually.' }); continue }
      const explicit = typeof value.name === 'string' && typeof value.arguments === 'object' ? hostSchemas.find((schema: any) => schema.name === value.name) : undefined
      const candidates = explicit ? [explicit] : host.filter((schema: any) => schema.parameters?.properties?.action?.enum?.includes(value.action))
      if (candidates.length === 1) {
        const errors = Tools.validateJsonSchemaValue(candidates[0].parameters, explicit ? value.arguments : value)
        examples.push({ tool: candidates[0].name, status: errors.length ? 'schema-mismatch' : 'schema-valid', errors })
      } else {
        const envelope = explicit ? value.arguments : value
        const operation = remoteSchemas.find(schema => schema.operation === (envelope.operation ?? envelope.action))
        if (operation && envelope.arguments && typeof envelope.arguments === 'object') {
          const errors = Tools.validateJsonSchemaValue(operation.inputSchema, envelope.arguments)
          examples.push({ tool: operation.name, operation: operation.operation, status: errors.length ? 'remote-schema-mismatch' : 'remote-declared-schema-valid', errors, availability: 'not-connected' })
        } else examples.push({ status: 'not-validated', reason: 'No unambiguous actual Host or remote operation schema for this example.' })
      }
    }
    if (examples.some(example => ['schema-mismatch', 'remote-schema-mismatch'].includes(example.status))) issues.push('A tool example fails its registered Host or declared remote JSON schema.')
    if (/search_mcp_tools|meta_search/.test(skill.content)) issues.push('Legacy discovery API mentioned.')
    const dependency = dependencies.skills.find((item: any) => item.name === skill.name)
    const scripts = listed.filter(path => /\.(py|R|sh|ps1|mjs|js|ts)$/.test(path)).map(portable)
    const conditional = Boolean(dependency?.requirements?.length || scripts.length || remote.length || /API[_ -]?KEY|credential|CUDA|GPU|pip install|conda|Rscript/i.test(skill.content))
    const conflicts = /each stage.*confirmation|each stage completion|Default OFF|ARS_CLAIM_AUDIT=1/i.test(skill.content)
    const researchRoute = skill.content.includes('ZeroWall Research route')
    const classification = issues.length || missingResources.length || (conflicts && !researchRoute) ? '需适配' : conditional ? '依赖未验证' : host.length ? '可直接复用' : '仅文档'
    rows.push({ name: skill.name, classification, registry: { source: skill.source, provider: skill.provider, path: portable(skill.path), resourceBase: portable(base), version: skill.metadata?.zerowall?.version ?? skill.metadata?.version ?? null, contentSha256: sha(skill.content) }, issues, missingResources, unresolvedReferences, scripts, dependencyCandidates: dependency?.requirements ?? [], bindingGroups: bindings, hostTools: host.map((schema: any) => ({ name: schema.name, schemaSha256: sha(JSON.stringify(schema.parameters)) })), remoteToolSchemas: [...new Set(remote.map(schema => schema.name))], examples, researchRouting: { conflictingLegacyRulesPresent: conflicts, scopedResearchRoutePresent: researchRoute }, existingEvidenceRefs: evidenceRecords.filter(record => record.skills.includes(skill.name)), execution: { status: 'not-executed-by-this-audit', dependencyAvailability: 'not-probed', scientificCapability: 'not-certified' } })
  }
  const directories = (await readdir(bundled, { withFileTypes: true })).filter(entry => entry.isDirectory())
  const undiscovered = []
  for (const directory of directories) {
    const path = join(bundled, directory.name, 'SKILL.md')
    if (await exists(path) && !rows.some(row => resolve(root, row.registry?.path ?? '') === path)) undiscovered.push({ directory: directory.name, path: portable(path), reason: custom ? 'not-selected-or-parser-rejected; user override may apply' : 'not-discovered-by-real-registry' })
  }
  const totals = Object.fromEntries(['可直接复用', '需适配', '依赖未验证', '仅文档'].map(status => [status, rows.filter(row => row.classification === status).length]))
  const report = { schema: 'zerowall-science-skills-audit/7.0.0-1', generatedAt: new Date().toISOString(), scope: 'Real DSH registry parsing and Host tool schemas; remote schemas are declared catalog only. No scientific executions or dependency installation. Missing references are review candidates and may be generated-output examples, not necessarily runtime dependencies.', roots: { bundled, user: custom ?? null }, totals: { directories: directories.length, registered: rows.length, undiscovered: undiscovered.length, ...totals }, existingEvidenceRecords: evidenceRecords, undiscovered, skills: rows }
  await writeFile(join(output, 'skill-runtime-audit.json'), JSON.stringify(report, null, 2))
  await writeFile(join(output, 'skill-runtime-audit.md'), `# ZeroWall Science 7.0.0 Skills 能力审计\n\n扫描 ${directories.length} 个目录，实际 Registry 可加载 ${rows.length} 项，未被选中/未解析 ${undiscovered.length} 项。\n\n本次没有执行科研任务、安装依赖或验证远程服务。可直接复用表示当前路由/资源/Host schema 检查通过，不能解释为所有科学计算完成。远程工具只有声明 schema，实际连接仍待验收；仅文档可能是有效写作规范，不能视为计算 Runner。\n\n${Object.entries(totals).map(([name, count]) => `- ${name}：${count}`).join('\n')}\n\n| 技能 | 分类 | 资源缺失 | 工具例子 | 来源 |\n|---|---|---|---|---|\n${rows.map(row => `| ${row.name} | ${row.classification} | ${row.missingResources?.length ?? 0} | ${(row.examples ?? []).map((e: any) => e.status).join(', ')} | ${row.registry?.source ?? 'unknown'} |`).join('\n')}\n\n详细依赖导入与安装候选来自现有 audit-skill-dependencies.py，记录在 dependency-candidates.json；没有将候选依赖写成已安装或已验证。\n`)
  console.log(JSON.stringify({ output, ...report.totals }))
} finally {
  await ctx.fiber.dispose()
  if (oldDb === undefined) delete process.env.ZEROWALL_RESEARCH_DB; else process.env.ZEROWALL_RESEARCH_DB = oldDb
}
