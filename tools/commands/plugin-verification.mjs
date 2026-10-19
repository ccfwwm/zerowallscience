import { readFileSync } from 'node:fs'
import { verifySignedDocument } from './resource-catalog.mjs'

// Copied from config/catalogs at build time. Standalone verification tools
// retain strict defaults unless their caller explicitly selects another mode.
let policy = { signature: 'strict', installedContent: 'strict' }
try {
  const configured = JSON.parse(readFileSync(new URL('./plugin-verification.json', import.meta.url), 'utf8'))
  if (configured.schema !== 1 || !['strict', 'warn'].includes(configured.signature) || !['strict', 'warn'].includes(configured.installedContent)) throw new Error('Invalid plugin verification policy')
  policy = configured
} catch (error) { if (error.code !== 'ENOENT') throw error }
export const pluginVerificationPolicy = Object.freeze(policy)
export const pluginVerificationMode = (target, kind) => (target?.pluginVerification ?? policy)[kind] ?? 'strict'
export function pluginVerificationIssue(target, kind, message) {
  if (pluginVerificationMode(target, kind) !== 'warn') throw new Error(message)
  console.warn('[PLUGIN_VERIFICATION_WARNING] ' + message)
}
export function verifyPluginDocument(document, keys, target) {
  return verifySignedDocument(document, keys, { mode: pluginVerificationMode(target, 'signature') })
}
