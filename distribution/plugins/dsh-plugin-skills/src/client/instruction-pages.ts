/** Keep instructions reachable for providers whose packages have no bundle detail page. */
import type { ManagedSkill } from '../shared/types.js'

interface InstructionPagesOptions {
  load(): Promise<{ entries: readonly ManagedSkill[]; packages: readonly string[] }>
  register(ownerPackage: string): () => void
  failed(error: unknown): void
}

/**
 * Reconcile package-owned instruction pages and release all contributions on teardown.
 * @param options - Inventory reader, page registration and error reporting owned by the client scope.
 * @returns Serialized refresh and teardown operations; failed reads retain current pages.
 */
export function createInstructionPages(options: InstructionPagesOptions): { refresh(): Promise<void>; dispose(): Promise<void> } {
  const pages = new Map<string, () => void>()
  let disposed = false
  let pending = Promise.resolve()
  return {
    refresh() {
      pending = pending.then(async () => {
        if (disposed) return
        const inventory = await options.load()
        if (disposed) return
        const bundles = new Set(inventory.packages)
        const owners = new Set(inventory.entries.flatMap(entry => entry.kind === 'plugin-instructions' && entry.ownerPackage && !bundles.has(entry.ownerPackage) ? [entry.ownerPackage] : []))
        for (const [owner, dispose] of pages) if (!owners.has(owner)) { dispose(); pages.delete(owner) }
        for (const owner of owners) if (!pages.has(owner)) pages.set(owner, options.register(owner))
      }).catch(options.failed)
      return pending
    },
    async dispose() {
      disposed = true
      await pending
      for (const dispose of pages.values()) dispose()
      pages.clear()
    },
  }
}
