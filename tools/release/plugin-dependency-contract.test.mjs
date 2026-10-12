import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pluginDependencyContract } from './plugin-dependency-contract.mjs'
import { satisfiesPackageRange } from '../commands/package-range.mjs'

test('source compatibility permits a patch update while retaining immutable archive requirements', () => {
  const record = { dependencies: { account: '0.1.4', strict: '1.2.3' } }
  const result = pluginDependencyContract(record, { dependencies: { account: 'workspace:^', strict: '1.2.3' } })
  assert.equal(satisfiesPackageRange('0.1.6', result.dependencies.account), true)
  assert.equal(satisfiesPackageRange('0.2.0', result.dependencies.account), false)
  assert.equal(satisfiesPackageRange('1.2.4', result.dependencies.strict), false)
  assert.deepEqual(result.packageDependencies, { account: '0.1.4', strict: '1.2.3' })
  assert.equal(record.dependencies.account, '0.1.4')
})
test('only the explicitly pinned theme adaptation changes its catalog identity', () => {
  const record = { dependencies: { 'dsh-dream-skin': '10.9.3', arbitrary: '10.9.3' } }
  const source = { dependencies: { 'dsh-dream-skin': '10.9.3', arbitrary: '10.9.3' } }
  const result = pluginDependencyContract(record, source, { dreamSkin: { version: '10.9.3', resourceVersion: '10.9.4-zws.2' } })
  assert.equal(result.dependencies['dsh-dream-skin'], '10.9.4-zws.2')
  assert.equal(result.dependencies.arbitrary, '10.9.3')
})
