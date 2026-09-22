import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { expect, it } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import Projects from '../../projects/src/host/index.js'
import Mcp from '../../mcp/src/host/index.js'
import * as Research from '../src/host/index.js'
import { OBESITY_ALOPECIA_RECON_QUERIES } from '../src/host/obesity-alopecia-recon.js'

/** Opt-in live catalog reads. Keeps its case package, never approves a research gate. */
it.runIf(process.env.ZEROWALL_LIVE_RECON === '1')('records actual rmcp reconnaissance and an honest draft case package', async () => {
  assert.ok(process.env.R_PLATFORM_MCP_AUTHORIZATION, 'Configure the Host rmcp credential before running live reconnaissance.')
  const root = resolve('.build/obesity-alopecia-live', new Date().toISOString().replaceAll(':', '-'))
  await mkdir(root, { recursive: true })
  const prior = { db: process.env.ZEROWALL_RESEARCH_DB, home: process.env.DSH_HOME }
  process.env.ZEROWALL_RESEARCH_DB = join(root, 'research.sqlite')
  process.env.DSH_HOME = join(root, 'harness')
  const store = new ResearchStore(process.env.ZEROWALL_RESEARCH_DB)
  const project = store.createProject({ name: '肥胖—脱发：真实目录侦察', rootPath: root })
  const study = store.createResearchStudy({ projectId: project.id, title: '肥胖—脱发：数据可行性侦察（尚未冻结表型）' })
  const session = { id: 'live-recon', header: { cwd: root }, snapshotEvents: () => [], append: () => undefined }
  const ctx = new Context()
  ctx.provide('sessions', { get: (id: string) => id === session.id ? session : undefined } as any)
  const execute = (name: string, args: object) => ctx.tools.execute({ name, arguments: args, callId: ToolCallId(`live-${name}`), signal: AbortSignal.timeout(180000), agent: { session } as any })
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(Projects)
    await ctx.plugin(Mcp)
    await ctx.plugin(Research)
    const configured = (await ctx.zerowallMcp.list()).find(item => item.serverName === 'rmcp')
    if (configured && !configured.enabled) await ctx.zerowallMcp.update({ id: configured.id, changes: { enabled: true } })
    const connected = await execute('mcp_connect', { server: 'rmcp' })
    expect(connected.isError, 'The configured rmcp server did not connect.').toBe(false)
    await expect.poll(async () => (await ctx.zerowallMcp.list()).find(item => item.serverName === 'rmcp')?.runtimeState, { timeout: 20000 }).toBe('active')
    store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'question', payload: {
      question: '肥胖相关表型与明确定义的脱发表型是否存在可检验的关系？',
      status: 'proposed', outcome: 'unknown', estimand: 'unknown',
      limitations: ['本轮只读服务器 NHANES 变量目录。尚未核验官方全部周期、GWAS/QTL、组织或干预数据。', '不预设阳性关联、因果机制、候选基因或可用临床队列。'],
    } })
    const result = await execute('research_study', { action: 'obesity_alopecia_recon', study_id: study.id })
    expect(result.isError, 'Research Host reconnaissance failed.').toBe(false)
    const data = result.value as any
    await writeFile(join(root, 'recon.json'), JSON.stringify(data, null, 2))
    expect(data.findings).toHaveLength(OBESITY_ALOPECIA_RECON_QUERIES.length)
    expect(data.contract.payload.applicability).toBe('pending')
    expect(data.findings.every((finding: any) => ['matched', 'no-match', 'unavailable', 'invalid-response'].includes(finding.status))).toBe(true)
    const draft = await ctx.zerowallResearch.generateResearchReport({ sessionId: session.id, studyId: study.id, mode: 'draft' }) as any
    const reportBytes = await readFile(fileURLToPath(draft.report.uri))
    const manifestBytes = await readFile(fileURLToPath(draft.manifest.uri))
    expect(createHash('sha256').update(reportBytes).digest('hex')).toBe(draft.report.checksum)
    expect(createHash('sha256').update(manifestBytes).digest('hex')).toBe(draft.manifest.checksum)
    const snapshot = store.getResearchStudySnapshot(study.id)!
    expect(snapshot.study.gate1).toBe('pending')
    expect(snapshot.study.gate2).toBe('pending')
    expect(snapshot.freezes).toHaveLength(0)
    expect(snapshot.documents.filter(document => ['evidence', 'claim'].includes(document.kind))).toHaveLength(0)
    await writeFile(join(root, 'study-snapshot.json'), JSON.stringify(snapshot, null, 2))
    const runs = store.listRuns(project.id)
    const summary = { scope: 'actual Research Host + authenticated rmcp NHANES metadata queries; no model or statistical analysis', projectId: project.id, studyId: study.id, executedAt: new Date().toISOString(), status: data.record.status, queries: data.findings.map((finding: any) => ({ key: finding.key, query: finding.query, status: finding.status, matches: finding.matches.length })), runs: runs.map(run => ({ id: run.id, status: run.status, name: run.name })), draft, medicalAnalysisPerformed: false, phenotypeFrozen: false, externalDataReconnaissancePerformed: false }
    await writeFile(join(root, 'report.json'), JSON.stringify(summary, null, 2))
    console.log(JSON.stringify({ output: root, status: summary.status, queries: summary.queries, runs: summary.runs }))
    // A stored access failure remains a real observation, but does not pass live acceptance.
    expect(data.findings.filter((finding: any) => ['unavailable', 'invalid-response'].includes(finding.status))).toEqual([])
    expect(runs.filter(run => run.status === 'succeeded')).toHaveLength(7)
  } finally {
    await ctx.fiber.dispose()
    store.close()
    if (prior.db === undefined) delete process.env.ZEROWALL_RESEARCH_DB; else process.env.ZEROWALL_RESEARCH_DB = prior.db
    if (prior.home === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = prior.home
  }
}, 180000)
