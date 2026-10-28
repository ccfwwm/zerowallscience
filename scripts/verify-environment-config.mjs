import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { hydrateOfficialEnvironment } from '../desktop/src/main/environment-config.ts'
import { MCP_ENVIRONMENT_KEYRING } from '../desktop/src/main/mcp-environment.ts'
import { root } from '../tools/build/paths.mjs'

const source = process.env.ZEROWALL_ENVIRONMENT_CONFIG_FILE || resolve(root, 'scripts/env/environment-defaults.json')
const expected = Object.keys(JSON.parse(await readFile(source, 'utf8')).variables ?? {}).sort()
const priorEnvironment = new Map(expected.map(name => [name, process.env[name]]))
const vault = new Map()
const testVault = {
  get: async key => vault.get(key),
  set: async (key, value) => { vault.set(key, value) },
  delete: async key => { vault.delete(key) },
}

try {
  for (const name of expected) delete process.env[name]
  const result = await hydrateOfficialEnvironment(testVault, { publicKeys: MCP_ENVIRONMENT_KEYRING })
  const configured = expected.filter(name => Boolean(process.env[name]?.trim() && vault.get(`zerowall.environment.var.${name.toLowerCase()}`)?.trim()))
  const missing = expected.filter(name => !configured.includes(name))
  if (!result.usedRemote || result.error || missing.length) {
    throw new Error(`Qiniu environment verification failed: ${result.error ?? `missing ${missing.join(', ') || 'remote document'}`}`)
  }
  console.log(JSON.stringify({ ok: true, version: result.version, expectedVariables: expected.length, configuredVariables: configured.length, names: configured, signatureVerified: true, valuesPrinted: false }, null, 2))
} finally {
  for (const [name, value] of priorEnvironment) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
}
