import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, basename } from 'node:path'
import { root, cacheRoot, releaseRoot } from '../build/paths.mjs'
import { publishedResources } from '../release/immutable-resource.mjs'
import { downloadResource } from '../release/resource-catalog.mjs'

/** Independent plugin releases can share the current desktop version. Their
 * verified public archives remain authoritative even without local history. */
export function publishedPackageHistory({ baseUrl, keys, cache, fetcher = fetch }) {
  let history
  const archives = new Map()
  return async (id, version) => {
    history ??= publishedResources({ baseUrl, kind: 'plugin', keys, cache, fetcher })
    const previous = (await history).get(id + '@' + version)
    if (!previous) return undefined
    const key = id + '@' + version
    if (!archives.has(key)) archives.set(key, downloadResource(previous.entry, cache, { fetcher }).then(path => ({
      id, version, path, size: previous.entry.size, sha256: previous.sha256, published: true,
    })))
    return archives.get(key)
  }
}

let publicHistory

export async function historicalPackage(id, version) {
  const baseUrl = process.env.ZEROWALL_RESOURCE_BASE_URL
  if (baseUrl) {
    publicHistory ??= readFile(join(root, 'config/catalogs/trusted-keys.json'), 'utf8').then(JSON.parse).then(keys =>
      publishedPackageHistory({ baseUrl, keys, cache: join(cacheRoot, 'published-plugin-history') }))
    const previous = await (await publicHistory)(id, version)
    if (previous) return previous
  }
  for (const historyRoot of [dirname(releaseRoot), process.env.ZEROWALL_PACKAGE_HISTORY_ROOT].filter(Boolean)) {
  let applicationVersions
  try {
    applicationVersions = (await readdir(historyRoot)).sort().reverse()
  } catch (error) {
    if (error.code === 'ENOENT') continue
    throw error
  }
  for (const applicationVersion of applicationVersions) {
    if (applicationVersion === basename(releaseRoot)) continue
    let records
    try { records = JSON.parse(await readFile(join(historyRoot, applicationVersion, 'plugin-packages.json'), 'utf8')) }
    catch (error) { if (error.code === 'ENOENT') continue; throw error }
    const previous = records.find(item => item.id === id && item.version === version)
    if (previous) return previous
  }
  }
}
