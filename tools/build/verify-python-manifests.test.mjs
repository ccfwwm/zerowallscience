import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { generateKeyPairSync } from 'node:crypto'
import { signDocument } from '../release/python-layer-split.mjs'
import { assertPythonManifests, assertPythonManifestBytes } from './verify-python-manifests.mjs'

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const keys = { 'stable-4': publicKey }
function pair(overrides = {}) {
  const common = { applicationVersion: '8.2.0', runtimeId: 'python', platform: 'win32-x64', environmentVersion: '3.12.10', pythonVersion: '3.12.10', compatibility: { minApplicationVersion: '8.1.0' } }
  return ['science', 'core'].map(layer => signDocument({ ...common, layer, revision: layer === 'core' ? 'r19-core' : 'r19', ...overrides, signature: { algorithm: 'ed25519', keyId: 'stable-4', value: '' } }, privateKey, publicKey))
}
test('older signed Python provenance is compatible with newer desktop', () => {
  assert.doesNotThrow(() => assertPythonManifests(...pair(), '8.3.0', keys))
})
test('both layers enforce compatibility and reject malformed provenance', () => {
  const manifests = pair(); manifests[1] = pair({ compatibility: { minApplicationVersion: '9.0.0' } })[1]
  assert.throws(() => assertPythonManifests(...manifests, '8.3.0', keys), /incompatible/)
  assert.throws(() => assertPythonManifests(...pair({ applicationVersion: 'broken' }), '8.3.0', keys), /semantic/)
})
test('rejects tampering, unknown keys and mismatched generations', () => {
  const tampered = pair(); tampered[0].pythonVersion = '3.13.0'
  assert.throws(() => assertPythonManifests(...tampered, '8.3.0', keys), /signature/)
  assert.throws(() => assertPythonManifests(...pair(), '8.3.0', {}), /signature/)
  const mixed = pair(); mixed[1] = pair({ revision: 'r20-core' })[1]
  assert.throws(() => assertPythonManifests(...mixed, '8.3.0', keys), /paired/)
})
test('packaged manifest requires exact source bytes', () => {
  assert.match(assertPythonManifestBytes(Buffer.from('{}'), Buffer.from('{}'), 'science'), /^[a-f0-9]{64}$/)
  assert.throws(() => assertPythonManifestBytes(Buffer.from('{}'), Buffer.from('{ }'), 'science'), /SHA-256/)
})
test('repository manifests verify with stable trusted keys and insertion order', async () => {
  const load = async name => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'))
  assertPythonManifests(await load('../../resources/extensions/python/dependency-manifest.json'), await load('../../resources/extensions/python/core-dependency-manifest.json'), '8.3.0', await load('../../config/catalogs/trusted-keys.json'))
})
