import { physicalFs } from './physical-fs.mjs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { RETIRED_PLUGIN_IDS } from './retired-plugins.mjs'
const { copyFile, stat, mkdir, readdir, readlink, symlink } = physicalFs.promises

function retiredPackagePath(local) {
  const parts = local.split('/')
  for (let index = 0; index < parts.length - 1; index++) {
    if (parts[index] !== 'node_modules') continue
    // Signed carrier contents are immutable. Filter their active package
    // links, never rewrite bytes covered by a receipt.
    if (parts[index + 1] === '.zerowall-carriers') return false
    const name = parts[index + 1].startsWith('@') ? parts.slice(index + 1, index + 3).join('/') : parts[index + 1]
    if (RETIRED_PLUGIN_IDS.has(name)) return true
    if (name === '.pnpm' && [...RETIRED_PLUGIN_IDS].some(id => parts[index + 2]?.startsWith(id.replace('/', '+') + '@'))) return true
  }
  return false
}

function previousPackageShadow(local, entry) {
  // Historical upgrades renamed only top-level package directories/junctions
  // to <package>.previous-<UUID>. Asset names and signed carriers are unrelated.
  return (entry.isDirectory() || entry.isSymbolicLink())
    && /^node_modules\/(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+\.previous-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(local)
}

export async function bounded(entries, task, concurrency = 16) {
  let next = 0
  const results = await Promise.allSettled(Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
    while (next < entries.length) { const index = next++; await task(entries[index], index) }
  }))
  const failure = results.find(result => result.status === 'rejected')
  if (failure) throw failure.reason
}

/** Copy independent bytes, never hardlink mutable profiles or follow junctions.
 * Previous package shadows remain in the old profile's rollback history. */
export async function copyProfileTree(source, destination, { filter = () => true } = {}) {
  source = resolve(source); destination = resolve(destination)
  const child = relative(source, destination)
  if (!child || !isAbsolute(child) && child !== '..' && !child.startsWith('..' + sep)) throw new Error('Profile copy destination must be outside source')
  const copyingModules = basename(source) === 'node_modules'
  const files = [], links = [], directories = ['']
  let level = ['']
  while (level.length) {
    const next = []
    await bounded(level, async local => {
      for (const entry of await readdir(join(source, local), { withFileTypes: true })) {
        const name = join(local, entry.name), normalized = name.replaceAll('\\', '/')
        const packagePath = copyingModules ? 'node_modules/' + normalized : normalized
        if (packagePath.startsWith('node_modules/') && (previousPackageShadow(packagePath, entry)
          || retiredPackagePath(packagePath))) continue
        if (!filter(normalized, entry)) continue
        if (entry.isSymbolicLink()) links.push(name)
        else if (entry.isDirectory()) { directories.push(name); next.push(name) }
        else if (entry.isFile()) files.push(name)
        else throw new Error('Profile contains an unsupported file')
      }
    })
    level = next
  }
  await mkdir(destination, { recursive: true })
  await bounded(directories, local => mkdir(join(destination, local), { recursive: true }))
  await bounded(files, local => copyFile(join(source, local), join(destination, local)))
  await bounded(links, async local => {
    const target = await readlink(join(source, local))
    // Preserve broken directory links without following them. An authenticated
    // repair can replace their package roots in the candidate; an ordinary
    // transaction still rejects them during strict layout verification.
    const info = await stat(join(source, local)).catch(error => { if (!['ENOENT', 'ELOOP'].includes(error.code)) throw error })
    await symlink(resolve(dirname(join(source, local)), target), join(destination, local), process.platform === 'win32' && (!info || info.isDirectory()) ? 'junction' : undefined)
  })
  return { files: files.length, links: links.length }
}
