import { canonical, compareVersions, verifySignedDocument } from './resource-catalog.mjs'

export function selectedPluginArguments(args) {
  const plugins = [], remaining = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--plugin') { remaining.push(args[i]); continue }
    const id = args[++i]
    if (!id || id.startsWith('--') || plugins.includes(id)) throw new Error('Invalid or duplicate --plugin selection')
    plugins.push(id)
  }
  return { plugins, remaining }
}

export function mergePublishedPlugins(previous, selections, keys) {
  const ids = new Set()
  let result = previous
  for (const selection of selections) {
    if (ids.has(selection.id)) throw new Error('Duplicate selected plugin identity')
    ids.add(selection.id)
    result = mergePublishedPlugin(result, selection, keys)
  }
  return result
}

/** Keep every other published entry, including its original signature. */
export function mergePublishedPlugin(previous, selected, keys) {
  verifySignedDocument(selected, keys)
  const identities = new Set()
  let existing
  for (const entry of previous) {
    verifySignedDocument(entry, keys)
    if (identities.has(entry.id)) throw new Error('Ambiguous published plugin identity: ' + entry.id)
    identities.add(entry.id)
    if (entry.id === selected.id) existing = entry
  }
  if (existing) {
    if (compareVersions(selected.version, existing.version) < 0) throw new Error('Targeted publication cannot downgrade a plugin')
    if (selected.version === existing.version && (selected.sha256 !== existing.sha256 || selected.size !== existing.size || selected.downloadUrl !== existing.downloadUrl)) throw new Error('Same-version plugin bytes changed; bump its version')
  }
  return [...previous.filter(entry => entry.id !== selected.id), selected]
}

/** Refuse to replace a catalog published by another task after our snapshot. */
export function assertPublicationBaseline(current, baseline, intended, keys) {
  verifySignedDocument(current, keys)
  const serialize = document => JSON.stringify(canonical(document))
  if (serialize(current) !== serialize(baseline) && serialize(current) !== serialize(intended)) throw new Error('Published plugin pointer changed after targeted generation; regenerate and stage against the current catalog')
}
