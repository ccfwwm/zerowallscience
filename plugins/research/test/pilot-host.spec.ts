import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { expect, it, vi } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import * as Research from '../src/host/index.js'
import { PILOT_TASKS } from '../src/host/pilot-evaluation.js'

it('routes actual Host pilot RPC, read-only Agent catalog, and project isolation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pilot-host-')); const db = join(root, 'research.sqlite')
  const store = new ResearchStore(db); const ctx = new Context()
  try {
    const project = store.createProject({ name: 'Pilot host', rootPath: join(root, 'project') }); await mkdir(project.rootPath)
    const study = store.createResearchStudy({ projectId: project.id, title: 'Host integration fixture' })
    vi.stubEnv('ZEROWALL_RESEARCH_DB', db)
    const session = { id: 'a', header: { cwd: project.rootPath } }
    ctx.provide('sessions', { get: (id: string) => id === 'a' ? session : undefined } as any)
    await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(Research)
    const policy = store.recordAuditEvent(project.id, 'research-runtime.request', { studyId: study.id, model: 'fixture', provider: 'fixture', systemSha256: 'b'.repeat(64) })
    const input = store.createArtifact({ projectId: project.id, name: 'input', uri: 'fixture:input', mediaType: 'application/json', checksum: 'a'.repeat(64) })
    const reference = store.createArtifact({ projectId: project.id, name: 'reference', uri: 'fixture:reference', mediaType: 'application/json', checksum: 'c'.repeat(64) })
    const spec = { model: 'fixture', provider: 'fixture', policyProvenanceIds: [policy.id], runtimeHashes: { systemSha256: 'b'.repeat(64) }, budgetPerTrial: { tokens: 100, milliseconds: 1000, toolCalls: 1, computeSeconds: 1, humanMinutes: 0, costUsd: 1 }, tasks: PILOT_TASKS.map(([taskId, _title, inputKind]) => ({ taskId, inputKind, split: 'pilot', inputs: [{ artifactId: input.id, checksum: input.checksum }], reference: { artifactId: reference.id, checksum: reference.checksum }, rubric: { check: 'fixture' }, numericTolerance: null, requiredDeliverables: ['fixture'], majorErrors: ['fabrication'], expectedDisposition: 'audit' })) }
    const frozen = ctx.zerowallResearch.pilotEvaluation({ sessionId: 'a', studyId: study.id, action: 'freeze', spec: spec as any })
    expect(frozen.kind).toBe('evaluation')
    const summary = ctx.zerowallResearch.pilotEvaluation({ sessionId: 'a', studyId: study.id, action: 'summary', evaluationId: String(frozen.id) })
    expect(summary.trials).toHaveLength(48)
    expect(() => ctx.zerowallResearch.updateResearchDocument({ id: String(frozen.id), changes: { expectedVersion: 1, payload: {} } })).toThrow('pilot service')
    expect(() => ctx.zerowallResearch.pilotEvaluation({ sessionId: 'foreign', studyId: study.id, action: 'list' })).toThrow('active project')
    const result = await ctx.tools.execute({ name: 'research_study', arguments: { action: 'pilot_catalog', study_id: study.id }, callId: ToolCallId('pilot'), signal: new AbortController().signal, agent: { session } as any })
    expect(result.isError).toBe(false)
    expect((result.value as any).plannedTrialCount).toBe(48)
  } finally { await ctx.fiber.dispose(); store.close(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }) }
})
