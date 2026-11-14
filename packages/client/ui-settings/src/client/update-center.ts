/** Shared update discovery and preparation; installation and restart remain source-owned. */
import { Service, type Context } from '@deepseek-ai/cordis'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

/** Independently delivered update groups, prepared before Desktop can restart the process. */
export type UpdateGroup = 'plugins' | 'runtime' | 'desktop'

/** One updater's current facts; failed checks retain their last available count. */
export interface UpdateStatus {
  available: number
  ready: boolean
  busy: boolean
  failed: boolean
  checked: boolean
}

/** Source-owned operations return false after refusal, cancellation, or an unknown outcome. */
export interface UpdateSource {
  status: HostObservable<UpdateStatus>
  /** Absent when the installed Desktop checks automatically through its native carrier. */
  check?: () => Promise<boolean>
  prepare: () => Promise<boolean>
}

/** Snapshot shared by the sidebar and update page, including progress after the page closes. */
export interface UpdateCenterSnapshot {
  sources: readonly (UpdateStatus & { id: UpdateGroup })[]
  operation: 'idle' | 'checking' | 'preparing'
  failure?: { group: UpdateGroup; operation: 'check' | 'prepare' } | undefined
}

/** Coordinates registered updaters without changing their activation or persistence policy. */
export class UpdateCenter extends Service {
  /** Stable shared observations for framework-bound consumers. */
  readonly store: SnapshotStore<UpdateCenterSnapshot> = createSnapshotStore({ sources: [], operation: 'idle' })
  private readonly sources = new Map<UpdateGroup, UpdateSource>()
  private readonly subscriptions = new Map<UpdateGroup, () => void>()
  private operation: Promise<boolean> | undefined
  private live = true

  /** @param ctx - Settings provider that owns the observation lifetime. */
  constructor(ctx: Context) {
    super(ctx, 'updateCenter')
    ctx.effect(() => () => {
      this.live = false
      for (const unsubscribe of this.subscriptions.values()) unsubscribe()
      this.subscriptions.clear()
      this.sources.clear()
    }, 'ui-settings: update center')
  }

  /**
   * Observe an updater until its contribution is removed. The caller registers the disposer with its effect.
   * @param id - Group with a single registration owner.
   * @param source - Stable observation and updater-owned actions.
   * @returns Disposer that removes only this contribution and detaches its observation.
   */
  register(id: UpdateGroup, source: UpdateSource): () => void {
    if (!this.live) throw new Error('Update center has been disposed')
    if (this.sources.has(id)) throw new Error(`An updater already owns ${id}`)
    this.sources.set(id, source)
    const unsubscribe = source.status.subscribe(() => { this.publish() })
    this.subscriptions.set(id, unsubscribe)
    this.publish()
    return () => {
      if (this.sources.get(id) !== source) return
      unsubscribe()
      this.subscriptions.delete(id)
      this.sources.delete(id)
      this.publish()
    }
  }

  /** Check registered metadata sources; concurrent gestures join the same operation.
   * @returns Whether all supported metadata checks completed.
   */
  checkAll(): Promise<boolean> { return this.run('checking') }

  /**
   * Prepare all known updates in plugin, runtime, then Desktop order. A failed or removed source stops the sequence;
   * prepared candidates remain staged and no restart is requested here.
   * @returns Whether every selected source confirmed successful preparation.
   */
  prepareAll(): Promise<boolean> { return this.run('preparing') }

  private publish(): void {
    if (!this.live) return
    const sources = [...this.sources].map(([id, source]) => ({ id, ...source.status.getSnapshot() }))
    this.store.set({ ...this.store.getSnapshot(), sources })
  }

  private run(operation: 'checking' | 'preparing'): Promise<boolean> {
    if (this.operation !== undefined) return this.operation
    if (!this.live || this.store.getSnapshot().sources.some(source => source.busy)) return Promise.resolve(false)
    this.store.set({ ...this.store.getSnapshot(), operation, failure: undefined })
    const sources = this.sources
    const entries = (['plugins', 'runtime', 'desktop'] as const).flatMap((id) => {
      const source = sources.get(id)
      return source === undefined ? [] : [{ id, source }]
    })
    this.operation = Promise.resolve().then(async () => {
      let completed = true
      for (const { id, source } of entries) {
        if (!this.live) return false
        if (this.sources.get(id) !== source) return false
        const current = source.status.getSnapshot()
        if (operation === 'preparing' && (current.failed || current.busy)) {
          this.store.set({ ...this.store.getSnapshot(), failure: { group: id, operation: 'prepare' } })
          return false
        }
        const action = operation === 'checking' ? source.check
          : current.available > 0 && !current.ready ? source.prepare : undefined
        if (action === undefined) continue
        let success = false
        try { success = await action() } catch (_error) {
          // The source retains diagnostics; the shared page also reports the interrupted group.
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- The provider can unload while a source runs.
        if (!this.live) return false
        if (!success || this.sources.get(id) !== source) {
          completed = false
          if (this.store.getSnapshot().failure === undefined) this.store.set({ ...this.store.getSnapshot(), failure: { group: id, operation: operation === 'checking' ? 'check' : 'prepare' } })
          if (operation === 'preparing') return false
        }
      }
      return completed
    }).finally(() => {
      this.operation = undefined
      if (this.live) this.store.set({ ...this.store.getSnapshot(), operation: 'idle' })
    })
    return this.operation
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Shared update availability and source-owned preparation. */
    updateCenter: UpdateCenter
  }
}
