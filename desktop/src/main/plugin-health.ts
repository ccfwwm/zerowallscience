export type PluginHealthEntry = { id?: string; name?: string; state?: number }
export type PluginHealth = { ready: boolean; entries: PluginHealthEntry[] }
export type PluginActivationScope = { baseline?: PluginHealth; ids?: string[]; affectedEntries?: Array<{ id?: string; name?: string }> }

const requiredIds = new Set(['agent-loop', 'webserver', 'web-runtime', 'modules', 'connection', 'workspace', 'session-controller', 'workspace-controller', 'headless-runner', 'acp', 'sdk-jsonrpc-server'])

/** Core readiness gates ordinary startup. An explicit plugin transaction also
 * waits for its affected entries; unrelated plugins continue in the background. */
export function pluginActivationHealth(health: PluginHealth, options?: PluginActivationScope): { ready: boolean; failures: PluginHealthEntry[] } {
  const entries = health.entries.filter(entry => requiredIds.has(entry.id ?? '')
    || options?.ids?.some(id => entry.name === id || entry.name?.startsWith(id + '/'))
    || options?.affectedEntries?.some(selected => selected.id && selected.id === entry.id || selected.name && selected.name === entry.name))
  return {
    ready: health.ready && entries.every(entry => entry.state === 2),
    failures: entries.filter(entry => entry.state === 3),
  }
}
