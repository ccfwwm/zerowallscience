import { createHash } from 'node:crypto'
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, relative, resolve } from 'node:path'
import { root, artifactRoot, applicationVersion, buildId, targetPackageRoot, stageRoot } from './paths.mjs'

const target = resolve(process.env.ZEROWALL_ARTIFACT_MANIFEST ?? targetPackageRoot)
await mkdir(target, { recursive: true })

const files = []
try {
  // Only top-level files are installer/package deliverables. In particular,
  // win-unpacked is an Electron Builder verification tree, not a release
  // payload, and can be several hundred MiB on its own.
  for (const entry of await readdir(target, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.toLowerCase() === 'builder-debug.yml') continue
    const path = join(target, entry.name)
    if (path === join(target, 'artifact-manifest.json')) continue
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(path)) hash.update(chunk)
    files.push({ path: relative(target, path).replaceAll('\\', '/'), size: (await stat(path)).size, sha256: hash.digest('hex') })
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' })
const changeCounts = { added: 0, modified: 0, deleted: 0, renamed: 0, untracked: 0, other: 0 }
for (const line of status.split(/\r?\n/u).filter(Boolean)) {
  const code = line.slice(0, 2)
  if (code === '??') changeCounts.untracked++
  else if (code.includes('A')) changeCounts.added++
  else if (code.includes('D')) changeCounts.deleted++
  else if (code.includes('R')) changeCounts.renamed++
  else if (code.includes('M')) changeCounts.modified++
  else changeCounts.other++
}

const dshContract = JSON.parse(await readFile(join(root, 'config/deepseek-harness/upstream.json'), 'utf8'))
const stageReceiptPath = join(stageRoot, 'desktop-package-receipt.json')
const stageReceipt = await readFile(stageReceiptPath).catch(error => {
  if (error?.code === 'ENOENT') return undefined
  throw error
})

const manifest = {
  schema: 2,
  applicationVersion,
  buildId,
  // Keep the base commit for existing consumers, while stating whether the
  // package was produced from a clean checkout. A dirty build must not look
  // like a reproducible build of HEAD alone.
  commit,
  source: { clean: status.length === 0, changeCounts },
  dshCommit: dshContract.commit,
  stageReceipt: stageReceipt ? {
    path: relative(artifactRoot, stageReceiptPath).replaceAll('\\', '/'),
    sha256: createHash('sha256').update(stageReceipt).digest('hex'),
  } : null,
  platform: process.platform,
  architecture: process.arch,
  target: relative(artifactRoot, target).replaceAll('\\', '/'),
  createdAt: new Date().toISOString(),
  files: files.sort((a, b) => a.path.localeCompare(b.path)),
}
await writeFile(join(target, 'artifact-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(manifest, null, 2))
