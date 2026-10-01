import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, basename } from 'node:path'
import { releaseRoot } from '../build/paths.mjs'

export async function historicalPackage(id, version) {
  for (const applicationVersion of (await readdir(dirname(releaseRoot))).sort()) {
    if (applicationVersion === basename(releaseRoot)) continue
    let records
    try { records = JSON.parse(await readFile(join(dirname(releaseRoot), applicationVersion, 'plugin-packages.json'), 'utf8')) }
    catch (error) { if (error.code === 'ENOENT') continue; throw error }
    const previous = records.find(item => item.id === id && item.version === version)
    if (previous) return previous
  }
}
