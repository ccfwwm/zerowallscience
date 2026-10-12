/** Catalog compatibility is the source workspace contract. Older immutable
 * tarballs flattened workspace:^ to an exact version; keep those bytes and
 * retain the original archive requirements separately for audit. */
export function pluginDependencyContract(record, source, integrations = {}) {
  const dependencies = { ...record.dependencies }
  for (const [id, range] of Object.entries(source?.dependencies ?? {})) {
    const packed = dependencies[id]
    if (!packed) continue
    if (range === 'workspace:^' || range === 'workspace:~') {
      dependencies[id] = range.slice(-1) + packed.replace(/^[~^]/u, '')
    }
    // This audited adapter preserves the locked upstream API while carrying
    // its own immutable resource version. No generic prerelease exception.
    const skin = integrations.dreamSkin
    if (id === 'dsh-dream-skin' && range === skin?.version && packed === skin.version && skin.resourceVersion) dependencies[id] = skin.resourceVersion
  }
  return { dependencies, packageDependencies: record.dependencies }
}
