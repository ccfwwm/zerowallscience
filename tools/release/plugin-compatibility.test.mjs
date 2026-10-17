import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyAuditedPluginCompatibility } from './plugin-compatibility.mjs'
const sidebar = { id: 'dsh-better-sidebar', version: '0.26.1-zws.2' }
const consumer = { id: 'consumer', version: '1.0.0', dependencies: { 'dsh-better-sidebar': '^0.25.0' }, packageDependencies: { 'dsh-better-sidebar': '0.25.0' }, size: 42, sha256: 'a'.repeat(64), downloadUrl: 'https://example.com/consumer.tgz', signature: { value: 'old' } }
const rule = { dependency: sidebar.id, previousRange: '^0.25.0', testedVersion: sidebar.version, consumers: [{ id: consumer.id, version: consumer.version }] }
test('exact audited compatibility changes only signed metadata and retains archive contract', () => {
  const unchanged = { id: 'other' }
  const result = applyAuditedPluginCompatibility([sidebar, consumer, unchanged], [rule], [sidebar.id], entry => ({ ...entry, signature: { value: 'new' } }))
  assert.equal(result[2], unchanged)
  assert.equal(result[1].dependencies[sidebar.id], '^0.25.0 || 0.26.1-zws.2')
  for (const key of ['id', 'version', 'size', 'sha256', 'downloadUrl', 'packageDependencies']) assert.deepEqual(result[1][key], consumer[key])
  assert.equal(consumer.signature.value, 'old')
  assert.deepEqual(applyAuditedPluginCompatibility([sidebar, consumer], [rule], ['retired-plugin'], () => { throw Error() }), [sidebar, consumer])
})
test('new consumer versions, mismatched ranges and untested sidebar versions fail closed', () => {
  for (const edited of [{ ...consumer, version: '1.0.1' }, { ...consumer, dependencies: { [sidebar.id]: '^0.24.0' } }, { ...consumer, id: 'unreviewed' }]) {
    assert.throws(() => applyAuditedPluginCompatibility([sidebar, edited], [rule], [sidebar.id], x => x), /Unaudited/)
  }
  assert.throws(() => applyAuditedPluginCompatibility([{ ...sidebar, version: '0.27.0' }, consumer], [rule], [sidebar.id], x => x), /exact tested/)
})

test('independently published consumer versions require separate audited identities', () => {
  const next = { ...consumer, version: '1.0.1' }
  const rules = [{ ...rule, consumers: [...rule.consumers, { id: consumer.id, version: next.version }] }]
  const result = applyAuditedPluginCompatibility([sidebar, consumer, next], rules, [sidebar.id], x => x)
  for (const entry of result.slice(1)) assert.equal(entry.dependencies[sidebar.id], '^0.25.0 || 0.26.1-zws.2')
  assert.throws(() => applyAuditedPluginCompatibility([sidebar, { ...next, version: '1.0.2' }], rules, [sidebar.id], x => x), /Unaudited/)
})
