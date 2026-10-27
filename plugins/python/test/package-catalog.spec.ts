import { expect, it } from 'vitest'
import { comparePythonVersions, parsePythonPackageCatalog } from '../src/worker/python-package-catalog.js'

it('orders numeric version segments naturally and keeps PyPI latest as the default', () => {
  expect(comparePythonVersions('2.11.0', '2.9.0')).toBeGreaterThan(0)
  expect(parsePythonPackageCatalog('sample', { info: { name: 'Sample', summary: 'A package', version: '2.11.0' }, releases: { '2.9.0': [{ filename: 'x.whl' }], '2.11.0': [{ filename: 'y.whl' }], '1.0.0': [{ filename: 'z.whl' }] } })).toEqual({
    name: 'Sample', summary: 'A package', latestVersion: '2.11.0', versions: ['2.11.0', '2.9.0', '1.0.0'],
  })
})

it('omits yanked versions and releases without downloadable files', () => {
  expect(parsePythonPackageCatalog('sample', { info: { version: '2.0' }, releases: { '2.0': [{ yanked: false }], '1.9': [{ yanked: true }], '1.8': [] } }).versions).toEqual(['2.0'])
})

it('rejects empty or malformed version metadata', () => {
  expect(() => parsePythonPackageCatalog('missing', { info: {}, releases: {} })).toThrow('缺少版本信息')
})
