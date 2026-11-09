import type { SystemPromptUpdate, ToolUpdate } from '@deepseek-ai/dsh-llm'

export interface PiAiSessionUpdates {
  systemPromptUpdate?: SystemPromptUpdate
  toolUpdate?: ToolUpdate
}

export type ManagedWireApi = 'openai-responses' | 'anthropic-messages' | 'openai-completions' | 'google-generative-ai'

export interface ManagedSessionCompatibilityEntry {
  origin: string
  modelId: string
  api: ManagedWireApi
  updates: PiAiSessionUpdates
  probe: {
    systemPromptUpdate?: { passed: boolean; turns: number }
    toolUpdate?: { passed: boolean; turns: number }
  }
}

// No AI Cloud gateway/model pair has a retained multi-turn wire-probe receipt
// yet. Keep claims disabled until a real endpoint passes the corresponding probe.
export const MANAGED_SESSION_COMPATIBILITY: readonly ManagedSessionCompatibilityEntry[] = []

function passed(probe: { passed: boolean; turns: number } | undefined): boolean {
  return probe?.passed === true && Number.isInteger(probe.turns) && probe.turns >= 2
}

export function managedSessionUpdates(
  baseUrl: string,
  modelId: string,
  api: ManagedWireApi,
  directory: readonly ManagedSessionCompatibilityEntry[] = MANAGED_SESSION_COMPATIBILITY,
): PiAiSessionUpdates | undefined {
  let origin: string
  try { origin = new URL(baseUrl).origin } catch { return undefined }
  const entry = directory.find(candidate => candidate.origin === origin && candidate.modelId === modelId && candidate.api === api)
  if (!entry) return undefined
  const updates: PiAiSessionUpdates = {}
  if (entry.updates.systemPromptUpdate === 'in-history' && passed(entry.probe.systemPromptUpdate)) {
    updates.systemPromptUpdate = 'in-history'
  }
  if (entry.updates.toolUpdate !== undefined && passed(entry.probe.toolUpdate)) {
    updates.toolUpdate = entry.updates.toolUpdate
  }
  return Object.keys(updates).length === 0 ? undefined : updates
}
