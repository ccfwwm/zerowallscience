import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { verifyBootstrap } from './bundled-python.mjs'

test('bundled bootstrap requires trusted original bytes, bootstrap identity, immutable pin and archive hash', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const archive = Buffer.from('fixture bootstrap')
  const pin = { environmentVersion: '1.5.2', pythonVersion: '3.12.10', archiveSize: archive.length, archiveSha256: createHash('sha256').update(archive).digest('hex') }
  const unsigned = { schema: 2, environmentId: 'zerowall-python', platform: 'win32', architecture: 'x64', environmentVersion: pin.environmentVersion, archiveSize: pin.archiveSize, archiveSha256: pin.archiveSha256, python: { version: pin.pythonVersion, bootstrapOnly: true, modules: ['pip'], relativeExecutable: 'Python/python.exe' } }
  const signed = value => Buffer.from(JSON.stringify({ ...value, signature: { algorithm: 'ed25519', keyId: 'test', value: sign(null, Buffer.from(JSON.stringify(value)), privateKey).toString('base64') } }))
  const keys = { test: publicKey }
  assert.equal(verifyBootstrap(signed(unsigned), archive, keys, pin).environmentVersion, '1.5.2')
  assert.throws(() => verifyBootstrap(signed(unsigned), archive, {}, pin), /signature/)
  assert.throws(() => verifyBootstrap(signed(unsigned), Buffer.from('fixture corrupt!!'), keys, pin), /size or SHA-256/)
  assert.throws(() => verifyBootstrap(signed({ ...unsigned, python: { ...unsigned.python, bootstrapOnly: false } }), archive, keys, pin), /bootstrap/)
  assert.throws(() => verifyBootstrap(signed({ ...unsigned, environmentVersion: '1.5.3' }), archive, keys, pin), /immutable/)
})
