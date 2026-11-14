/** Client-owned observation of the optional Desktop preload. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { DesktopUpdateBridge, DesktopUpdateView } from '../types.ts'
import type { UpdateSource, UpdateStatus } from '@deepseek-ai/dsh-client-ui-settings/client'

/** Owns one preload subscription across both sidebar locations. */
export class DesktopUpdateSource {
  /** Framework-observed carrier status shared by both sidebar controls. */
  readonly store = createSnapshotStore<DesktopUpdateView>({ failed: false, opening: false })
  private live = true
  private received = false
  private runtimeChecked = false
  private readonly unsubscribe: (() => void) | undefined

  /** @param bridge - Optional isolated Electron API, absent in ordinary browsers. */
  constructor(private readonly bridge: DesktopUpdateBridge | undefined) {
    this.unsubscribe = bridge?.subscribe((presentation) => {
      if (!this.live) return
      this.received = true
      if (presentation.hostRuntime?.phase === 'idle'
        && this.store.getSnapshot().presentation?.hostRuntime?.phase === 'checking') this.runtimeChecked = true
      this.store.set({ ...this.store.getSnapshot(), presentation, failed: false })
    })
    void bridge?.status().then((presentation) => {
      if (this.live && !this.received) this.store.set({ ...this.store.getSnapshot(), presentation })
    }, () => {
      if (this.live && !this.received) this.store.set({ ...this.store.getSnapshot(), failed: true })
    })
  }

  /** Invoke one user action; subsequent clicks join the shell-owned operation. */
  async open(): Promise<void> {
    if (!this.live || this.bridge === undefined) return
    const state = this.store.getSnapshot()
    if (state.opening || (state.presentation !== undefined
      && ['checking', 'downloading', 'verifying', 'installing'].includes(state.presentation.phase))) return
    this.store.set({ ...state, opening: true })
    await this.bridge.open().catch(() => {
      if (this.live) this.store.set({ ...this.store.getSnapshot(), failed: true })
    }).finally(() => {
      if (this.live) this.store.set({ ...this.store.getSnapshot(), opening: false })
    })
  }

  /**
   * Check, stage, or restart a signed Host Runtime using the current shell state.
   * @param stage - Download the offered candidate when it has not already been staged.
   * @returns Whether the carrier confirmed a settled state without an error.
   */
  async hostRuntimeUpdate(stage: boolean): Promise<boolean> {
    if (!this.live || this.bridge === undefined) return false
    const staged = this.store.getSnapshot().presentation?.hostRuntime?.phase === 'staged'
    try {
      await (staged ? this.bridge.hostRuntimeRestart() : stage ? this.bridge.hostRuntimeStage() : this.bridge.hostRuntimeCheck())
    } catch (_error) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Disposal can occur while IPC is pending.
      if (this.live) this.store.set({ ...this.store.getSnapshot(), failed: true })
      return false
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Disposal can occur while IPC is pending.
    if (!this.live) return false
    const phase = this.store.getSnapshot().presentation?.hostRuntime?.phase
    const success = phase !== undefined && ['idle', 'available', 'staged'].includes(phase)
    if (!staged && !stage && success) this.runtimeChecked = true
    this.store.set({ ...this.store.getSnapshot(), failed: !success })
    return success
  }

  /** Restart through Desktop's task inspection and combined activation transaction. */
  async restart(): Promise<void> {
    if (!this.live || this.bridge === undefined) return
    try { await this.bridge.hostRuntimeRestart() } catch (_error) {
      // Keep a visible retry after Desktop refuses or loses the restart request.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Disposal can occur while IPC is pending.
      if (this.live) this.store.set({ ...this.store.getSnapshot(), failed: true })
    }
  }

  /**
   * Project native state into the shared update page. Older Desktop carriers check application releases automatically;
   * their native download and install confirmation remains the final Desktop preparation action.
   * @param group - Desktop installer or restart-activated runtime.
   * @returns Stable observation and carrier-owned preparation actions.
   */
  source(group: 'desktop' | 'runtime'): UpdateSource {
    let previous: DesktopUpdateView | undefined
    let snapshot: UpdateStatus = { available: 0, ready: false, busy: false, failed: false, checked: false }
    return {
      status: {
        subscribe: listener => this.store.subscribe(listener),
        getSnapshot: () => {
          const view = this.store.getSnapshot()
          if (view === previous) return snapshot
          previous = view
          const native = view.presentation
          const state = group === 'desktop' ? native : native?.hostRuntime
          snapshot = {
            available: state?.phase === 'available' ? 1 : 0,
            ready: state?.phase === 'ready' || state?.phase === 'staged',
            busy: view.opening || state !== undefined && ['checking', 'downloading', 'verifying', 'installing'].includes(state.phase),
            failed: view.failed || state?.phase === 'error',
            checked: group === 'desktop' ? native?.checkedAt !== undefined || native?.configured === false
              : this.runtimeChecked || state?.phase === 'available' || state?.phase === 'staged',
          }
          return snapshot
        },
      },
      ...group === 'runtime' ? { check: async () => {
        if (!this.live || this.bridge === undefined) return false
        if (this.store.getSnapshot().presentation?.hostRuntime?.phase === 'staged') return true
        return this.hostRuntimeUpdate(false)
      } } : {},
      prepare: async () => {
        if (group === 'runtime') {
          if (!this.live || this.bridge === undefined) return false
          if (this.store.getSnapshot().presentation?.hostRuntime?.phase === 'staged') return true
          const success = await this.hostRuntimeUpdate(true)
          return success && this.store.getSnapshot().presentation?.hostRuntime?.phase === 'staged'
        }
        await this.open()
        const view = this.store.getSnapshot()
        return !view.failed && view.presentation?.phase === 'ready'
      },
    }
  }

  /** Detach the carrier and ignore any pending status or action completion. */
  dispose(): void { this.live = false; this.unsubscribe?.() }
}
