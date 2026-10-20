import type { Context, Plugin } from '@deepseek-ai/cordis'

const runtimes = new WeakMap<Context, Map<string, { owners: number; fiber: ReturnType<Context['plugin']> }>>()

// Both catalog identities can coexist during an update. The last owner releases
// the runtime, so disabling either entry cannot strand the other active entry.
export async function ownMediaRuntime(ctx: Context, key: string, plugin: Plugin, config?: unknown): Promise<void> {
  await ctx.effect(async () => {
    let entries = runtimes.get(ctx.root)
    if (!entries) runtimes.set(ctx.root, entries = new Map())
    let entry = entries.get(key)
    if (!entry) {
      entry = { owners: 0, fiber: ctx.root.plugin(plugin, config) }
      entries.set(key, entry)
    }
    entry.owners++
    let released = false
    const release = async () => {
      if (released) return
      released = true
      if (--entry.owners === 0) {
        entries.delete(key)
        await entry.fiber.dispose()
      }
    }
    try { await entry.fiber } catch (error) { await release(); throw error }
    return release
  }, 'shared media runtime')
}
