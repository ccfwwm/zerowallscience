import { createHash, randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, TokenUsage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-skill'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { JsonObject, ResearchStudyRecord } from '@zerowallscience/research-store/types'
import { SCIENCE_SYSTEM_PROMPT_VERSION } from '@zerowallscience/plugin-base'
import { RESEARCH_CONTEXT_VERSION } from './research-context.js'

export const RUNTIME_PROVENANCE_VERSION = '7.0.0-runtime-provenance.1'
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value) ?? 'null').digest('hex')

/** Fingerprint only the policy actually present at the provider-neutral request
 * boundary. Never store prompt bodies, tool arguments, credentials or replies. */
export function runtimePolicyFingerprint(options: GenerateOptions): JsonObject {
  const calls = new Map<string, string | null>()
  for (const message of options.messages) for (const block of message.content) {
    if (block.type !== 'tool-call' || block.name !== 'skill') continue
    let name: string | null = null
    try {
      const value = JSON.parse(block.arguments) as { name?: unknown }
      if (typeof value.name === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value.name)) name = value.name
    } catch { /* An invalid call is not a successfully identified Skill. */ }
    calls.set(String(block.id), name)
  }
  const skills: JsonObject[] = []
  for (const message of options.messages) {
    const source = message.source
    const invocation = source.kind === 'skill-invocation'
    const tool = source.kind === 'tool' && calls.has(String(source.callId))
    if (!invocation && !tool) continue
    // Tool failures are retained as delivered context, never certified as loads.
    skills.push({ name: invocation ? source.name : source.kind === 'tool' ? calls.get(String(source.callId)) ?? null : null,
      origin: invocation ? 'user-invocation' : 'tool-response', renderedSha256: hash(message.content) })
  }
  const dynamic = options.messages.filter(message => message.source.kind === 'plugin'
    && message.source.plugin === '@deepseek-ai/dsh-system-prompt' && message.role !== 'system')
  return {
    version: RUNTIME_PROVENANCE_VERSION, boundary: 'provider-neutral-pre-serialization',
    coreVersion: SCIENCE_SYSTEM_PROMPT_VERSION, contextVersion: RESEARCH_CONTEXT_VERSION,
    systemSha256: hash([options.system ?? null, options.messages.filter(message => message.role === 'system').map(message => message.content)]),
    contextSha256: hash(dynamic.map(message => message.content)), skillsSha256: hash(skills),
    toolSchemaSha256: hash(options.tools ?? []), skillContextCount: skills.length, skills,
    provider: options.provider, model: options.model, reasoningEffort: options.reasoningEffort ?? null,
    purpose: options.purpose ?? 'conversation',
  }
}

/** Counts are separate from credential-like audit fields; missing usage remains
 * null. inputTokens in DSH excludes cache reads/writes, reasoning is within output. */
export function observedModelUsage(usage: TokenUsage | undefined): JsonObject {
  const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
  const input = count(usage?.inputTokens), output = count(usage?.outputTokens)
  const read = count(usage?.cacheReadTokens), write = count(usage?.cacheWriteTokens)
  const total = count(usage?.totalTokens)
  const summed = input !== null && output !== null && read !== null && write !== null ? input + output + read + write : null
  const valid = usage === undefined || (input !== null && output !== null
    && (usage.cacheReadTokens === undefined || read !== null) && (usage.cacheWriteTokens === undefined || write !== null)
    && (usage.totalTokens === undefined || total !== null))
  const consistent = valid && (summed === null || total === null || summed === total)
    && (total === null || input === null || output === null || total >= input + output + (read ?? 0) + (write ?? 0))
  return { unit: 'model-token', uncachedInputUnits: input, outputUnits: output, cacheReadUnits: read, cacheWriteUnits: write,
    reasoningUnits: count(usage?.reasoningTokens), totalUnits: consistent ? total ?? summed : null,
    complete: consistent && (total !== null || summed !== null), countersConsistent: consistent,
    monetaryCost: null }
}

export function installResearchRuntimeProvenance(ctx: Context, store: ResearchStore, resolveStudy: (sessionId: string) => ResearchStudyRecord | undefined): void {
  ctx.on('llm/stream', async function* (options, next) {
    const study = options.sessionId ? resolveStudy(String(options.sessionId)) : undefined
    if (!study) { yield* next(); return }
    const requestId = randomUUID(), started = performance.now()
    const policy = runtimePolicyFingerprint(options)
    const skills = policy.skills as JsonObject[]
    delete policy.skills
    const common: JsonObject = { studyId: study.id, sessionId: String(options.sessionId), requestId, freezeId: study.currentFreezeId ?? null, studyVersion: study.version }
    // One event per Skill avoids the generic audit redactor's bounded array
    // preview. The aggregate hash still covers the complete ordered sequence.
    for (const [index, skill] of skills.entries()) store.recordAuditEvent(study.projectId, 'research-runtime.skill-context', { ...common, index, ...skill })
    store.recordAuditEvent(study.projectId, 'research-runtime.request', { ...common, ...policy })
    let usage: TokenUsage | undefined
    let status = 'interrupted'
    let finished = false
    let finishKind: string | null = null
    try {
      for await (const chunk of next()) {
        if (chunk.type === 'usage') usage = chunk.usage
        if (chunk.type === 'finish') { finished = true; finishKind = chunk.reason.kind }
        yield chunk
      }
      status = finishKind === 'error' ? 'failed' : finishKind === 'aborted' ? 'cancelled' : finishKind === 'max-tokens' ? 'output-limited' : finished ? 'completed' : 'incomplete-stream'
    } catch (error) {
      status = options.signal?.aborted ? 'cancelled' : 'failed'
      throw error
    } finally {
      // An upstream error message may contain credentials: record only outcome.
      store.recordAuditEvent(study.projectId, 'research-runtime.outcome', {
        ...common, status, finishKind, elapsedMs: Math.max(0, Math.round(performance.now() - started)), ...observedModelUsage(usage),
      })
    }
  })
}
