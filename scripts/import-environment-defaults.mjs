import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = resolve(root, 'scripts/env/相关配置.txt')
const targetPath = resolve(root, 'scripts/env/environment-defaults.json')

const mappings = new Map([
  ['rdatalinux RMCP Key', { name: 'R_PLATFORM_MCP_AUTHORIZATION', prefix: 'Bearer ' }],
  ['MinerU Key', { name: 'MINERU_API_TOKEN', prefix: '' }],
  ['SCI Key', { name: 'ZEROWALL_SCIMASTER_API_KEY', prefix: '' }],
  ['化工社 Key', { name: 'HUAGONGSHE_MCP_AUTHORIZATION', prefix: 'Bearer ' }],
  ['NCBI Key', { name: 'NCBI_API_KEY', prefix: '' }],
])

const source = await readFile(sourcePath, 'utf8')
const variables = {}
let current
for (const rawLine of source.split(/\r?\n/u)) {
  const line = rawLine.trim()
  if (!line) continue
  const mapping = mappings.get(line)
  if (mapping) {
    current = mapping
    continue
  }
  if (!current) continue
  if (variables[current.name] !== undefined) throw new Error(`Duplicate value for ${current.name}`)
  variables[current.name] = `${current.prefix}${line}`
  current = undefined
}
if (current) throw new Error(`Missing value for ${current.name}`)
for (const { name } of mappings.values()) if (!variables[name]) throw new Error(`Missing value for ${name}`)

let version = process.env.ZEROWALL_ENVIRONMENT_CONFIG_VERSION
if (!version) {
  try {
    const existing = JSON.parse(await readFile(targetPath, 'utf8'))
    version = existing.version
  } catch { /* The target is created below when it does not exist yet. */ }
}
if (!version) {
  const now = new Date()
  version = `${now.getUTCFullYear()}.${String(now.getUTCMonth() + 1).padStart(2, '0')}.${String(now.getUTCDate()).padStart(2, '0')}.1`
}

const document = {
  schema: 1,
  kind: 'environment-defaults',
  version,
  variables: Object.fromEntries(Object.entries(variables).sort(([a], [b]) => a.localeCompare(b))),
}
await writeFile(targetPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
console.log(`Imported ${Object.keys(variables).length} environment variables into scripts/env/environment-defaults.json`)
