import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { parseEnvironmentInput, signEnvironmentConfig, verifyEnvironmentDocument } from './environment-config.mjs'

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const keys = { test: publicKey.export({ type: 'spki', format: 'pem' }) }

test('validates and signs editable environment defaults', () => {
  const input = parseEnvironmentInput({ schema: 1, kind: 'environment-defaults', version: '2026.10.28.1', variables: { ZETA: 'last', ALPHA: 'first' } })
  assert.deepEqual(Object.keys(input.variables), ['ALPHA', 'ZETA'])
  const signed = signEnvironmentConfig(input, privateKey, 'test')
  assert.equal(verifyEnvironmentDocument(signed, keys).version, input.version)
  assert.throws(() => verifyEnvironmentDocument({ ...signed, variables: { ...signed.variables, ALPHA: 'tampered' } }, keys), /signature/u)
})

test('rejects invalid variable names, reserved names, and multiline values', () => {
  for (const variables of [
    { 'bad-name': 'value' },
    { NODE_OPTIONS: '--require evil' },
    { SAFE: 'first\nsecond' },
    { SAFE: '' },
  ]) assert.throws(() => parseEnvironmentInput({ schema: 1, kind: 'environment-defaults', version: '2026.10.28.1', variables }))
})
