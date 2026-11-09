/** Build a preview-only catalog compatible with the ZeroWall resource consumer. */
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = resolve(fileURLToPath(new URL('../market/preview/', import.meta.url)))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value !== null && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const encode = document => Buffer.from(JSON.stringify(canonical(document)))

async function main() {
  const keyFile = process.env.ZEROWALL_RESOURCE_PRIVATE_KEY_FILE
  const keyId = process.env.ZEROWALL_RESOURCE_KEY_ID
  if (!keyFile || !keyId) throw new Error('Set the private-key file and trusted key ID; no development signing fallback is supported')
  const keys = JSON.parse(await readFile(join(directory, 'trusted-keys.json'), 'utf8'))
  const key = createPrivateKey(await readFile(keyFile))
  if (key.asymmetricKeyType !== 'ed25519' || !keys[keyId]
    || !createPublicKey(key).export({ type: 'spki', format: 'der' }).equals(createPublicKey(keys[keyId]).export({ type: 'spki', format: 'der' }))) {
    throw new Error('The signing key does not match the pinned trusted key')
  }
  const signed = payload => {
    const bytes = encode(payload)
    const value = sign(null, bytes, key)
    if (!verify(null, bytes, keys[keyId], value)) throw new Error('Signature self-check failed')
    return { ...payload, signature: { algorithm: 'ed25519', keyId, value: value.toString('base64') } }
  }
  const sources = JSON.parse(await readFile(join(directory, 'sources.json'), 'utf8'))
  if (sources.schema !== 1 || sources.plugins.length !== 2) throw new Error('Invalid preview sources')
  const resources = []
  for (const plugin of sources.plugins) {
    if (!/^[a-f0-9]{40}$/.test(plugin.archiveCommit) || !/^[a-f0-9]{40}$/.test(plugin.sourceCommit)
      || !plugin.id.startsWith('@zerowall/') || !/^ccfwwm\/[a-z0-9-]+$/.test(plugin.repository)
      || !/^[a-z0-9.-]+\.tgz$/.test(plugin.filename)) throw new Error('Invalid immutable plugin source')
    const downloadUrl = `https://raw.githubusercontent.com/${plugin.repository}/${plugin.archiveCommit}/releases/${plugin.version}/${plugin.filename}`
    let bytes
    if (process.env.ZEROWALL_PREVIEW_ARCHIVE_DIR) {
      bytes = await readFile(join(process.env.ZEROWALL_PREVIEW_ARCHIVE_DIR, plugin.filename))
    } else {
      const response = await fetch(downloadUrl, { redirect: 'error', signal: AbortSignal.timeout(60000) })
      if (!response.ok) throw new Error(`Archive request failed: ${plugin.id} HTTP ${response.status}`)
      bytes = Buffer.from(await response.arrayBuffer())
    }
    if (bytes.length !== plugin.size || digest(bytes) !== plugin.sha256) throw new Error(`Archive integrity mismatch: ${plugin.id}`)
    resources.push(signed({ id: plugin.id, version: plugin.version, kind: 'plugin',
      applicationVersion: sources.desktopVersion, channel: 'preview',
      dshRange: { min: sources.dshVersion, max: sources.dshVersion },
      desktopRange: { min: sources.dshVersion, max: sources.desktopVersion },
      platform: ['win32'], architecture: ['x64'], downloadUrl,
      sha256: plugin.sha256, size: plugin.size, restartRequired: true,
      rollbackSupported: true, sourceCommit: plugin.sourceCommit,
    }))
  }
  const catalog = signed({ schema: 1, kind: 'plugin', channel: 'preview', applicationVersion: sources.desktopVersion,
    localOnly: false, generatedAt: new Date().toISOString(), resources })
  const bytes = Buffer.from(JSON.stringify(catalog, null, 2) + '\n')
  const generation = digest(bytes)
  const path = join(directory, 'catalogs/plugin', generation)
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'catalog.json'), bytes, { flag: 'wx' })
  const pointer = signed({ schema: 1, kind: 'pointer', resourceKind: 'plugin', channel: 'preview', localOnly: false,
    catalog: { downloadUrl: `https://raw.githubusercontent.com/ccfwwm/zerowallscience-newui/main/market/preview/catalogs/plugin/${generation}/catalog.json`,
      sha256: generation, size: bytes.length } })
  await writeFile(join(directory, 'plugin-latest.json'), JSON.stringify(pointer, null, 2) + '\n')
  console.log(JSON.stringify({ channel: 'preview', keyId, plugins: resources.length, catalog: generation, bytes: bytes.length }))
}

await main()
