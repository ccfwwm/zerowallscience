import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, LlmModelInfo } from '@deepseek-ai/dsh-llm'
import { KNOWN_SESSION_EVENT_TYPES, type Session, type SessionEvent, type SessionEventMap } from '@deepseek-ai/dsh-session'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-subagent'
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'

export const name = 'zerowall-reviewer'
export const inject = ['settings', 'subagents', 'commands', 'llm']
export const REVIEWER_SETTINGS_NS = settingsNamespace('zerowall-reviewer')

// Reviewer events are durable plugin-owned session events. Register them with
// the rc8 persistence allow-list during composition instead of a global patch.
const sessionEventTypes = KNOWN_SESSION_EVENT_TYPES as Set<string>
sessionEventTypes.add('zerowall/reviewer/mode')
sessionEventTypes.add('zerowall/reviewer/report')

export type ReviewerMode = 'inherit' | 'on' | 'off'
export type ReviewerModelMode = 'follow-session' | 'fixed'
export type ReviewStatus = 'passed' | 'failed' | 'unreviewable' | 'error'

export interface ReviewerSettings {
  autoReview: boolean
  modelMode: ReviewerModelMode
  provider: string
  model: string
  reasoningEffort?: string
}

export const ReviewerSettingsSchema: z<ReviewerSettings> = z.object({
  autoReview: z.boolean().default(false),
  modelMode: z.union(['follow-session', 'fixed'] as const).default('follow-session'),
  provider: z.string().default(''),
  model: z.string().default(''),
  reasoningEffort: z.string().default(''),
})

export interface ReviewFinding {
  messageIndex: number
  claim: string
  evidence: string
  fix: string
  verdict: 'warn' | 'fail' | 'inconclusive'
  severity: 'low' | 'medium' | 'high'
  status: 'open' | 'resolved' | 'unaddressed'
}

export interface ReviewReport {
  id: string
  turn: number
  summary: string
  findings: ReviewFinding[]
  reviewerModel: string
  reviewerEffort?: string
  reviewerBackend: string
  reviewStatus: ReviewStatus
  evidenceCoverage: number
  coverageGaps: string[]
  correction?: 'none' | 'requested' | 'completed'
  reReviewed?: boolean
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'zerowall/reviewer/mode': { mode: ReviewerMode }
    'zerowall/reviewer/report': ReviewReport
  }
}

const PER_TOOL_CAP = 4_000
const TOTAL_CAP = 80_000
const MAX_FINDINGS = 8
const REVIEW_TIMEOUT_MS = 60_000
const ACTIVE_REVIEWER_PARENTS = new Map<string, string | undefined>()
const REVIEWER_PERSONA = `You are ZeroWall Science's independent Reviewer. Trace the supplied transcript only. Do not recompute or use outside knowledge. Every finding must cite a [msg:N ...] block and quote the relevant claim and evidence. Return only the requested structured object. Do not report correct work.`
const REVIEW_SCHEMA: ObjectJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          messageIndex: { type: 'integer' },
          claim: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
          verdict: { type: 'string', enum: ['warn', 'fail', 'inconclusive'] },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['messageIndex', 'claim', 'evidence', 'fix', 'verdict', 'severity'],
      },
    },
  },
  required: ['summary', 'findings'],
}

function textOf(blocks: readonly ContentBlock[]): string {
  return blocks.flatMap((block) => {
    if (block.type === 'text' || block.type === 'reasoning') return [block.text]
    if (block.type === 'tool-result') return [textOf(block.content)]
    return []
  }).join('\n')
}

function truncate(value: string, cap: number): string {
  if (value.length <= cap) return value
  let end = cap
  while (end > 0 && end < value.length && (value.charCodeAt(end) & 0xfc00) === 0xdc00) end -= 1
  return `${value.slice(0, end)}…[truncated]`
}

function eventText(event: SessionEvent): string {
  if (event.type === 'user/message') return textOf(event.data.content)
  if (event.type === 'assistant/message') return textOf(event.data.message.content)
  if (event.type === 'tool/result') return textOf(event.data.message.content)
  return ''
}

