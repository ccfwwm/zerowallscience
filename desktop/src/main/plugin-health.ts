export type PluginHealthEntry = { id?: string; name?: string; state?: number }
export type PluginHealth = { ready: boolean; entries: PluginHealthEntry[] }
export type PluginActivationScope = { baseline?: PluginHealth; ids?: string[]; affectedEntries?: Array<{ id?: string; name?: string }> }

/** Only an identified, unchanged failure can predate this transaction. Loading
 * entries and failures in the selected bundle still require normal activation. */
export function unchangedPluginFailure(entry: PluginHealthEntry, options?: PluginActivationScope): boolean {
  if (entry.state !== 3 || !entry.id?.trim() || !entry.name?.trim()) return false
  if (options?.ids?.some(id => entry.name === id || entry.name?.startsWith(id + '/'))) return false
  if (options?.affectedEntries?.some(selected => selected.id && selected.id === entry.id || selected.name && selected.name === entry.name)) return false
  return options?.baseline?.entries.some(previous => previous.id === entry.id && previous.name === entry.name && previous.state === 3) === true
}
