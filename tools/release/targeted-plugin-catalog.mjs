import { canonical, compareVersions, verifySignedDocument } from './resource-catalog.mjs'
import { RETIRED_PLUGIN_IDS } from '../commands/retired-plugins.mjs'

function selectedArguments(args, option, kind) {
  const selected = [], remaining = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== option) { remaining.push(args[i]); continue }
    const id = args[++i]
    if (!id || id.startsWith('--') || selected.includes(id)) throw new Error(`Invalid or duplicate ${option} selection`)
    selected.push(id)
  }
  return { selected, remaining, kind }
}

export function selectedPluginArguments(args) {
  const { selected: plugins, remaining } = selectedArguments(args, '--plugin', 'plugin')
  return { plugins, remaining }
}

export function selectedSkillArguments(args) {
  const { selected: skills, remaining } = selectedArguments(args, '--skill', 'skill')
  return { skills, remaining }
}

export function mergePublishedPlugins(previous, selections, keys) {
  return mergePublishedResources(previous, selections, keys, 'plugin')
}

export function mergePublishedSkills(previous, selections, keys, retiredIds = new Set()) {
  return mergePublishedResources(previous, selections, keys, 'skill', retiredIds)
}

function mergePublishedResources(previous, selections, keys, kind, retiredIds) {
  const ids = new Set()
  let result = previous
  for (const selection of selections) {
    if (ids.has(selection.id)) throw new Error(`Duplicate selected ${kind} identity`)
    ids.add(selection.id)
    result = mergePublishedResource(result, selection, keys, kind, retiredIds)
  }
  return result
}

/** Keep every other published entry, including its original signature. */
export function mergePublishedPlugin(previous, selected, keys) {
  return mergePublishedResource(previous, selected, keys, 'plugin')
}

function mergePublishedResource(previous, selected, keys, kind, retiredIds = kind === 'plugin' ? RETIRED_PLUGIN_IDS : new Set()) {
  verifySignedDocument(selected, keys)
  const identities = new Set()
  let existing
  for (const entry of previous) {
    verifySignedDocument(entry, keys)
    if (identities.has(entry.id)) throw new Error(`Ambiguous published ${kind} identity: ` + entry.id)
    identities.add(entry.id)
    if (entry.id === selected.id) existing = entry
  }
  if (existing) {
    if (compareVersions(selected.version, existing.version) < 0) throw new Error(`Targeted publication cannot downgrade a ${kind}`)
    if (selected.version === existing.version && (selected.sha256 !== existing.sha256 || selected.size !== existing.size || selected.downloadUrl !== existing.downloadUrl)) throw new Error(`Same-version ${kind} bytes changed; bump its version`)
  }
  if (retiredIds.has(selected.id)) throw new Error(`Cannot publish a retired ${kind}`)
  return [...previous.filter(entry => entry.id !== selected.id && !retiredIds.has(entry.id)), selected]
}

/** Refuse to replace a catalog published by another task after our snapshot. */
export function assertPublicationBaseline(current, baseline, intended, keys) {
  return assertResourcePublicationBaseline(current, baseline, intended, keys, 'plugin')
}

export function assertResourcePublicationBaseline(current, baseline, intended, keys, kind) {
  verifySignedDocument(current, keys)
  const serialize = document => JSON.stringify(canonical(document))
  if (serialize(current) !== serialize(baseline) && serialize(current) !== serialize(intended)) throw new Error(`Published ${kind} pointer changed after targeted generation; regenerate and stage against the current catalog`)
}
