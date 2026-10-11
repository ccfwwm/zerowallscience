import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { materializeTree } from '../build/materialize-tree.mjs'
import { offlineFiles } from '../commands/offline-profile.mjs'
import { carrierName } from '../commands/offline-carrier.mjs'
import { fileDigest } from '../commands/resource-catalog.mjs'

export async function carrierPayload(path) {
  return [{ path: carrierName, size: (await stat(join(path, carrierName))).size, sha256: await fileDigest(join(path, carrierName)) },
    ...await offlineFiles(join(path, carrierName + '.unpacked'), carrierName + '.unpacked/')].sort((a, b) => a.path.localeCompare(b.path))
}

const includePayload = path => path === carrierName || path === carrierName + '.unpacked' || path.startsWith(carrierName + '.unpacked/')

export async function reuseOfflineCarrier({ cache, output, key, prepare }) {
  if (!/^[A-Za-z0-9_-]+$/u.test(key)) throw new Error('Invalid offline carrier cache key')
  const cached = join(cache, key)
  const prior = await readFile(join(cached, 'payload.json'), 'utf8').then(JSON.parse, () => undefined)
  const actual = prior && await carrierPayload(cached).catch(() => undefined)
  if (prior?.cacheKey === key && actual && JSON.stringify(actual) === JSON.stringify(prior.files)) {
    const materialization = await materializeTree({ source: cached, destination: output, sourceKey: key, include: includePayload, expectedFiles: actual })
    console.log(`CACHE HIT offline-carrier ${key}; verified archive and native output hashes`)
    return { cacheHit: true, files: actual, materialization }
  }
  await prepare()
  const files = await carrierPayload(output)
  const pending = cached + '.candidate-' + randomUUID()
  await mkdir(pending, { recursive: true })
  const materialization = await materializeTree({ source: output, destination: pending, sourceKey: key, mode: 'copy', include: includePayload, expectedFiles: files })
  await writeFile(join(pending, 'payload.json'), JSON.stringify({ cacheKey: key, files, materialization, createdAt: new Date().toISOString() }))
  if (await stat(cached).catch(() => undefined)) await rename(cached, cached + '.damaged-' + randomUUID())
  await rename(pending, cached)
  console.log(`BUILT offline-carrier ${key}; stable component content identity`)
  return { cacheHit: false, files, materialization }
}
