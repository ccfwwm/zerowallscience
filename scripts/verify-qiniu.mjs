import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const envText = await readFile(resolve(root, 'scripts', '.env.qiniu'), 'utf8')
const env = Object.fromEntries(envText.split(/\r?\n/u).map(line => /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/u.exec(line)).filter(Boolean).map(match => [match[1], match[2].replace(/^['"]|['"]$/gu, '')]))
const base = env.QINIU_DOMAIN.replace(/\/$/u, '')
const version = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version
const installer = `zerowall-science-${version}-win-x64.exe`
const keys = ['stable/latest.yml', `stable/releases/${version}/${installer}`, `stable/releases/${version}/${installer}.blockmap`, `stable/releases/${version}/zerowall-science-${version}-latest.json`, 'stable/releases/latest.json', 'stable/releases-zerowallsciencedev/latest.json']
for (const key of keys) { const response = await fetch(`${base}/${key}`, { cache: 'no-store' }); const body = Buffer.from(await response.arrayBuffer()); if (response.status !== 200 || body.length === 0) throw new Error(`${key}: HTTP ${response.status}, ${body.length} bytes`); if (key.endsWith('.json')) { const data = JSON.parse(body.toString('utf8')); if (data.version !== version) throw new Error(`${key}: version ${data.version}`) }; console.log(`${key}\tHTTP ${response.status}\t${body.length}\t${createHash('sha256').update(body).digest('hex')}`) }
console.log(`Public Stable ${version} metadata, installer, blockmap, and hashes verified.`)
