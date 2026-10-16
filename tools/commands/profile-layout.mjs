import { lstat, readFile, readdir, readlink, rename, symlink, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'

const inside = (root, path) => { const child = relative(root, path); return child === '' || (child !== '..' && !child.startsWith('..' + sep) && !isAbsolute(child)) }
const optional = (path) => readFile(path, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error })

/** pnpm 11 writes absolute virtual-store paths on Windows. Profile transactions
 * move a complete tree, so both its metadata and internal links must move with it.
 * Never traverse an external junction or edit the signed offline generation. */
export async function repairProfileLayout(directory, { from, home } = {}) {
  directory = resolve(directory)
  const modules = join(directory, 'node_modules')
  const file = join(modules, '.modules.yaml')
  const text = await optional(file)
  // The bundled pnpm 11 manifest is JSON despite its historical .yaml name.
  // Unknown/older layouts go through pnpm's official reinstall, never guessed edits.
  let manifest
  if (text !== undefined) {
    try { manifest = JSON.parse(text) } catch { return { changed: false, links: 0, needsRelink: true } }
  }
  const virtual = manifest?.virtualStoreDir
  const expected = join(modules, '.pnpm')
  const recorded = typeof virtual === 'string' ? resolve(modules, virtual) : expected
  const recordedRoot = dirname(dirname(recorded))
  const profiles = resolve(home ?? join(directory, '../..'), 'profiles')
  const managedRecorded = inside(profiles, recordedRoot) && /^zerowall-[a-zA-Z0-9-]+$/u.test(relative(profiles, recordedRoot))
  const original = from ? resolve(from) : directory
  const roots = [...new Set([original, ...(managedRecorded ? [recordedRoot] : [])])].filter(root => root !== directory)
  if (recorded !== expected && (!manifest || !['hoisted', 'isolated'].includes(manifest.nodeLinker)
      || !roots.some(root => recorded === join(root, 'node_modules', '.pnpm')))) {
    return { changed: false, links: 0, needsRelink: true }
  }
  if (!from && recorded === expected) return { changed: false, links: 0 }
  const info = await lstat(modules).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (!info) return { changed: false, links: 0 }
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Profile node_modules must be a physical directory')
  if (recorded !== expected) {
    const store = await lstat(expected).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (!store?.isDirectory() || store.isSymbolicLink()) return { changed: false, links: 0, needsRelink: true }
  }
  const repairs = []
  async function scan(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const link = join(path, entry.name)
      if (entry.isSymbolicLink()) {
        const target = await readlink(link)
        const previousLink = join(original, relative(directory, link))
        const previousTarget = resolve(dirname(previousLink), target)
        const root = roots.find(root => inside(root, previousTarget))
        const nextTarget = root ? join(directory, relative(root, previousTarget)) : previousTarget
        if (!isAbsolute(target) || resolve(dirname(link), target) !== nextTarget) repairs.push({ link, target, nextTarget, internal: !!root })
      } else if (entry.isDirectory()) await scan(link)
    }
  }
  await scan(modules)
  // Prove every relocated link resolves before changing any link. External
  // links retain their original target, including CLI and offline resources.
  for (const repair of repairs) if (repair.internal) await lstat(repair.nextTarget)
  const applied = []
  let metadataChanged = false
  try {
    for (const repair of repairs) {
      const targetInfo = await lstat(repair.nextTarget).catch(error => { if (error.code !== 'ENOENT') throw error })
      const type = process.platform === 'win32' && targetInfo?.isDirectory() ? 'junction' : undefined
      await unlink(repair.link)
      try { await symlink(repair.nextTarget, repair.link, type) }
      catch (error) { await symlink(repair.target, repair.link, type); throw error }
      applied.push({ ...repair, type })
    }
    // A relative value is supported by pnpm's reader on Windows too; the next
    // pnpm operation may write an absolute value, which activation checks again.
    if (manifest && manifest.virtualStoreDir !== '.pnpm') {
      manifest.virtualStoreDir = '.pnpm'
      const temporary = file + '.' + randomUUID() + '.tmp'
      await writeFile(temporary, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
      await rename(temporary, file)
      metadataChanged = true
    }
  } catch (error) {
    for (const repair of applied.reverse()) { await unlink(repair.link); await symlink(repair.target, repair.link, repair.type) }
    throw error
  }
  return { changed: metadataChanged || repairs.length > 0, links: repairs.length }
}
