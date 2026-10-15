import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { createScope, type Scope } from '@deepseek-ai/dsh-scope'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'

const cases = [
  ['zerowall-presentation', 'presentation_visual_status'],
  ['zerowall-presentation', 'generate_image'],
  ['mineru-document-parser', 'extract_uploaded_file'],
  ['zerowall-rplatform', 'mcp__rmcp__r_execute'], ['zerowall-r-files', 'mcp__rmcp__r_files'],
  ['zerowall-r-packages', 'mcp__rmcp__r_packages'], ['zerowall-geo', 'mcp__rmcp__r_geo_analysis'],
  ['zerowall-nhanes', 'mcp__rmcp__r_nhanes_analysis'], ['zerowall-rbioagent', 'mcp__rmcp__biomni_execute'],
  ['zerowall-rplotfigure', 'mcp__rmcp__r_figureya_run'], ['sc-tenifold-knockout', 'sc_tenifold_knockout_run'],
  ['zerowall-bio', 'bio_local'], ['zerowall-python-packages', 'python_environment'],
  ['zerowall-ketcher', 'mcp__zerowall_managed_ketcher__open_sketcher'],
  ['zerowall-research-orchestrator', 'research_study'], ['method-choice', 'method_check_evaluate'],
  ['zerowall-research-evidence', 'research_study'], ['zerowall-claim-audit', 'research_study'],
  ['academic-pipeline', 'research_study'], ['academic-paper', 'research_study'], ['academic-paper-reviewer', 'research_study'], ['deep-research', 'research_study'],
  ['zerowall-sequence', 'science_viewer'],
  ['zerowall-image-intensity', 'science_viewer'], ['zerowall-image-mask', 'science_viewer'],
  ['zerowall-fiji', 'science_viewer'], ['zerowall-napari', 'science_viewer'],
  ['zerowall-cells', 'science_viewer'],
  ['zerowall-mr', 'research_study'], ['zerowall-colocalization', 'research_study'],
]
it.each(cases)('loads %s and calls its bound native tool %s directly', async (skill, target) => {
  const ctx = new Context(); await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime)
  const skillText = await readFile(resolve(import.meta.dirname, '../../../resources/extensions/skills', skill!, 'SKILL.md'), 'utf8')
  expect(skillText).not.toContain('search_mcp_tools')
  const register = (name: string, execute: () => Promise<string>) => ctx.tools.register(defineTool({ name, description: name, parameters: name === 'skill' ? { name: { type: 'string' } } : {}, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute }))
  register('skill', async () => skillText)
  register(target!, async () => 'artifact:fixture-result.json')
  const agent = {} as Agent; let scope!: Scope
  await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, agent) }, { inject: ['tools', 'systemPrompt'] }))
  Object.assign(agent, { id: skill, session: Session.create(SessionId(skill!)), ctx: scope.ctx })
  const signal = new AbortController().signal
  const call = (name: string, args: object) => ctx.tools.execute({ name, arguments: args, callId: ToolCallId(`${skill}-${name}`), signal, agent })
  expect((await call('skill', { name: skill })).isError).toBe(false)
	expect(ctx.tools.schemas().map(schema => schema.name)).toContain(target)
	expect(ctx.tools.schemas().map(schema => schema.name)).not.toEqual(expect.arrayContaining(['tool_dispatch', 'tool_search']))
	const result = await call(target!, {})
  expect(result.isError, JSON.stringify(result.content)).toBe(false)
  expect(JSON.stringify(result)).toContain('artifact:fixture-result.json')
})
