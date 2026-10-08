import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { contract, root } from '../build/paths.mjs'
import { fileDigest, signCatalog, verifyCatalog } from './resource-catalog.mjs'
import { loadResourceSigner } from './resource-signing.mjs'

export async function buildResourceCatalogItem({ kind, id, version, payload, outputCatalog, applicationVersion, signing }) {
  if (!['skill', 'mcp', 'python'].includes(kind)) throw new Error(`Unsupported resource kind: ${kind}`)
  if (!/^[a-zA-Z0-9@/._-]{1,200}$/u.test(id) || id.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid resource id.')
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][a-zA-Z0-9.-]+)?$/u.test(version)) throw new Error('Invalid resource version.')
  const payloadPath = resolve(payload)
  const outputPath = resolve(outputCatalog)
  const info = await lstat(payloadPath)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Resource payload must be a regular file.')
  const keys = signing?.keys
  const keyId = signing?.keyId
  const privateKey = signing?.privateKey
  if (!keys?.[keyId] || !privateKey) throw new Error('A trusted resource signing key is required.')
  const localOnly = true
  const versionInfo = JSON.parse(await readFile(resolve(root, 'config/deepseek-harness/upstream.json'), 'utf8'))
  const entry = {
    id,
    version,
    kind,
    applicationVersion: applicationVersion ?? contract.version,
    dshRange: { min: versionInfo.version ?? '0.2.0-rc.2', max: versionInfo.version ?? '0.2.0-rc.2' },
    desktopRange: { min: '8.0.0' },
    platform: ['win32'],
    architecture: ['x64'],
    downloadUrl: pathToFileURL(payloadPath).href,
    sha256: await fileDigest(payloadPath),
    size: info.size,
    restartRequired: kind === 'mcp',
    rollbackSupported: true,
  }
  const document = signCatalog({ schema: 1, kind, applicationVersion: entry.applicationVersion, localOnly, generatedAt: new Date().toISOString(), resources: [entry] }, privateKey, keyId)
  verifyCatalog(document, keys, { local: true })
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, { flag: 'wx' })
  return { path: outputPath, sha256: createHash('sha256').update(JSON.stringify(document, null, 2) + '\n').digest('hex'), size: (await stat(outputPath)).size, document }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [kind, id, version, payload, outputCatalog] = process.argv.slice(2)
  if (!kind || !id || !version || !payload || !outputCatalog) throw new Error('Usage: build-resource-catalog-item.mjs <skill|mcp|python> <id> <version> <payload> <catalog-output>')
  const signing = await loadResourceSigner({ root, cacheRoot: contract.cache })
  const result = await buildResourceCatalogItem({ kind, id, version, payload, outputCatalog, signing })
  console.log(JSON.stringify({ kind, id, version, catalog: result.path, sha256: result.sha256, size: result.size, localOnly: result.document.localOnly }, null, 2))
}
