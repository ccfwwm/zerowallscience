import { createHash, sign, verify } from 'node:crypto'

export const ENVIRONMENT_CONFIG_SCHEMA = 1

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}

export function signingBytes(document) {
  const { signature: _signature, ...payload } = document
  return Buffer.from(JSON.stringify(canonical(payload)))
}

export function signEnvironmentConfig(document, privateKey, keyId) {
  return { ...document, signature: { algorithm: 'ed25519', keyId, value: sign(null, signingBytes(document), privateKey).toString('base64') } }
}

export function verifyEnvironmentDocument(document, publicKeys) {
  const signature = document?.signature
  const key = publicKeys?.[signature?.keyId]
  if (!key || signature?.algorithm !== 'ed25519' || !verify(null, signingBytes(document), key, Buffer.from(signature.value ?? '', 'base64'))) throw new Error('Environment configuration signature is invalid')
  validateEnvironmentDocument(document)
  return document
}

export function validateEnvironmentDocument(document) {
  if (document?.schema !== ENVIRONMENT_CONFIG_SCHEMA || document?.kind !== 'environment-defaults' || typeof document?.version !== 'string' || !/^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/u.test(document.version)) throw new Error('Environment configuration document is invalid')
  if (document.variables === null || typeof document.variables !== 'object' || Array.isArray(document.variables)) throw new Error('Environment configuration variables are invalid')
  for (const [name, value] of Object.entries(document.variables)) {
    if (!/^[A-Z_][A-Z0-9_]{0,127}$/u.test(name) || name === 'NODE_OPTIONS' || name === 'ELECTRON_RUN_AS_NODE' || name === 'PATH' || name === 'PATHEXT' || name === 'COMSPEC' || name === 'DSH_HOME' || name === 'ZEROWALL_USER_DATA_DIR' || typeof value !== 'string' || value.length === 0 || value.length > 8192 || /[\r\n]/u.test(value)) throw new Error(`Environment configuration variable is invalid: ${name}`)
  }
  return document
}

export function digestBytes(bytes) { return createHash('sha256').update(bytes).digest('hex') }

export function parseEnvironmentInput(document) {
  if (!document || document.schema !== ENVIRONMENT_CONFIG_SCHEMA || document.kind !== 'environment-defaults' || typeof document.version !== 'string' || !document.variables || Array.isArray(document.variables)) throw new Error('Environment defaults file must use the environment-defaults format')
  const unsigned = { schema: ENVIRONMENT_CONFIG_SCHEMA, kind: 'environment-defaults', version: document.version, variables: Object.fromEntries(Object.entries(document.variables).sort(([a], [b]) => a.localeCompare(b))) }
  validateEnvironmentDocument(unsigned)
  return unsigned
}