export function serializeTranscript(events: readonly SessionEvent[]): string {
  const calls = new Map<string, { name: string; arguments: string }>()
  for (const event of events) {
    if (event.type === 'tool/call') calls.set(String(event.data.callId), { name: event.data.name, arguments: event.data.arguments })
  }
  const blocks: string[] = []
  let index = 0
  for (const event of events) {
    if (event.type === 'user/message') {
      const text = eventText(event)
      if (text.trim()) blocks.push(`[msg:${index++} USER]\n${text}`)
    } else if (event.type === 'assistant/message') {
      const text = eventText(event)
      if (text.trim()) blocks.push(`[msg:${index++} ASSISTANT]\n${text}`)
    } else if (event.type === 'tool/result') {
      const callId = String(event.data.message.source.kind === 'tool' ? event.data.message.source.callId : '')
      const call = calls.get(callId)
      const name = call?.name ?? 'tool'
      const input = call?.arguments ? `input:\n${truncate(call.arguments, PER_TOOL_CAP)}\n` : ''
      const output = truncate(eventText(event), PER_TOOL_CAP)
      blocks.push(`[msg:${index++} TOOL:${name}]\n${input}output:\n${output}`)
    }
  }
  const kept: string[] = []
  let used = 0
  for (const block of blocks.toReversed()) {
    if (kept.length > 0 && used + block.length + 2 > TOTAL_CAP) break
    kept.push(block)
    used += block.length + 2
  }
  kept.reverse()
  return `${kept.length < blocks.length ? '[…earlier transcript truncated…]\n\n' : ''}${kept.join('\n\n')}`
}

export function assessEvidence(events: readonly SessionEvent[]): { coverage: number; gaps: string[] } {
  const toolResults = events.filter(event => event.type === 'tool/result')
  const gaps: string[] = []
  let complete = 0
  for (const event of toolResults) {
    const text = eventText(event).trim()
    if (text.length === 0) gaps.push(`tool result at seq ${event.seq} has no inspectable output`)
    else if (text.length > PER_TOOL_CAP) gaps.push(`tool result at seq ${event.seq} exceeded ${PER_TOOL_CAP} characters and was truncated`)
    else complete += 1
  }
  if (serializeTranscript(events).startsWith('[…earlier transcript truncated…]')) {
    gaps.push(`transcript exceeded ${TOTAL_CAP} characters and older evidence was truncated`)
  }
  if (toolResults.length === 0) return { coverage: gaps.length === 0 ? 100 : 0, gaps: gaps.slice(0, 12) }
  return { coverage: Math.floor(complete * 100 / toolResults.length), gaps: gaps.slice(0, 12) }
}

export function shouldAutoReview(events: readonly SessionEvent[], currentTurn: number): boolean {
  const current = events.filter(event => 'turn' in event.data && (event.data as { turn?: number }).turn === currentTurn)
  const hasTool = current.some(event => event.type === 'tool/result' && event.data.message.content.length > 0)
  const prose = current.filter(event => event.type === 'assistant/message').map(eventText).join('').length
  return hasTool || prose >= 600
}

function transcriptBlocks(transcript: string): Map<number, string> {
  const blocks = new Map<number, string>()
  const matches = [...transcript.matchAll(/^\[msg:(\d+) [^\]]+\]\n([\s\S]*?)(?=\n\n\[msg:|$)/gmu)]
  for (const match of matches) blocks.set(Number(match[1]), match[2] ?? '')
  return blocks
}

