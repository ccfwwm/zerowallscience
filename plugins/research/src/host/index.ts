import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  type ArtifactRecord, type AuditEventRecord, type CreateArtifactInput, type CreateDataAssetInput,
  type CreateDecisionInput, type CreateExecutionContextInput, type CreatePaperInput, type CreateResearchEdgeInput,
  type CreateRunInput, type DataAssetRecord, type DecisionRecord, type ExecutionContextRecord, type PaperRecord,
  type ProjectRecord, type ResearchEdgeRecord, type ResearchProjectSnapshotV1, type RunRecord, type UpdateRunChanges, type AuditReport,
} from '@zerowallscience/research-store/types'
import { ResearchStore } from '@zerowallscience/research-store'
import type {} from 'zod'
import { readFile, stat } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ScientificPreviewPayload { uri: string; mediaType: string; byteSize: number; base64: string }

declare module '@deepseek-ai/cordis' {
  interface Context { zerowallResearch: ZeroWallResearchService }
}

export class ZeroWallResearchService extends TypertRemoteService {
  private readonly store: ResearchStore

  constructor(ctx: Context) {
    super(ctx, 'zerowallResearch')
    const path = process.env.ZEROWALL_RESEARCH_DB?.trim()
    if (!path) throw new Error('ZEROWALL_RESEARCH_DB is required.')
    this.store = new ResearchStore(path)
    ctx.on('session/event', (session: Session, event: SessionEvent) => {
      if (event.type !== 'tool/call' && event.type !== 'tool/result') return
      const project = this.store.listProjects().find(item => session.header.cwd !== undefined && isWithin(session.header.cwd, item.rootPath))
      if (project === undefined) return
      if (event.type === 'tool/call') {
        this.store.recordAuditEvent(project.id, 'session.tool-call', {
          sessionId: String(session.id), turn: event.data.turn, step: event.data.step,
          callId: String(event.data.callId), tool: event.data.name,
        }, String(session.id))
      } else {
        const content = event.data.message.content
        this.store.recordAuditEvent(project.id, 'session.tool-result', {
          sessionId: String(session.id), turn: event.data.turn, step: event.data.step,
          outcome: event.data.error === undefined ? 'success' : 'error',
          contentBlocks: content.length, contentChars: content.reduce((total, block) => total + ('text' in block && typeof block.text === 'string' ? block.text.length : 0), 0),
        }, String(session.id))
      }
    })
    ctx.effect(() => () => this.store.close(), 'zerowall-research: close research store')
  }

  @Remote('createExecutionContext') createExecutionContext(input: CreateExecutionContextInput): ExecutionContextRecord { return this.store.createExecutionContext(input) }
  @Remote('listExecutionContexts') listExecutionContexts(projectId: string): ExecutionContextRecord[] { return this.store.listExecutionContexts(projectId) }
  @Remote('createDataAsset') createDataAsset(input: CreateDataAssetInput): DataAssetRecord { return this.store.createDataAsset(input) }
  @Remote('listDataAssets') listDataAssets(projectId: string): DataAssetRecord[] { return this.store.listDataAssets(projectId) }
  @Remote('createRun') createRun(input: CreateRunInput): RunRecord { return this.store.createRun(input) }
  @Remote('updateRun') updateRun(input: { id: string; changes: UpdateRunChanges }): RunRecord { return this.store.updateRun(input.id, input.changes) }
  @Remote('listRuns') listRuns(projectId: string): RunRecord[] { return this.store.listRuns(projectId) }
  @Remote('createArtifact') createArtifact(input: CreateArtifactInput): ArtifactRecord { return this.store.createArtifact(input) }
  @Remote('listArtifacts') listArtifacts(projectId: string): ArtifactRecord[] { return this.store.listArtifacts(projectId) }
  @Remote('createPaper') createPaper(input: CreatePaperInput): PaperRecord { return this.store.createPaper(input) }
  @Remote('listPapers') listPapers(projectId: string): PaperRecord[] { return this.store.listPapers(projectId) }
  @Remote('createDecision') createDecision(input: CreateDecisionInput): DecisionRecord { return this.store.createDecision(input) }
  @Remote('listDecisions') listDecisions(projectId: string): DecisionRecord[] { return this.store.listDecisions(projectId) }
  @Remote('createEdge') createEdge(input: CreateResearchEdgeInput): ResearchEdgeRecord { return this.store.createResearchEdge(input) }
  @Remote('listEdges') listEdges(projectId: string): ResearchEdgeRecord[] { return this.store.listResearchEdges(projectId) }
  @Remote('listAuditEvents') listAuditEvents(projectId: string): AuditEventRecord[] { return this.store.listAuditEvents(projectId) }
  @Remote('getAuditReport') getAuditReport(projectId: string): AuditReport { return this.store.getAuditReport(projectId) }
  @Remote('exportAuditReport') exportAuditReport(input: { projectId: string; format: 'json' | 'markdown' }): string { return this.store.exportAuditReport(input.projectId, input.format) }
  @Remote('exportSnapshot') exportSnapshot(projectId: string): ResearchProjectSnapshotV1 { return this.store.exportResearchSnapshot(projectId) }
  @Remote('importSnapshot') importSnapshot(snapshot: ResearchProjectSnapshotV1): ProjectRecord { return this.store.importResearchSnapshot(snapshot) }
  @Remote('preview') async preview(input: { projectId: string; uri: string; mediaType?: string }): Promise<ScientificPreviewPayload> {
    const project = this.store.listProjects().find(item => item.id === input.projectId)
    if (project === undefined) throw new Error(`Project was not found: ${input.projectId}`)
    const url = new URL(input.uri)
    if (url.protocol !== 'file:') throw new Error('Remote scientific files must be harvested or mounted before preview.')
    const path = resolve(fileURLToPath(url))
    const root = resolve(project.rootPath)
    const inside = relative(root, path)
    if (inside.startsWith('..') || resolve(root, inside) !== path) throw new Error('Preview path is outside the project workspace.')
    const info = await stat(path)
    if (!info.isFile() || info.size > 100 * 1024 * 1024) throw new Error('Preview file must be a regular file no larger than 100 MB.')
    return { uri: input.uri, mediaType: input.mediaType?.trim() || mediaTypeFromPath(path), byteSize: info.size, base64: (await readFile(path)).toString('base64') }
  }
}

function mediaTypeFromPath(path: string): string {
  const extension = path.toLowerCase().split('.').pop()
  return ({ pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', csv: 'text/csv', tsv: 'text/tab-separated-values', fasta: 'text/x-fasta', fa: 'text/x-fasta', fastq: 'text/x-fastq', pdb: 'chemical/x-pdb', sdf: 'chemical/x-mdl-sdfile', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml' } as Record<string, string>)[extension ?? ''] ?? 'application/octet-stream'
}

function isWithin(path: string, root: string): boolean {
  const normalizedPath = resolve(path)
  const normalizedRoot = resolve(root)
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${process.platform === 'win32' ? '\\' : '/'}`)
}

export function apply(ctx: Context): void {
  ctx.plugin(ZeroWallResearchService)
}

export default { apply }
