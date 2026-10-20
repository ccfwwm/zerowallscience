import { lstat, mkdir, readdir, readFile, readlink, rename, symlink, unlink, writeFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const exists = path => lstat(path).then(() => true, error => { if (error.code !== 'ENOENT') throw error; return false })
const inside = (root, path) => { const child = relative(root, path); return child === '' || !isAbsolute(child) && child !== '..' && !child.startsWith('..' + sep) }
export const packageCommitFiles = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'cordis.patch.yml', 'compatibility.json']
export const packageLocked = error => ['EPERM', 'EACCES', 'EBUSY', 'ENOTEMPTY'].includes(error?.code)
const validId = id => /^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/u.test(id) && !id.split('/').some(part => part === '.' || part === '..')
const validName = name => typeof name === 'string' && (packageCommitFiles.includes(name)
  || name === '.zerowall/materialized-profile.json'
  || name === 'node_modules/.zerowall-dependencies'
  || /^node_modules\/(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/u.test(name) && validId(name.slice(13))
  || /^\.zerowall\/(?:install-sources|dependency-history)\/[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name)
  || /^\.zerowall\/plugin-imports\/[A-Za-z0-9@%._-]+\.json$/u.test(name))

export async function writePackageJournal(directory, state) {
  const temporary = join(directory, 'journal.tmp')
  await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 })
  await rename(temporary, join(directory, 'journal.json'))
}

// Only traverse physical directories owned by this publication. In particular
// never traverse a package Junction into another plugin or the running profile.
async function relocateTree(path, candidate, profile, links) {
  const info = await lstat(path)
  if (info.isSymbolicLink()) {
    const target = await readlink(path), absolute = resolve(dirname(path), target)
    const next = inside(candidate, absolute) ? join(profile, relative(candidate, absolute)) : absolute
    const type = (await stat(path)).isDirectory() ? (process.platform === 'win32' ? 'junction' : 'dir') : 'file'
    links.push({ path, target, next, type })
    return
  }
  if (info.isDirectory()) for (const entry of await readdir(path)) await relocateTree(join(path, entry), candidate, profile, links)
}

async function physicalParents(profile, name) {
  let cursor = dirname(join(profile, name))
  const parents = []
  while (cursor !== profile) {
    if (!inside(profile, cursor)) throw new Error('Invalid package publication path')
    parents.unshift(cursor); cursor = dirname(cursor)
  }
  for (const path of [profile, ...parents]) {
    await mkdir(path).catch(error => { if (error.code !== 'EEXIST') throw error })
    const info = await lstat(path)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Package publication parent must be physical: ' + path)
  }
}

/** The active modules directory, scopes and retained plugin roots never move.
 * New closures have unique stable namespaces; rollback touches only this list. */
export async function commitPackagePaths({ profile, candidate, directory, state, ids, files = packageCommitFiles, includeDependencyRoot = false }) {
  profile = resolve(profile); candidate = resolve(candidate)
  ids = [...new Set(ids)]
  if (ids.some(id => !validId(id))) throw new Error('Invalid package publication identity')
  const names = []
  for (const namespace of ['install-sources', 'dependency-history']) {
    const source = join(candidate, '.zerowall', namespace)
    for (const name of await readdir(source).catch(error => { if (error.code !== 'ENOENT') throw error; return [] })) {
      if (!validName('.zerowall/' + namespace + '/' + name) || (await lstat(join(source, name))).isSymbolicLink()) throw new Error('Invalid package namespace')
      if (!await exists(join(profile, '.zerowall', namespace, name))) names.push('.zerowall/' + namespace + '/' + name)
    }
  }
  names.push(...ids.map(id => 'node_modules/' + id))
  for (const id of ids) {
    const name = '.zerowall/plugin-imports/' + encodeURIComponent(id) + '.json'
    if (await exists(join(candidate, name)) || await exists(join(profile, name))) names.push(name)
  }
  const fixedFiles = [...(includeDependencyRoot ? ['node_modules/.zerowall-dependencies'] : []), '.zerowall/materialized-profile.json', ...files]
  for (const name of fixedFiles) {
    if (!packageCommitFiles.includes(name) && name !== '.zerowall/materialized-profile.json' && name !== 'node_modules/.zerowall-dependencies') throw new Error('Invalid package publication file')
    if (await exists(join(candidate, name)) || await exists(join(profile, name))) names.push(name)
  }
  const links = []
  for (const name of names) if (await exists(join(candidate, name))) await relocateTree(join(candidate, name), candidate, profile, links)
  // All source targets were proved before rewriting any links. The rewritten
  // links become valid together when their physical roots are published.
  for (const link of links) {
    await unlink(link.path)
    await symlink(link.next, link.path, link.type)
  }
  state.schema = 2
  if (names.some(name => !validName(name))) throw new Error('Invalid package publication path')
  state.items = await Promise.all(names.map(async name => ({ name, existed: await exists(join(profile, name)) })))
  state.state = 'committing'
  await writePackageJournal(directory, state)
  for (const item of state.items) {
    await physicalParents(profile, item.name)
    const previous = join(directory, 'before', item.name)
    await physicalParents(directory, 'before/' + item.name)
    try {
      if (item.existed) await rename(join(profile, item.name), previous)
      if (await exists(join(candidate, item.name))) await rename(join(candidate, item.name), join(profile, item.name))
    } catch (error) {
      if (packageLocked(error)) { error.code = 'PLUGIN_TARGET_LOCKED'; error.packagePath = item.name; error.message = 'PLUGIN_TARGET_LOCKED: ' + item.name + '; ' + error.message }
      throw error
    }
  }
  // Check the newly published graph only. An unrelated damaged plugin has its
  // own diagnosis; it cannot veto installing or removing another plugin.
  for (const link of links) {
    const published = join(profile, relative(candidate, link.path))
    await stat(published)
    const target = resolve(dirname(published), await readlink(published))
    if (inside(candidate, target)) throw new Error('PLUGIN_EPHEMERAL_DEPENDENCY_TARGET')
  }
}

export async function restorePackagePaths(profile, directory, state) {
  profile = resolve(profile); directory = resolve(directory)
  if (!Array.isArray(state.items) || state.items.some(item => !validName(item.name) || typeof item.existed !== 'boolean') || new Set(state.items.map(item => item.name)).size !== state.items.length) throw new Error('Invalid package rollback journal')
  for (const item of [...state.items].reverse()) {
    const previous = join(directory, 'before', item.name), current = join(profile, item.name), failed = join(directory, 'failed', item.name)
    if (!inside(profile, current) || current === resolve(profile)) throw new Error('Invalid package rollback path')
    if (await exists(previous)) {
      await physicalParents(directory, 'failed/' + item.name)
      await physicalParents(directory, 'before/' + item.name)
      await physicalParents(profile, item.name)
      if (await exists(current)) await rename(current, failed)
      await rename(previous, current)
    } else if (!item.existed && await exists(current)) {
      await physicalParents(profile, item.name)
      await physicalParents(directory, 'failed/' + item.name); await rename(current, failed)
    }
  }
  state.state = 'rolled-back'
  await writePackageJournal(directory, state)
}
