import { createHash, randomUUID } from 'node:crypto'
import { mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { JsonObject, ProjectRecord, ResearchDocumentRecord, ResearchStudySnapshot } from '@zerowallscience/research-store/types'
import { containedFile } from './science-viewer.js'

const RUNNER = 'zerowall-science-imrad-report/7.0.0-2'

export type ReportMode = 'draft' | 'final'
export interface ReportResponse {
  mode: ReportMode
  report: { uri: string; checksum: string; artifactId: string }
  manifest: { uri: string; checksum: string; artifactId: string }
  needsReview: boolean
  blockers: string[]
  documentIds: string[]
}

function text(value: unknown, fallback = '未记录'): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function payloadText(document: ResearchDocumentRecord): string {
  const payload = document.payload as Record<string, unknown>
  const preferred = ['text', 'question', 'summary', 'resultScope', 'note', 'status', 'method', 'estimand', 'source']
    .filter(key => payload[key] !== undefined)
    .map(key => `${key}: ${text(payload[key])}`)
  if (preferred.length) return preferred.join('；')
  const compact = JSON.stringify(payload)
  return compact.length > 1200 ? `${compact.slice(0, 1200)}…` : compact
}

function references(payload: JsonObject): string[] {
  const keys = ['artifactId', 'artifactIds', 'runId', 'runIds', 'assetId', 'assetIds', 'source', 'sourceUri']
  const values: string[] = []
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string') values.push(value)
    else if (Array.isArray(value)) values.push(...value.filter(item => typeof item === 'string') as string[])
  }
  return [...new Set(values)].slice(0, 50)
}

function section(title: string, rows: string[]): string {
  return `## ${title}\n\n${rows.length ? rows.map(row => `- ${row}`).join('\n') : '- 未记录'}\n`
}

function renderMarkdown(snapshot: ResearchStudySnapshot, mode: ReportMode, generatedAt: string, blockers: string[]): string {
  const { study, documents, freezes, tasks = [] } = snapshot
  const by = (kind: ResearchDocumentRecord['kind']) => documents.filter(document => document.kind === kind)
  const question = by('question')
  const contracts = by('dataset-contract')
  const plans = by('analysis-plan')
  const observations = by('observation')
  const evidence = by('evidence')
  const claims = by('claim')
  const limitations = [...new Set([
    ...documents.flatMap(document => {
      const value = document.payload.limitations
      return Array.isArray(value) ? value.filter(item => typeof item === 'string') as string[] : []
    }),
    '报告只登记已保存的研究对象、Run、Artifact 和证据记录；没有登记的分析不会被补写。',
  ])]
  const lines = [
    `# ${study.title}`,
    '',
    `> ZeroWall Science 7.0.2 IMRAD ${mode === 'final' ? '正式交付版' : '草稿'} · 生成时间：${generatedAt}`,
    '',
    '## 摘要',
    '',
    `研究阶段：${study.phase}；研究状态：${study.status}；Gate 1：${study.gate1}；Gate 2：${study.gate2}。`,
    `本报告登记 ${documents.length} 条研究文档、${tasks.length} 个任务和 ${freezes.length} 个冻结快照。`,
    '',
    section('Introduction', question.map(document => `[${document.id}] ${payloadText(document)}`)).trimEnd(),
    section('Methods', [
      ...contracts.map(document => `数据契约 [${document.id}]：${payloadText(document)}`),
      ...plans.map(document => `分析计划 [${document.id}]：${payloadText(document)}`),
      ...freezes.map(freeze => `冻结快照 [${freeze.id}] v${freeze.version}（${freeze.createdAt}）`),
    ]).trimEnd(),
    section('Results', [
      ...observations.map(document => `观察 [${document.id}]：${payloadText(document)}`),
      ...evidence.map(document => `证据 [${document.id}]：${payloadText(document)}；引用：${references(document.payload).join(', ') || '未登记'}`),
      ...claims.map(document => `主张 [${document.id}]：${payloadText(document)}；审计：${text(document.payload.auditStatus, '未审计')}`),
    ]).trimEnd(),
    section('Discussion', limitations),
    section('Reproducibility and traceability', [
      ...tasks.map(task => `任务 [${task.id}] ${task.name}：${task.status}；尝试次数 ${task.attempt}；Run ${task.runId ?? '未关联'}`),
      `研究快照版本：${study.version}；文档版本均来自 ResearchStore。`,
    ]).trimEnd(),
    '## Review status',
    '',
    `交付模式：${mode}；${blockers.length ? `当前阻断：${blockers.join('；')}` : '没有待处理的门禁阻断。'}`,
    '',
    '本文件是可追踪的研究报告草稿/交付物，不把计算成功自动升级为科学结论；主张仍需按证据范围和人工审阅状态解释。',
    '',
  ]
  return lines.join('\n')
}

