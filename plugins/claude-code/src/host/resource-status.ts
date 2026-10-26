import type { ToolSchema } from '@deepseek-ai/dsh-llm'
import type { ClaudeResourceStatus } from '../shared/types.js'
import type { McpServerProjectionInput, SkillProjectionResult } from './projection.js'

/** Availability is derived from the current Host view, never from launchability or a name denylist. */
export function resourceStatus(skills: SkillProjectionResult, servers: readonly McpServerProjectionInput[], tools: readonly ToolSchema[],
  runtime: readonly { serverName: string; runtimeState: string }[] = [], disabledSkills: readonly string[] = []): ClaudeResourceStatus[] {
  const rows: ClaudeResourceStatus[] = skills.skills.map(skill => ({ kind: 'skill', name: skill.name,
    state: skill.invocation.modelInvocable ? 'synced' : 'manual' }))
  rows.push(...skills.skipped.map(skill => ({ kind: 'skill' as const, name: skill.name,
    state: skill.reason === 'unavailable' ? 'unavailable' as const : skill.reason === 'not-model-invocable' ? 'disabled' as const : 'failed' as const,
    detail: skill.reason })))
  for (const name of disabledSkills) if (!rows.some(row => row.name === name)) rows.push({ kind: 'skill', name, state: 'disabled' })
  for (const server of servers) {
    const status = runtime.find(row => row.serverName === server.serverName)?.runtimeState
    const available = tools.some(tool => tool.name.startsWith(`mcp__${server.serverName}__`))
    rows.push({ kind: 'mcp', name: server.serverName, state: !server.enabled ? 'disabled' : available ? 'synced'
      : status === 'error' ? 'failed' : 'unavailable', detail: available ? '通过现有 Host 连接桥接' : status ?? '当前会话没有可用工具' })
  }
  return rows
}
