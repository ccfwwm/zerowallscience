import { mkdir, writeFile, rename } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import paths from './paths.cjs'
import { artifactRoot, buildId, cacheRoot, logRoot, packageRoot, releaseRoot, stageRoot, verificationRoot } from './paths.mjs'

const directories = [artifactRoot, cacheRoot, logRoot, packageRoot, releaseRoot, stageRoot, verificationRoot]
await Promise.all(directories.map(path => mkdir(path, { recursive: true })))
if (process.argv.includes('--new')) {
  const current = paths.buildPaths()
  const next = { buildId: `${Date.now()}-${randomUUID().slice(0, 8)}`, applicationVersion: current.version }
  const temporary = `${current.active}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(next))
  await rename(temporary, current.active)
  await mkdir(join(artifactRoot, 'stage', current.version, next.buildId), { recursive: true })
}
console.log('Artifact contract:', paths.buildPaths())
