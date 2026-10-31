import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}

export function moduleDigest(module) {
  return createHash('sha256').update(JSON.stringify(canonical(module))).digest('hex')
}

// A reference records the upstream snapshot at which this module last changed.
// Changes to other modules must not rewrite an independently versioned Skill.
export function moduleProvenance(catalog, module, previous, check = false) {
  if (previous !== undefined) {
    assert(Number.isInteger(previous.protocol_version) && typeof previous.catalog_version === 'string', `Invalid Skill provenance: ${module.skill}`)
    for (const key of ['content_sha256', 'module_sha256']) assert(/^[a-f0-9]{64}$/u.test(previous[key]), `Invalid Skill provenance ${key}: ${module.skill}`)
    if (previous.module_sha256 === moduleDigest(module) && previous.protocol_version === catalog.protocol_version) return previous
  }
  if (check) throw new Error(`Module provenance drift: ${module.skill}; regenerate references and review its independent resource version`)
  return { protocol_version: catalog.protocol_version, catalog_version: catalog.catalog_version, content_sha256: catalog.content_sha256, module_sha256: moduleDigest(module) }
}

export function moduleReference(module, provenance) {
  const { module_sha256: _digest, ...snapshot } = provenance
  return JSON.stringify({ ...snapshot, ...module }, null, 2) + '\n'
}
