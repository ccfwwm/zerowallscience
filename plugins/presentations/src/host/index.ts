import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { ResearchStore } from '@zerowallscience/research-store'
import type { CreatePresentationInput, PresentationRecord, UpdatePresentationChanges } from '@zerowallscience/research-store/types'
import { PresentationWorker } from './worker.js'
import { writePresentation } from './export.js'
import type {} from 'zod'

declare module '@deepseek-ai/cordis' { interface Context { zerowallPresentation: ZeroWallPresentationService } }
export class ZeroWallPresentationService extends TypertRemoteService {
  private readonly store: ResearchStore
  private readonly worker: PresentationWorker
  constructor(ctx: Context) { super(ctx, 'zerowallPresentation'); const path = process.env.ZEROWALL_RESEARCH_DB?.trim(); if (!path) throw new Error('ZEROWALL_RESEARCH_DB is required.'); this.store = new ResearchStore(path); this.worker = new PresentationWorker(this.store); this.worker.recover(); ctx.effect(() => () => { this.worker.dispose(); this.store.close() }, 'zerowall-presentation: close research store') }
  @Remote('create') create(input: CreatePresentationInput): PresentationRecord { return this.store.createPresentation(input) }
  @Remote('list') list(projectId: string): PresentationRecord[] { return this.store.listPresentations(projectId) }
  @Remote('update') update(input: { id: string; changes: UpdatePresentationChanges }): PresentationRecord { return this.store.updatePresentation(input.id, input.changes) }
  @Remote('generate') generate(id: string): PresentationRecord { return this.worker.generate(id) }
  @Remote('pause') pause(id: string): PresentationRecord { return this.worker.pause(id) }
  @Remote('resume') resume(id: string): PresentationRecord { return this.worker.resume(id) }
  @Remote('cancel') cancel(id: string): PresentationRecord { return this.worker.cancel(id) }
  @Remote('export') async export(input: { id: string; format: 'pptx' | 'pdf'; uri: string }): Promise<PresentationRecord> {
    const presentation = this.store.getPresentation(input.id)
    if (presentation === undefined) throw new Error(`Presentation was not found: ${input.id}`)
    if (presentation.status !== 'ready') throw new Error('Only a ready presentation can be exported.')
    await writePresentation(presentation, input.format, input.uri)
    return this.store.exportPresentation(input.id, input.format, input.uri)
  }
}
export function apply(ctx: Context): void {
  ctx.plugin(ZeroWallPresentationService)
}

export default { apply }
