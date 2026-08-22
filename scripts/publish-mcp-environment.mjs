import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const qiniu = require('qiniu')
const root = resolve(import.meta.dirname, '..')
const envText = await readFile(resolve(root, 'scripts', '.env.qiniu'), 'utf8')
const env = Object.fromEntries(envText.split(/\r?\n/u).map(line => /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/u.exec(line)).filter(Boolean).map(match => [match[1], match[2].replace(/^['"]|['"]$/gu, '')]))
for (const key of ['QINIU_ACCESS_KEY', 'QINIU_SECRET_KEY', 'QINIU_BUCKET', 'QINIU_REGION', 'QINIU_DOMAIN']) if (!env[key]) throw new Error(`Missing ${key} in scripts/.env.qiniu`)
const version = process.env.ZEROWALL_MCP_ENVIRONMENT_VERSION?.trim()
if (!version) throw new Error('ZEROWALL_MCP_ENVIRONMENT_VERSION is required.')
const dist = resolve(process.env.ZEROWALL_MCP_ENVIRONMENT_OUTPUT ?? resolve(root, 'desktop', 'dist', 'mcp-environment'))
const archive = `zerowall-mcp-windows-x64-${version}.zip`
const files = [[`stable/mcp-environments/windows-x64/${version}/${archive}`, archive, false], [`stable/mcp-environments/windows-x64/${version}/manifest.json`, `${version}.json`, false], ['stable/mcp-environments/windows-x64/latest.json', 'latest.json', true]]
const mac = new qiniu.auth.digest.Mac(env.QINIU_ACCESS_KEY, env.QINIU_SECRET_KEY)
const config = new qiniu.conf.Config(); config.zone = qiniu.zone[`Zone_${env.QINIU_REGION}`] ?? qiniu.zone.Zone_z2
const uploader = new qiniu.form_up.FormUploader(config)
function upload(key, file, overwrite) { return new Promise((resolvePromise, reject) => { const policy = new qiniu.rs.PutPolicy({ scope: `${env.QINIU_BUCKET}:${key}`, overwrite }); uploader.putFile(policy.uploadToken(mac), key, resolve(dist, file), new qiniu.form_up.PutExtra(), (error, body, info) => info?.statusCode === 200 ? resolvePromise(body) : reject(error ?? new Error(`Qiniu upload failed for ${key}: HTTP ${info?.statusCode}`))) }) }
for (const [key, file, overwrite] of files) { const info = await stat(resolve(dist, file)); await upload(key, file, overwrite); const bytes = await readFile(resolve(dist, file)); console.log(`${key}\t${info.size}\t${createHash('sha256').update(bytes).digest('hex')}`) }
