/** One durable commit decision for Host and business plugin generations. */
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { activateBusinessUpdate, businessGenerationDir, readBusinessUpdateState, writeBusinessUpdateState,
  type BusinessUpdateState } from '@deepseek-ai/dsh-app-boot'
import { confirmHostRuntime, parseHostRuntimeState, readHostRuntimeState, writeHostRuntimeState,
  type HostRuntimeResolution, type HostRuntimeState } from './host-runtime.ts'

interface Generations { host?: HostRuntimeState; business?: BusinessUpdateState }
interface RestartJournal {
  schemaVersion: 1
  id: string
  phase: 'activating' | 'confirming' | 'confirmed' | 'rolled-back'
  before: Generations
  confirmed?: Generations
  failure?: string
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function generations(value: unknown, profile: string): Generations {
  if (!record(value)) throw new Error('desktop restart: invalid generation record')
  const result: Generations = {}
  if (value.host !== undefined) result.host = parseHostRuntimeState(value.host)
  if (value.business !== undefined) {
    const business = value.business
    if (!record(business) || business.schemaVersion !== 1 || !['prepared', 'activating', 'verified', 'restored', 'restore-failed'].includes(String(business.phase))) {
      throw new Error('desktop restart: invalid business state')
    }
    const parsed: BusinessUpdateState = { schemaVersion: 1, phase: business.phase as BusinessUpdateState['phase'] }
    for (const key of ['active', 'previous', 'pending', 'failed'] as const) {
      const id = business[key]
      if (id === undefined) continue
      if (typeof id !== 'string') throw new Error('desktop restart: invalid business generation')
      businessGenerationDir(profile, id)
      parsed[key] = id
    }
    if ((parsed.phase === 'prepared') !== (parsed.pending !== undefined)
      || (parsed.phase === 'activating' && parsed.active === undefined)) throw new Error('desktop restart: invalid business transition')
    result.business = parsed
  }
  return result
}

/**
 * Persist activation intent before either updater changes its selected generation.
 * A durable confirmation decision is replayed to both state files after interruption.
 */
export class DesktopRestartActivation {
  private journal: RestartJournal | undefined
  private mutation: Promise<void> = Promise.resolve()

  /** @param root - Host store shared by this installation. @param profile - Business plugin profile. */
  constructor(private readonly root: string, private readonly profile: string) {}

  /** @returns Whether this startup has unconfirmed candidates. */
  get pending(): boolean { return this.journal?.phase === 'activating' }

  private serialize(operation: () => Promise<void>): Promise<void> {
    const next = this.mutation.then(operation, operation)
    this.mutation = next
    return next
  }

  private async persist(journal: RestartJournal): Promise<void> {
    const bytes = JSON.stringify(journal, null, 2) + '\n'
    await writeFileAtomic(join(this.root, 'restart-transaction.json'), bytes, { mode: 0o600, dirMode: 0o700 })
    this.journal = journal
    await writeFileAtomic(join(this.root, 'transactions', `${journal.id}.json`), bytes, { mode: 0o600, dirMode: 0o700 })
  }

  private async read(): Promise<RestartJournal | undefined> {
    let value: unknown
    try { value = JSON.parse(await readFile(join(this.root, 'restart-transaction.json'), 'utf8')) }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
      throw error
    }
    if (!record(value) || value.schemaVersion !== 1 || typeof value.id !== 'string'
      || !/^[a-f0-9-]{36}$/u.test(value.id)
      || !['activating', 'confirming', 'confirmed', 'rolled-back'].includes(String(value.phase))
      || (value.failure !== undefined && typeof value.failure !== 'string')) throw new Error('desktop restart: damaged transaction journal')
    const journal: RestartJournal = { schemaVersion: 1, id: value.id, phase: value.phase as RestartJournal['phase'], before: generations(value.before, this.profile) }
    if (value.confirmed !== undefined) journal.confirmed = generations(value.confirmed, this.profile)
    if (value.failure !== undefined) journal.failure = value.failure
    if (journal.phase === 'confirming' && journal.confirmed === undefined) throw new Error('desktop restart: missing commit decision')
    return journal
  }

