import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { ResearchStore } from '@zerowallscience/research-store'
import type { CreatePublicationInput, JsonObject, PublicationRecord, RunRecord } from '@zerowallscience/research-store/types'
import type { RunSubmission, ZeroWallRunsService } from '@zerowallscience/plugin-runs'
import { writePublicationBundle } from './export.js'
import type {} from 'zod'

declare module '@deepseek-ai/cordis' { interface Context { zerowallPublication: ZeroWallPublicationService } }
export class ZeroWallPublicationService extends TypertRemoteService {
  private readonly store: ResearchStore
  constructor(ctx: Context) { super(ctx, 'zerowallPublication'); const path = process.env.ZEROWALL_RESEARCH_DB?.trim(); if (!path) throw new Error('ZEROWALL_RESEARCH_DB is required.'); this.store = new ResearchStore(path); ctx.effect(() => () => this.store.close(), 'zerowall-publication: close research store') }
  @Remote('create') create(input: CreatePublicationInput): PublicationRecord { return this.store.createPublication(input) }
  @Remote('get') get(id: string): PublicationRecord { return this.refresh(id) }
  @Remote('list') list(projectId: string): PublicationRecord[] { return this.store.listPublications(projectId).map(item => this.refresh(item.id)) }
  @Remote('freeze') freeze(id: string): PublicationRecord { return this.store.freezePublication(id) }
  @Remote('validate') validate(id: string): PublicationRecord { return this.store.validatePublication(id) }
  @Remote('reproduce') reproduce(input: { id: string; run?: Partial<RunSubmission> }): PublicationRecord {
    const publication = this.required(input.id)
    if (publication.frozenSnapshot === undefined) throw new Error('Freeze the publication before starting reproduction.')
    const configured = reproductionConfig(publication.manifest)
    const command = input.run?.command ?? configured.command
    if (command === undefined || command.trim() === '') throw new Error('Publication reproduction requires a command in the manifest or request.')
    const project = publication.frozenSnapshot.project
    const run = this.runs().submit({
      projectId: publication.projectId,
      name: input.run?.name ?? `Reproduce: ${publication.title}`,
      command,
      workingDirectory: input.run?.workingDirectory ?? configured.workingDirectory ?? project.rootPath,
      ...((input.run?.executionContextId ?? configured.executionContextId) === undefined ? {} : { executionContextId: input.run?.executionContextId ?? configured.executionContextId }),
      ...((input.run?.timeoutMs ?? configured.timeoutMs) === undefined ? {} : { timeoutMs: input.run?.timeoutMs ?? configured.timeoutMs }),
      inputs: input.run?.inputs ?? configured.inputs ?? [], outputs: input.run?.outputs ?? configured.outputs ?? [],
    } as RunSubmission)
    return this.refresh(this.store.startPublicationReproduction(publication.id, run.id).id)
  }
  @Remote('refreshReproduction') refreshReproduction(id: string): PublicationRecord { return this.refresh(id) }
  @Remote('export') async export(input: { id: string; uri: string }): Promise<PublicationRecord> {
    const publication = this.refresh(input.id)
    if (publication.status !== 'ready') throw new Error('Only a ready publication can be exported.')
    await writePublicationBundle(publication, input.uri)
    return this.store.exportPublication(input.id, input.uri)
  }

  private refresh(id: string): PublicationRecord {
    const publication = this.required(id)
    if (publication.status !== 'validating' || publication.reproductionRunId === undefined) return publication
    const run = this.runs().get(publication.reproductionRunId)
    if (!['succeeded', 'failed', 'cancelled', 'timed_out'].includes(run.status)) return publication
    const ok = run.status === 'succeeded'
    return this.store.finishPublicationReproduction(publication.id, ok, {
      ok, reproduction: run.status, runId: run.id, completedAt: run.updatedAt,
      ...(run.error === undefined ? {} : { error: run.error }),
    })
  }

  private required(id: string): PublicationRecord {
    const publication = this.store.getPublication(id)
    if (publication === undefined) throw new Error(`Publication was not found: ${id}`)
    return publication
  }

  private runs(): ZeroWallRunsService {
    const service = this.ctx.get('zerowallRuns')
    if (service === undefined) throw new Error('ZeroWall Run Manager is not available.')
    return service
  }
}

interface ReproductionConfig {
  command?: string
  workingDirectory?: string
  executionContextId?: string
  timeoutMs?: number
  inputs?: RunRecord['inputs']
  outputs?: RunRecord['outputs']
}

function reproductionConfig(manifest: JsonObject): ReproductionConfig {
  const raw = manifest.reproduction
  if (raw === undefined || raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const value = raw as Record<string, unknown>
  return {
    ...(typeof value.command === 'string' ? { command: value.command } : {}),
    ...(typeof value.workingDirectory === 'string' ? { workingDirectory: value.workingDirectory } : {}),
    ...(typeof value.executionContextId === 'string' ? { executionContextId: value.executionContextId } : {}),
    ...(typeof value.timeoutMs === 'number' ? { timeoutMs: value.timeoutMs } : {}),
    ...(Array.isArray(value.inputs) ? { inputs: value.inputs as RunRecord['inputs'] } : {}),
    ...(Array.isArray(value.outputs) ? { outputs: value.outputs as RunRecord['outputs'] } : {}),
  }
}
export function apply(ctx: Context): void {
  ctx.plugin(ZeroWallPublicationService)
}

export default { apply }
