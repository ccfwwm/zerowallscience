/** One skill state instance is shared by Discover and the existing update center. */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MarketSkillCatalog } from '@deepseek-ai/dsh-plugin-market/types'

/** Remote callbacks are bound by the browser plugin. */
export interface SkillCatalogRemote {
  read(refresh: boolean): Promise<MarketSkillCatalog>
  install(id: string, version: string): Promise<MarketSkillCatalog>
}

/** Shared observations for the skill catalog and update page. */
export interface SkillCatalogState {
  catalog: MarketSkillCatalog
  busy: boolean
  checked: boolean
  toast: number | null
}

/** Application-owned actions and observations, withdrawn with the browser plugin. */
export interface SkillCatalogController {
  store: SnapshotStore<SkillCatalogState>
  read: (refresh?: boolean) => Promise<boolean>
  install: (targets: readonly { id: string; version: string }[]) => Promise<boolean>
  update: () => Promise<boolean>
  clearToast: () => void
  dispose: () => void
}

/**
 * Create shared skill state for discovery and updates.
 * @param remote - Existing Host market operations.
 * @returns Skill state, explicit actions and lifecycle disposal.
 */
export function createSkillCatalogController(remote: SkillCatalogRemote): SkillCatalogController {
  const store = createSnapshotStore<SkillCatalogState>({
    catalog: { available: false, fetchedAt: '', entries: [] }, busy: false, checked: false, toast: null,
  })
  let live = true
  const active = (): boolean => live
  let operation: Promise<boolean> | undefined
  let sequence = 0
  const run = (kind: 'read' | 'install', task: () => Promise<boolean>): Promise<boolean> => {
    if (operation !== undefined) return kind === 'read' ? operation : operation.then(() => run(kind, task))
    if (!active()) return Promise.resolve(false)
    store.set({ ...store.getSnapshot(), busy: true, toast: null })
    operation = Promise.resolve().then(task).catch((error: unknown) => {
      if (live) store.set({ ...store.getSnapshot(), checked: true, catalog: { ...store.getSnapshot().catalog,
        error: { code: 'catalog', diagnostic: error instanceof Error ? error.message : String(error) } } })
      return false
    }).finally(() => {
      operation = undefined
      if (live) store.set({ ...store.getSnapshot(), busy: false })
    })
    return operation
  }
  const read = (refresh = true): Promise<boolean> => run('read', async () => {
    const catalog = await remote.read(refresh)
    if (!active()) return false
    store.set({ ...store.getSnapshot(), catalog, checked: true })
    return catalog.error === undefined
  })
  const install = (targets: readonly { id: string; version: string }[]): Promise<boolean> => run('install', async () => {
    for (const target of targets) {
      if (!active()) return false
      const catalog = await remote.install(target.id, target.version)
      if (!active()) return false
      store.set({ ...store.getSnapshot(), catalog, checked: true })
      if (catalog.error !== undefined) return false
    }
    store.set({ ...store.getSnapshot(), toast: ++sequence })
    return true
  })
  return {
    store, read, install,
    update: () => install(store.getSnapshot().catalog.entries.filter(row => row.status === 'update')),
    clearToast: () => { if (live) store.set({ ...store.getSnapshot(), toast: null }) },
    dispose: () => { live = false },
  }
}