  private async apply(states: Generations): Promise<void> {
    if (states.host !== undefined) await writeHostRuntimeState(this.root, states.host)
    if (states.business !== undefined) writeBusinessUpdateState(this.profile, states.business)
  }

  /** Recover an interrupted transaction, then record this startup's prepared candidates. */
  begin(): Promise<void> { return this.serialize(() => this.beginNow()) }

  private async beginNow(): Promise<void> {
    this.journal = await this.read()
    if (this.journal?.phase === 'confirming') await this.finishConfirmation(this.journal)
    else if (this.pending) await this.rollbackNow('HOST_STARTUP_INTERRUPTED')
    const host = await readHostRuntimeState(this.root)
    const business = readBusinessUpdateState(this.profile)
    if (host?.pending?.phase !== 'staged' && business?.phase !== 'prepared') return
    await this.persist({ schemaVersion: 1, id: randomUUID(), phase: 'activating', before: {
      ...(host === undefined ? {} : { host }), ...(business === undefined ? {} : { business }),
    } })
  }

  /** Activate business bytes and reject a candidate that its integrity check restored. */
  activateBusiness(): void {
    activateBusinessUpdate(this.profile)
    const planned = this.pending ? this.journal?.before.business?.pending : undefined
    const actual = readBusinessUpdateState(this.profile)
    if (planned !== undefined && (actual?.phase !== 'activating' || actual.active !== planned)) throw new Error('desktop restart: business candidate failed verification')
  }

  /** Reject a Host candidate bypassed by Bootstrap so both candidates roll back. */
  assertRuntime(resolution: HostRuntimeResolution): void {
    const planned = this.pending ? this.journal?.before.host?.pending : undefined
    if (planned !== undefined && (resolution.ignoredExternal !== undefined || resolution.selection.source !== 'external'
      || resolution.selection.version !== planned.version)) throw new Error('desktop restart: Host candidate failed verification')
  }

  /** Restore both original generations; the candidate and failure records remain on disk. */
  rollback(code: string): Promise<void> { return this.serialize(() => this.rollbackNow(code)) }

  private async rollbackNow(code: string): Promise<void> {
    const journal = this.journal
    if (journal?.phase !== 'activating') return
    const states: Generations = {}
    const host = journal.before.host
    if (host !== undefined) {
      const { pending, ...restored } = host
      states.host = { ...restored, lastFailure: { version: pending?.version ?? host.active.version,
        phase: 'restart-transaction', code, at: new Date().toISOString() } }
    }
    const business = journal.before.business
    if (business !== undefined) states.business = { schemaVersion: 1, phase: 'restored',
      ...(business.active === undefined ? {} : { active: business.active }),
      ...(business.pending === undefined ? {} : { failed: business.pending }) }
    await this.apply(states)
    await this.persist({ ...journal, phase: 'rolled-back', failure: code })
  }

  private async finishConfirmation(journal: RestartJournal): Promise<void> {
    if (journal.confirmed === undefined) throw new Error('desktop restart: missing confirmed generations')
    await this.apply(journal.confirmed)
    await this.persist({ ...journal, phase: 'confirmed' })
  }

  /** Commit both generations after the primary renderer mounted every selected plugin. */
  confirm(): Promise<void> { return this.serialize(() => this.confirmNow()) }

  private async confirmNow(): Promise<void> {
    const journal = this.journal
    if (journal?.phase !== 'activating') return
    const host = await readHostRuntimeState(this.root)
    const business = readBusinessUpdateState(this.profile)
    const confirmed: Generations = {
      ...(host === undefined ? {} : { host: host.pending?.phase === 'activating' ? confirmHostRuntime(host, host.active.version) : host }),
      ...(business === undefined ? {} : { business: { ...business, phase: business.failed === undefined ? 'verified' : 'restored' } }),
    }
    const decision: RestartJournal = { ...journal, phase: 'confirming', confirmed }
    await this.persist(decision)
    await this.finishConfirmation(decision)
  }
}
