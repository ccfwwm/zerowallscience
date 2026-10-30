import { lstat, mkdir, readdir, readFile, readlink, rename, symlink, unlink, writeFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { bounded } from './profile-copy.mjs'

const exists = path => lstat(path).then(() => true, error => { if (error.code !== 'ENOENT') throw error; return false })
const inside = (root, path) => { const child = relative(root, path); return child === '' || !isAbsolute(child) && child !== '..' && !child.startsWith('..' + sep) }
export const packageCommitFiles = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'cordis.patch.yml', 'compatibility.json']
export const packageLocked = error => ['EPERM', 'EACCES', 'EBUSY', 'ENOTEMPTY'].includes(error?.code)
const validId = id => /^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/u.test(id) && !id.split('/').some(part => part === '.' || part === '..')
const brokenDependencyDirectoryLink = path => {
  const parts = path.split(sep)
  const modules = parts.lastIndexOf('node_modules')
  if (modules < 0) return false
  const entry = parts.slice(modules + 1)
  return entry.length === 1 && /^[A-Za-z0-9._-]+$/u.test(entry[0])
    || entry.length === 2 && /^@[A-Za-z0-9._-]+$/u.test(entry[0]) && /^[A-Za-z0-9._-]+$/u.test(entry[1])
}
const validHistoryPath = name => /^\.zerowall\/(?:retired|inactive)-plugin-history\/[A-Za-z0-9@%._-]+-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(name)
const validName = name => typeof name === 'string' && (packageCommitFiles.includes(name)
  || name === '.zerowall/materialized-profile.json'
  || name === 'node_modules/.zerowall-dependencies'
  || /^node_modules\/(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/u.test(name) && validId(name.slice(13))
  || /^\.zerowall\/(?:install-sources|dependency-history)\/[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name)
  || validHistoryPath(name)
  || /^\.zerowall\/dependency-generations\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(name)
  || /^\.zerowall\/plugin-imports\/[A-Za-z0-9@%._-]+\.json$/u.test(name))

export async function writePackageJournal(directory, state) {
  const temporary = join(directory, 'journal.tmp')
  await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 })
  await rename(temporary, join(directory, 'journal.json'))
}

// Only traverse physical directories owned by this publication. In particular
// never traverse a package Junction into another plugin or the running profile.
async function relocateTree(path, candidate, profile, links) {
  let level = [path]
  while (level.length) {
    const nextLevel = []
    await bounded(level, async path => {
      // Recheck directories before opening them. Dirents let ordinary files
      // bypass a serial lstat for every asset in the installed plugin closure.
      const info = await lstat(path)
      if (info.isSymbolicLink()) {
        const target = await readlink(path), absolute = resolve(dirname(path), target)
        const next = inside(candidate, absolute) ? join(profile, relative(candidate, absolute)) : absolute
        let directory
        try { directory = (await stat(path)).isDirectory() }
        catch (error) {
          if (error?.code !== 'ENOENT' || !brokenDependencyDirectoryLink(path)) throw error
          directory = true
        }
        const type = directory ? (process.platform === 'win32' ? 'junction' : 'dir') : 'file'
        links.push({ path, target, next, type })
      } else if (info.isDirectory()) {
        for (const entry of await readdir(path, { withFileTypes: true })) {
          if (entry.isDirectory() || entry.isSymbolicLink()) nextLevel.push(join(path, entry.name))
        }
      }
    })
    level = nextLevel
  }
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
export async function commitPackagePaths({ profile, candidate, directory, state, ids, files = packageCommitFiles, includeDependencyRoot = false, replaceInstallSources = [], historyPaths = [] }) {
  profile = resolve(profile); candidate = resolve(candidate)
  ids = [...new Set(ids)]
  if (ids.some(id => !validId(id))) throw new Error('Invalid package publication identity')
  const names = []
  for (const namespace of ['install-sources', 'dependency-history', 'dependency-generations']) {
    const source = join(candidate, '.zerowall', namespace)
    for (const name of await readdir(source).catch(error => { if (error.code !== 'ENOENT') throw error; return [] })) {
      if (!validName('.zerowall/' + namespace + '/' + name) || (await lstat(join(source, name))).isSymbolicLink()) throw new Error('Invalid package namespace')
      if (!await exists(join(profile, '.zerowall', namespace, name))) names.push('.zerowall/' + namespace + '/' + name)
    }
  }
  const sourceNames = [...new Set(replaceInstallSources)]
  for (const name of sourceNames) {
    if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name)) throw new Error('Invalid package source publication path')
    const local = '.zerowall/install-sources/' + name
    // A removed legacy source is intentionally absent from the candidate. The
    // publication journal still includes it so the active path is moved to the
    // short-lived `before` tree and the stale link disappears atomically.
    if (!await exists(join(candidate, local)) && !await exists(join(profile, local))) throw new Error('Missing package source publication path: ' + local)
    if (!names.includes(local)) names.push(local)
  }
  for (const local of [...new Set(historyPaths)]) {
    if (!validHistoryPath(local) || !await exists(join(candidate, local))) throw new Error('Invalid package history publication path')
    if (!names.includes(local)) names.push(local)
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
  const links = [], historyNames = new Set([...new Set(historyPaths)])
  // Retired-plugin history is rollback evidence. Its links intentionally keep
  // the original target path even when the corresponding package is moved to
  // the transaction's before/ tree, so do not treat those links as active
  // dependency graph edges during relocation or post-commit validation.
  for (const name of names) if (!historyNames.has(name) && await exists(join(candidate, name))) await relocateTree(join(candidate, name), candidate, profile, links)
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
    let target
    try {
      await stat(published)
      target = resolve(dirname(published), await readlink(published))
    } catch (error) {
      if (error?.code !== 'ENOENT' || !brokenDependencyDirectoryLink(published)) throw error
      const info = await lstat(published)
      target = resolve(dirname(published), await readlink(published))
      if (!info.isSymbolicLink() || target !== resolve(link.next) || inside(candidate, target)) throw error
      continue
    }
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