export class ReportService {
  constructor(private readonly store: ResearchStore) {}

  async generate(project: ProjectRecord, studyId: string, mode: ReportMode = 'draft'): Promise<ReportResponse> {
    const study = this.store.getResearchStudy(studyId)
    if (!study || study.projectId !== project.id) throw new Error('Research study is not in the active project.')
    const snapshot = this.store.getResearchStudySnapshot(studyId)
    const runtimeProvenance = this.store.listResearchRuntimeEvents(studyId)
    const evidence = snapshot.documents.filter(document => document.kind === 'evidence')
    const claims = snapshot.documents.filter(document => document.kind === 'claim')
    const blockers: string[] = []
    // Drafts display the same outstanding scientific gates as final exports.
    // The export mode controls whether blockers stop writing, not their truth.
    if (study.gate1 !== 'approved') blockers.push('Gate 1 尚未批准')
    if (!study.currentFreezeId) blockers.push('研究方案尚未冻结')
    if (study.gate2 !== 'approved') blockers.push('Gate 2 尚未批准')
    if (claims.length === 0) blockers.push('没有主张记录')
    const unaudited = claims.filter(document => document.payload.auditStatus !== 'passed')
    if (unaudited.length) blockers.push(`${unaudited.length} 条主张尚未通过证据审计`)
    if (evidence.some(document => document.payload.needsReview === true)) blockers.push('存在待人工复核证据')
    if (mode === 'final' && blockers.length) throw new Error(`不能生成正式 IMRAD 报告：${blockers.join('；')}`)

    const root = await realpath(project.rootPath)
    const exportRoot = join(root, '.zerowall', 'science-exports')
    await mkdir(exportRoot, { recursive: true })
    const base = await containedFile(root, exportRoot)
    const directoryRaw = join(base, randomUUID(), 'imrad-report')
    await mkdir(directoryRaw, { recursive: true })
    const directory = await containedFile(root, directoryRaw)
    const generatedAt = new Date().toISOString()
    const markdown = renderMarkdown(snapshot, mode, generatedAt, blockers)
    const manifestValue: JsonObject = {
      format: 'zerowall-science-imrad-report', version: 2, runner: RUNNER, mode, generatedAt,
      studyId, studyVersion: study.version, gate1: study.gate1, gate2: study.gate2,
      documentIds: snapshot.documents.map(document => document.id),
      evidenceIds: evidence.map(document => document.id), claimIds: claims.map(document => document.id),
      taskIds: (snapshot.tasks ?? []).map(task => task.id), freezes: snapshot.freezes.map(freeze => freeze.id),
      runtimeProvenance: JSON.parse(JSON.stringify(runtimeProvenance)),
      provenanceScope: 'Observed provider-neutral requests only; absent history, provider wire transforms and unlinked subagents are not inferred.',
      blockers, needsReview: mode !== 'final' || blockers.length > 0,
    }
    const reportPath = join(directory, 'imrad-report.md')
    const manifestPath = join(directory, 'manifest.json')
    const manifest = `${JSON.stringify(manifestValue, null, 2)}\n`
    try {
      await writeFile(reportPath, markdown, { flag: 'wx' }); await writeFile(manifestPath, manifest, { flag: 'wx' })
      const report = this.store.createArtifact({ projectId: project.id, name: `IMRAD 报告：${study.title}`, uri: pathToFileURL(reportPath).href, mediaType: 'text/markdown', checksum: createHash('sha256').update(markdown).digest('hex'), metadata: { runner: RUNNER, studyId, studyVersion: study.version, mode, manifestUri: pathToFileURL(manifestPath).href, needsReview: mode !== 'final' } })
      const manifestArtifact = this.store.createArtifact({ projectId: project.id, name: `IMRAD 报告清单：${study.title}`, uri: pathToFileURL(manifestPath).href, mediaType: 'application/json', checksum: createHash('sha256').update(manifest).digest('hex'), metadata: { runner: RUNNER, studyId, reportArtifactId: report.id, mode, needsReview: mode !== 'final' } })
      return { mode, report: { uri: report.uri, checksum: report.checksum ?? '', artifactId: report.id }, manifest: { uri: manifestArtifact.uri, checksum: manifestArtifact.checksum ?? '', artifactId: manifestArtifact.id }, needsReview: mode !== 'final' || blockers.length > 0, blockers, documentIds: snapshot.documents.map(document => document.id) }
    } catch (error) {
      await rm(directory, { recursive: true, force: true }); throw error
    }
  }
}
