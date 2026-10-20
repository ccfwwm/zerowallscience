import { createHash, verify, randomUUID } from 'node:crypto'
import { readFile, mkdir, writeFile, rename, copyFile, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

// Python manifests use insertion-order JSON, unlike the generic resource catalog.
export function verifyBootstrapManifest(manifestBytes, keys, pin) {
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  const { signature, ...unsigned } = manifest
  if (signature?.algorithm !== 'ed25519' || !keys[signature.keyId] || !verify(null, Buffer.from(JSON.stringify(unsigned)), keys[signature.keyId], Buffer.from(signature.value, 'base64'))) throw new Error('Bundled Python signature is not trusted')
  if (manifest.schema !== 2 || manifest.environmentId !== 'zerowall-python' || manifest.platform !== 'win32' || manifest.architecture !== 'x64' || manifest.python?.bootstrapOnly !== true || !manifest.python.modules?.includes('pip') || manifest.python.relativeExecutable !== 'Python/python.exe') throw new Error('Bundled Python must be a Windows x64 Python + pip bootstrap')
  if (manifest.environmentVersion !== pin.environmentVersion || manifest.python.version !== pin.pythonVersion || manifest.archiveSize !== pin.archiveSize || manifest.archiveSha256 !== pin.archiveSha256) throw new Error('Bundled Python differs from the immutable published bootstrap pin')
  return manifest
}
export function verifyBootstrap(manifestBytes, archiveBytes, keys, pin) {
  const manifest = verifyBootstrapManifest(manifestBytes, keys, pin)
  if (archiveBytes.length !== manifest.archiveSize || createHash('sha256').update(archiveBytes).digest('hex') !== manifest.archiveSha256) throw new Error('Bundled Python archive size or SHA-256 mismatch')
  return manifest
}

export async function verifyBundledPython(root, manifestPath, archivePath) {
  const [manifest, archive, keys, pin] = await Promise.all([
    readFile(manifestPath), readFile(archivePath),
    readFile(join(root, 'config/catalogs/trusted-keys.json'), 'utf8').then(JSON.parse),
    readFile(join(root, 'config/python/bundled-bootstrap.json'), 'utf8').then(JSON.parse),
  ])
  return verifyBootstrap(manifest, archive, keys, pin)
}

async function atomicBytes(path, bytes) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  try { await writeFile(temporary, bytes, { flag: 'wx' }); await rename(temporary, path) }
  finally { await rm(temporary, { force: true }).catch(() => {}) }
}

async function download(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
      if (!response.ok) {
        await response.body?.cancel()
        const error = new Error(`Bootstrap download failed: HTTP ${response.status}`)
        error.retryable = response.status === 408 || response.status === 429 || response.status >= 500
        throw error
      }
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      if (attempt >= 2 || error.retryable === false) throw error
      console.warn(`Bootstrap download interrupted; retry ${attempt + 1}/2`)
      await delay(1000 * (attempt + 1))
    }
  }
}

export async function prepareBundledPython(root, stage, cache) {
  const pin = JSON.parse(await readFile(join(root, 'config/python/bundled-bootstrap.json'), 'utf8'))
  const directory = join(cache, 'python-bootstrap', pin.environmentVersion)
  const manifestPath = join(directory, 'manifest.json'), archivePath = join(directory, 'bootstrap.zip')
  try { await verifyBundledPython(root, manifestPath, archivePath) }
  catch (error) {
    // Existing bytes are immutable: a corrupt cache must be investigated.
    if (error.code !== 'ENOENT') throw error
    const manifest = await download(pin.manifestUrl)
    const keys = JSON.parse(await readFile(join(root, 'config/catalogs/trusted-keys.json'), 'utf8'))
    const document = verifyBootstrapManifest(manifest, keys, pin)
    const url = new URL(document.archiveUrl)
    if (url.protocol !== 'https:' || url.origin !== new URL(pin.manifestUrl).origin) throw new Error('Unexpected bootstrap archive origin')
    const archive = await download(url)
    verifyBootstrap(manifest, archive, keys, pin)
    await atomicBytes(archivePath, archive); await atomicBytes(manifestPath, manifest)
  }
  const output = join(stage, `python-base-${pin.pythonVersion}`)
  await mkdir(output, { recursive: true })
  await copyFile(manifestPath, join(output, 'latest.json'))
  await copyFile(archivePath, join(output, `zerowall-python-windows-x64-${pin.pythonVersion}.zip`))
  return verifyBundledPython(root, join(output, 'latest.json'), join(output, `zerowall-python-windows-x64-${pin.pythonVersion}.zip`))
}
