import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { agentEvents, type Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { createScope, type Scope } from '@deepseek-ai/dsh-scope'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import * as ProgressiveTools from '../../../packages/dsh-progressive-tools/src/index.ts'
import { researchToolConfig } from '../../../tools/integration/research-tool-config.mjs'

const cases = [
  ['zerowall-rplatform', 'mcp__rmcp__r_execute'], ['zerowall-r-files', 'mcp__rmcp__r_files'],
  ['zerowall-r-packages', 'mcp__rmcp__r_packages'], ['zerowall-geo', 'mcp__rmcp__r_geo_analysis'],
  ['zerowall-nhanes', 'mcp__rmcp__r_nhanes_analysis'], ['zerowall-rbioagent', 'mcp__rmcp__biomni_execute'],
  ['zerowall-rplotfigure', 'mcp__rmcp__r_figureya_run'], ['sc-tenifold-knockout', 'sc_tenifold_knockout_run'],
  ['zerowall-bio', 'bio_local'], ['zerowall-python-packages', 'python_environment'],
  ['zerowall-ketcher', 'mcp__zerowall_managed_ketcher__open_sketcher'],
  ['zerowall-research-orchestrator', 'research_study'], ['method-choice', 'method_check_evaluate'],
  ['zerowall-sequence', 'science_viewer'],
  ['zerowall-fiji', 'science_viewer'], ['zerowall-napari', 'science_viewer'],
  ['zerowall-cells', 'science_viewer'],
]
it.each(cases)('loads %s and dispatches its bound tool %s', async (skill, target) => {
  const ctx = new Context(); await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime)
  const skillText = await readFile(resolve(import.meta.dirname, '../../../resources/skills', skill!, 'SKILL.md'), 'utf8')
  expect(skillText).not.toContain('search_mcp_tools')
  const register = (name: string, execute: () => Promise<string>) => ctx.tools.register(defineTool({ name, description: name, parameters: name === 'skill' ? { name: { type: 'string' } } : {}, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute }))
  register('skill', async () => skillText)
  register(target!, async () => 'artifact:fixture-result.json')
  await ctx.plugin(ProgressiveTools, { ...researchToolConfig, mode: 'stable-proxy', requireDiscovery: true })
  const agent = {} as Agent; let scope!: Scope
  await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, agent) }, { inject: ['tools', 'systemPrompt'] }))
  Object.assign(agent, { id: skill, session: Session.create(SessionId(skill!)), ctx: scope.ctx })
  const signal = new AbortController().signal
  const step = async (n: number) => agentEvents(ctx, agent).waterfall('agent/pre-step', { messages: [], turn: 1, step: n, signal }, async () => ({ kind: 'enter', messages: [] }))
  const call = (name: string, args: object) => ctx.tools.execute({ name, arguments: args, callId: ToolCallId(`${skill}-${name}`), signal, agent })
  await step(1)
  expect((await call('skill', { name: skill })).isError).toBe(false)
  await step(2)
  const result = await call('tool_dispatch', { name: target, arguments: {} })
  expect(result.isError, JSON.stringify(result.content)).toBe(false)
  expect(JSON.stringify(result)).toContain('artifact:fixture-result.json')
})
