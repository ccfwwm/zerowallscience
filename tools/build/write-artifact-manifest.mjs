import { createHash } from 'node:crypto'
import { readdir, stat, writeFile, mkdir } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, relative, resolve } from 'node:path'
import { root, artifactRoot, applicationVersion, buildId, targetPackageRoot } from './paths.mjs'

const target = resolve(process.env.ZEROWALL_ARTIFACT_MANIFEST ?? targetPackageRoot)
await mkdir(target, { recursive: true })

async function filesUnder(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await filesUnder(path))
    else if (entry.isFile()) result.push(path)
  }
  return result
}

const files = []
try {
  for (const path of await filesUnder(target)) {
    if (path === join(target, 'artifact-manifest.json')) continue
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(path)) hash.update(chunk)
    files.push({ path: relative(target, path).replaceAll('\\', '/'), size: (await stat(path)).size, sha256: hash.digest('hex') })
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

const manifest = {
  schema: 1,
  applicationVersion,
  buildId,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  platform: process.platform,
  architecture: process.arch,
  target: relative(artifactRoot, target).replaceAll('\\', '/'),
  createdAt: new Date().toISOString(),
  files: files.sort((a, b) => a.path.localeCompare(b.path)),
}
await writeFile(join(target, 'artifact-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(manifest, null, 2))
