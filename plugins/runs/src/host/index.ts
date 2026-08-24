import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { dirname, join } from 'node:path'
import { ResearchStore } from '@zerowallscience/research-store'
import type { RunRecord } from '@zerowallscience/research-store/types'
import { RunManager } from './manager.js'
import type { RunSubmission } from '../shared/types.js'
import type {} from 'zod'

declare module '@deepseek-ai/cordis' { interface Context { zerowallRuns: ZeroWallRunsService } }

export class ZeroWallRunsService extends TypertRemoteService {
  private readonly store: ResearchStore
  private readonly manager: RunManager
  constructor(ctx: Context) {
    super(ctx, 'zerowallRuns')
    const path = process.env.ZEROWALL_RESEARCH_DB?.trim()
    if (!path) throw new Error('ZEROWALL_RESEARCH_DB is required.')
    this.store = new ResearchStore(path)
    this.manager = new RunManager(this.store, join(dirname(path), 'runs'))
    void this.manager.recover()
    ctx.effect(() => () => { this.manager.dispose(); this.store.close() }, 'zerowall-runs: close research store')
  }

  @Remote('submit') submit(input: RunSubmission): RunRecord { return this.manager.submit(input) }
  @Remote('get') get(runId: string): RunRecord { return this.manager.get(runId) }
  @Remote('list') list(projectId: string): RunRecord[] { return this.manager.list(projectId) }
  @Remote('cancel') cancel(runId: string): Promise<RunRecord> { return this.manager.cancel(runId) }
  @Remote('pause') pause(runId: string): Promise<RunRecord> { return this.manager.pause(runId) }
  @Remote('resume') resume(runId: string): Promise<RunRecord> { return this.manager.resume(runId) }
  @Remote('log') log(input: { runId: string; maxBytes?: number }): string { return this.manager.log(input.runId, input.maxBytes) }
  @Remote('progress') progress(input: { runId: string; progress: number }): RunRecord { return this.manager.updateProgress(input.runId, input.progress) }
  @Remote('declareOutputs') declareOutputs(input: { runId: string; outputs: RunRecord['outputs'] }): RunRecord { return this.manager.declareOutputs(input.runId, input.outputs) }
  @Remote('harvest') harvest(runId: string): RunRecord { return this.manager.harvest(runId) }
}

export function apply(ctx: Context): void {
  ctx.plugin(ZeroWallRunsService)
}

export default { apply }
export type { RunSubmission } from '../shared/types.js'
