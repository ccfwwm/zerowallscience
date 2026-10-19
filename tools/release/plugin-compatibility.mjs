import { satisfiesPackageRange } from '../commands/package-range.mjs'

/** Extend only an audited dependency edge; preserve immutable archive identity. */
export function applyAuditedPluginCompatibility(entries, rules, selectedPlugins, signEntry) {
  let result = entries
  for (const rule of rules) {
    if (!selectedPlugins.includes(rule.dependency)) continue
    const consumers = new Set(rule.consumers.map(entry => `${entry.id}@${entry.version}`))
    // Historical exceptions only apply while their exact consumers are present.
    // New consumer releases carry their own dependency compatibility contracts.
    if (!result.some(entry => consumers.has(`${entry.id}@${entry.version}`) && entry.dependencies?.[rule.dependency])) continue
    const dependency = result.find(entry => entry.id === rule.dependency)
    if (dependency?.version !== rule.testedVersion) throw new Error('Audited plugin compatibility requires its exact tested version')
    result = result.map(entry => {
      const range = entry.dependencies?.[rule.dependency]
      if (!range || satisfiesPackageRange(dependency.version, range)) return entry
      if (!consumers.has(`${entry.id}@${entry.version}`) || range !== rule.previousRange) throw new Error('Unaudited plugin dependency edge: ' + entry.id)
      const { signature: _signature, ...payload } = entry
      return signEntry({ ...payload, dependencies: { ...entry.dependencies, [rule.dependency]: `${range} || ${rule.testedVersion}` } })
    })
  }
  return result
}