export function normalizeReport(
  raw: unknown,
  model: string,
  evidence: { coverage: number; gaps: string[] },
  turn: number,
  transcript: string,
  effort?: string,
): ReviewReport {
  const value = raw !== null && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const rawFindings = Array.isArray(value.findings) ? value.findings : []
  const citedBlocks = transcriptBlocks(transcript)
  const coverageGaps = [...evidence.gaps]
  const findings: ReviewFinding[] = rawFindings.slice(0, MAX_FINDINGS).flatMap(item => {
    if (item === null || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    if (typeof row.claim !== 'string' || typeof row.evidence !== 'string' || typeof row.fix !== 'string') return []
    const verdict = row.verdict === 'fail' || row.verdict === 'inconclusive' ? row.verdict : 'warn'
    const severity = row.severity === 'high' || row.severity === 'medium' ? row.severity : 'low'
    const messageIndex = Number.isSafeInteger(row.messageIndex) ? row.messageIndex as number : -1
    const cited = citedBlocks.get(messageIndex)
    if (cited === undefined || !cited.includes(row.evidence.trim())) {
      coverageGaps.push(`finding for msg:${messageIndex} did not quote evidence from its cited transcript block`)
      return []
    }
    return [{ messageIndex, claim: row.claim, evidence: row.evidence, fix: row.fix, verdict, severity, status: 'open' }]
  })
  return {
    id: crypto.randomUUID(),
    turn,
    summary: typeof value.summary === 'string' && value.summary.trim() ? value.summary : findings.length ? `${findings.length} finding(s) require correction.` : 'No issues found.',
    findings,
    reviewerModel: model,
    ...(effort === undefined ? {} : { reviewerEffort: effort }),
    reviewerBackend: 'spawn',
    reviewStatus: findings.length ? 'failed' : coverageGaps.length ? 'unreviewable' : 'passed',
    evidenceCoverage: evidence.coverage,
    coverageGaps: coverageGaps.slice(0, 12),
    correction: 'none',
    reReviewed: false,
  }
}

function latestMode(session: Session): ReviewerMode {
  const event = [...session.events].reverse().find(item => item.type === 'zerowall/reviewer/mode')
  return event?.type === 'zerowall/reviewer/mode' ? event.data.mode : 'inherit'
}

function effectiveEnabled(session: Session, settings: ReviewerSettings): boolean {
  const mode = latestMode(session)
  return mode === 'on' || (mode === 'inherit' && settings.autoReview)
}

function currentTurnEvents(session: Session, turn: number): SessionEvent[] {
  return session.events.filter(event => 'turn' in event.data && (event.data as { turn?: number }).turn === turn)
}

function currentModel(agent: Agent, settings: ReviewerSettings): { options?: AgentOptions; label: string; effort?: string } {
  if (settings.modelMode === 'fixed') {
    if (!settings.provider || !settings.model) throw new Error('Reviewer fixed model is not configured.')
    return { options: { provider: settings.provider, model: settings.model }, label: `${settings.provider}/${settings.model}`, ...(settings.reasoningEffort ? { effort: settings.reasoningEffort } : {}) }
  }
  const header = [...agent.session.events].reverse().find(event => event.type === 'request/header')
  if (header?.type !== 'request/header') throw new Error('Current session has no valid model request configuration.')
  const config = header.data.header.config
  return { options: { provider: config.provider, model: config.model }, label: `${config.provider}/${config.model}`, ...(config.reasoningEffort ? { effort: String(config.reasoningEffort) } : {}) }
}

function reviewerModelCandidate(entry: LlmModelInfo): boolean {
  if (/^(?:gpt-)?image(?:-|$)|imagegen|dall-e/iu.test(entry.id)) return false
  return entry.inputModalities === undefined || entry.inputModalities.includes('text')
}

async function runReview(ctx: Context, agent: Agent, events: readonly SessionEvent[], turn: number, signal: AbortSignal): Promise<ReviewReport> {
  const settings = ctx.settings.get(REVIEWER_SETTINGS_NS) as ReviewerSettings
  const model = currentModel(agent, settings)
  if (model.options?.provider && model.options.model) {
    const models = await ctx.llm.listModels(model.options.provider)
    if (!models.some((entry: LlmModelInfo) => entry.id === model.options?.model && reviewerModelCandidate(entry))) {
      throw new Error(`Reviewer model is unavailable: ${model.label}`)
    }
  }
  const evidence = assessEvidence(events)
  const transcript = serializeTranscript(events)
  const prompt = `${REVIEWER_PERSONA}\n\nTranscript:\n${transcript}\n\nAssess every claim against cited tool evidence. Use messageIndex values from the transcript.`
  const timeout = AbortSignal.timeout(REVIEW_TIMEOUT_MS)
  const reviewSignal = AbortSignal.any([signal, timeout])
  ACTIVE_REVIEWER_PARENTS.set(String(agent.id), model.effort)
  let run
  try {
    run = await ctx.subagents.start('spawn', {
      parent: agent,
      signal: reviewSignal,
      prompt: [{ type: 'text', text: prompt }],
      persona: REVIEWER_PERSONA,
      outputSchema: REVIEW_SCHEMA,
      toolFilter: { allow: ['structured_output'] },
      ...(model.options === undefined ? {} : { agentOptions: model.options }),
    })
  } catch (error) {
    ACTIVE_REVIEWER_PARENTS.delete(String(agent.id))
    throw error
  }
  try {
    const result = await run.result
    if (result.stopReason !== 'completed' || result.structured === undefined) throw new Error(`Reviewer child ended with ${result.stopReason}.`)
    return normalizeReport(result.structured, model.label, evidence, turn, transcript, model.effort)
  } finally {
    ACTIVE_REVIEWER_PARENTS.delete(String(agent.id))
    await run.dispose()
  }
}

function appendReport(session: Session, report: ReviewReport): void {
  const append = session.append.bind(session) as (type: 'zerowall/reviewer/report', data: SessionEventMap['zerowall/reviewer/report']) => unknown
  append('zerowall/reviewer/report', report)
}

function correctionPrompt(report: ReviewReport): string {
  return `Independent review found issues in your latest answer. Correct the answer once, using tools again if needed. Preserve supported conclusions and explicitly state corrections.\n\n${report.findings.map((finding, index) => `${index + 1}. Claim: ${finding.claim}\nEvidence: ${finding.evidence}\nRequired fix: ${finding.fix}`).join('\n\n')}`
}

export function apply(ctx: Context): void {
  const scope = ctx.settings.register(REVIEWER_SETTINGS_NS, ReviewerSettingsSchema)
  ctx.on('agent/request', async ({ agent }, next) => {
    const parent = agent.session.header.parentSession
    if (parent === undefined || !ACTIVE_REVIEWER_PARENTS.has(String(parent))) return await next()
    const config = await next()
    const effort = ACTIVE_REVIEWER_PARENTS.get(String(parent))
    return effort === undefined ? config : { ...config, reasoningEffort: ReasoningEffortId(effort) }
  })
  const review = async (agent: Agent, turn: number, signal: AbortSignal, allowCorrection: boolean): Promise<ReviewReport | undefined> => {
    const settings = scope.get()
    const events = currentTurnEvents(agent.session, turn)
    if (events.length === 0) return undefined
    try {
      let report = await runReview(ctx, agent, events, turn, signal)
      if (allowCorrection && report.reviewStatus === 'failed' && report.findings.length > 0) {
        report.correction = 'requested'
        appendReport(agent.session, report)
        agent.steer(createUserMessage({ content: [{ type: 'text', text: correctionPrompt(report) }], source: { kind: 'plugin', plugin: name } }))
        return report
      }
      appendReport(agent.session, report)
      return report
    } catch (error) {
      const report: ReviewReport = {
        id: crypto.randomUUID(), turn, summary: error instanceof Error ? error.message : String(error), findings: [], reviewerModel: settings.modelMode === 'fixed' && settings.provider && settings.model ? `${settings.provider}/${settings.model}` : 'unavailable', reviewerBackend: 'spawn', reviewStatus: 'error', evidenceCoverage: 0, coverageGaps: [], correction: 'none', reReviewed: false,
      }
      appendReport(agent.session, report)
      ctx.logger.warn(`Reviewer failed for ${String(agent.id)}: ${report.summary}`)
      return report
    }
  }

  ctx.on('agent/turn-stopping', async ({ agent, turn, signal }) => {
    if (agent.session.header.parentSession !== undefined || agent.session.header.origin === 'subagent') return
    const prior = [...agent.session.events].reverse().find(event => event.type === 'zerowall/reviewer/report' && event.data.turn === turn)
    if (prior?.type === 'zerowall/reviewer/report') {
      if (prior.data.reReviewed === true || prior.data.correction !== 'requested') return
      try {
        const followUp = await runReview(ctx, agent, currentTurnEvents(agent.session, turn), turn, signal)
        const reconciled: ReviewReport = followUp.findings.length === 0
          ? {
              ...prior.data,
              summary: followUp.summary,
              findings: prior.data.findings.map(finding => ({ ...finding, status: 'resolved' })),
              reviewerModel: followUp.reviewerModel,
              ...(followUp.reviewerEffort === undefined ? {} : { reviewerEffort: followUp.reviewerEffort }),
              reviewStatus: followUp.reviewStatus,
              evidenceCoverage: followUp.evidenceCoverage,
              coverageGaps: followUp.coverageGaps,
              correction: 'completed',
              reReviewed: true,
            }
          : {
              ...followUp,
              id: prior.data.id,
              findings: followUp.findings.map(finding => ({ ...finding, status: 'unaddressed' })),
              correction: 'completed',
              reReviewed: true,
            }
        appendReport(agent.session, reconciled)
      } catch (error) {
        appendReport(agent.session, {
          ...prior.data,
          summary: error instanceof Error ? error.message : String(error),
          reviewStatus: 'error',
          correction: 'completed',
          reReviewed: true,
        })
      }
      return
    }
    const settings = scope.get()
    if (!effectiveEnabled(agent.session, settings) || !shouldAutoReview(agent.session.events, turn)) return
    await review(agent, turn, signal, true)
  })

  const command = (name: string, handler: (agent: Agent, raw: string, signal: AbortSignal) => Promise<CommandResult>): void => {
    ctx.commands.register({ name, description: `Reviewer command: /${name}`, input: { hint: 'optional' }, handler: invocation => handler(invocation.agent, invocation.rawInput, invocation.signal) })
  }
  command('review', async (agent, raw, signal) => {
    const action = raw.trim().split(/\s+/u)[0] || 'status'
    if (action === 'on' || action === 'off' || action === 'follow') {
      agent.session.append('zerowall/reviewer/mode', { mode: action === 'follow' ? 'inherit' : action })
      return { kind: 'success', text: `Reviewer mode: ${action}` }
    }
    if (action === 'now') {
      const last = [...agent.session.events].reverse().find(event => event.type === 'turn/end' && event.data.reason.kind === 'completed')
      if (last?.type !== 'turn/end') return { kind: 'error', text: 'No completed answer is available for review.' }
      const report = await review(agent, last.data.turn, signal, false)
      return { kind: 'success', text: report?.summary ?? 'Reviewer did not run.' }
    }
    if (action !== 'status') return { kind: 'error', text: `Unknown review action: ${action}` }
    const mode = latestMode(agent.session)
    const settings = scope.get()
    return { kind: 'success', text: `Reviewer ${mode === 'inherit' ? (settings.autoReview ? 'on' : 'off') : mode}; ${settings.modelMode}` }
  })
}

export default { name, inject, apply }
