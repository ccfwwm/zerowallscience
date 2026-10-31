import type { ToolSchema } from '@deepseek-ai/dsh-llm'

export interface ToolLoader {
  id: string
  names: readonly string[]
  description: string
  load(): void | Promise<void>
}

function waitForRegistration(task: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (signal === undefined) return task
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason) }
    const cleanup = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    void task.then(() => { cleanup(); resolve() }, error => { cleanup(); reject(error) })
  })
}

/** Local, explicitly registered providers only. Discovery never scans disk,
 * installs a plugin, connects an MCP server, or executes the requested tool. */
export function createToolLoaders(registered: (name: string) => boolean) {
  const owners = new Map<string, ToolLoader>()
  const pending = new Map<ToolLoader, Promise<void>>()
  return {
    register(loader: ToolLoader): () => void {
      const names = [...new Set(loader.names)]
      if (!loader.id || !names.length || names.some(name => !/^[A-Za-z0-9_-]+$/u.test(name) || owners.has(name))) throw new Error('TOOL_LOADER_CONFLICT: invalid or duplicate local tool provider')
      for (const name of names) owners.set(name, loader)
      return () => { for (const name of names) if (owners.get(name) === loader) owners.delete(name) }
    },
    catalog(): ToolSchema[] {
      return [...owners].filter(([name]) => !registered(name)).map(([name, loader]) => ({ name, description: loader.description, parameters: { type: 'object', properties: {} } }))
    },
    async ensure(name: string, signal?: AbortSignal): Promise<boolean> {
      signal?.throwIfAborted()
      if (registered(name)) return true
      const loader = owners.get(name)
      if (!loader) return false
      let task = pending.get(loader)
      if (!task) {
        task = Promise.resolve().then(() => loader.load())
        pending.set(loader, task)
        void task.finally(() => { if (pending.get(loader) === task) pending.delete(loader) }).catch(() => {})
      }
      try { await waitForRegistration(task, signal) }
      catch (error) {
        signal?.throwIfAborted()
        throw new Error(`TOOL_LOAD_FAILED: ${loader.id} (${name}): ${error instanceof Error ? error.message : String(error)}`, { cause: error })
      }
      // Drain shared registration even if one caller cancels; that caller must
      // never execute the body or cancel another caller's shared preparation.
      signal?.throwIfAborted()
      if (owners.get(name) !== loader || !registered(name)) throw new Error(`TOOL_LOAD_INCOMPLETE: ${loader.id} did not register ${name}`)
      return true
    },
  }
}
