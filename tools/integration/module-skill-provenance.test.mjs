import assert from 'node:assert/strict'
import { test } from 'node:test'
import { moduleDigest, moduleProvenance, moduleReference } from './module-skill-provenance.mjs'

const module = { id: 'a', skill: 'skill-a', operations: [{ id: 'a.read', effects: 'read', input_schema: { type: 'object' } }] }
const catalog = { protocol_version: 2, catalog_version: 'v1', content_sha256: 'a'.repeat(64) }

test('unrelated upstream changes preserve exact independently published reference bytes', () => {
  const original = moduleProvenance(catalog, module)
  const changed = { ...catalog, catalog_version: 'v2', content_sha256: 'b'.repeat(64) }
  assert.deepEqual(moduleProvenance(changed, module, original, true), original)
  assert.equal(moduleReference(module, moduleProvenance(changed, module, original)), moduleReference(module, original))
})

test('a real operation or protocol change requires regeneration and receives current provenance', () => {
  const original = moduleProvenance(catalog, module)
  const changed = { ...module, operations: [{ ...module.operations[0], effects: 'write' }] }
  assert.throws(() => moduleProvenance(catalog, changed, original, true), /provenance drift/)
  const current = moduleProvenance(catalog, changed, original)
  assert.equal(current.module_sha256, moduleDigest(changed))
  assert.notEqual(moduleReference(changed, current), moduleReference(module, original))
  assert.throws(() => moduleProvenance({ ...catalog, protocol_version: 3 }, module, original, true), /provenance drift/)
})

test('missing or corrupted provenance is rejected by check rather than accepted from edited output', () => {
  assert.throws(() => moduleProvenance(catalog, module, undefined, true), /provenance drift/)
  const original = moduleProvenance(catalog, module)
  assert.throws(() => moduleProvenance(catalog, module, { ...original, content_sha256: 'invalid' }, true), /Invalid Skill provenance/)
  assert.throws(() => moduleProvenance(catalog, module, { ...original, module_sha256: 'b'.repeat(64) }, true), /provenance drift/)
})

test('property order does not invalidate a module while operation order and schema changes do', () => {
  assert.equal(moduleDigest(module), moduleDigest({ operations: module.operations, skill: module.skill, id: module.id }))
  assert.notEqual(moduleDigest(module), moduleDigest({ ...module, operations: [{ ...module.operations[0], input_schema: { type: 'string' } }] }))
})
