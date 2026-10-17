import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertLatestResources } from './verify-bundled-resources.mjs'

test('stable packaging refuses stale or missing bundled resources and same-version byte changes', () => {
  const published = [{ id: 'zerowall-presentation', version: '0.2.0', sha256: 'current' }]
  assert.throws(() => assertLatestResources([{ id: 'zerowall-presentation', version: '0.1.9' }], published, { requireAll: true }), /older/)
  assert.throws(() => assertLatestResources([], published, { requireAll: true }), /missing/)
  assert.throws(() => assertLatestResources([{ ...published[0], sha256: 'changed' }], published), /bytes differ/)
  assert.doesNotThrow(() => assertLatestResources(published, published))
  assert.doesNotThrow(() => assertLatestResources([{ id: 'zerowall-presentation', version: '0.2.1' }], published))
  assert.doesNotThrow(() => assertLatestResources([], [{ id: 'dsh-orb', version: '1.0.0' }]))
})
