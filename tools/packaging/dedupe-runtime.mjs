import { cp, mkdir, rm } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

// All graph paths are normalized absolute paths. Prefix membership avoids
// repeatedly running Windows path.relative during every candidate proof.
const within = (root, path) => path.startsWith(root.endsWith(sep) ? root : root + sep)
const under = (root, path) => root === path || within(root, path)
const lookupCache = new Map()
const contextCache = new WeakMap()

function lookupDirectories(packageRoot, outputRoot) {
  const key = outputRoot + '\0' + packageRoot
  if (lookupCache.has(key)) return lookupCache.get(key)
  const directories = []
  for (let cursor = packageRoot; under(dirname(outputRoot), cursor); cursor = dirname(cursor)) {
    if (basename(cursor) !== 'node_modules') directories.push(join(cursor, 'node_modules'))
    if (cursor === dirname(outputRoot)) break
  }
  lookupCache.set(key, directories)
  return directories
}

function dependencyContext(record, records, outputRoot) {
  // Each proposed graph is immutable after its replacement nodes are added.
  // Reuse the edge proof within that graph instead of resolving it once per
  // candidate, subtree and validation pass.
  if (!contextCache.has(records)) contextCache.set(records, new Map())
  const cached = contextCache.get(records)
  if (cached.has(record.path)) return cached.get(record.path)
  const names = [...new Set([...Object.keys(record.manifest.dependencies ?? {}),
    ...Object.keys(record.manifest.optionalDependencies ?? {}), ...Object.keys(record.manifest.peerDependencies ?? {})])].sort()
  const context = JSON.stringify(names.map(name => {
    const target = lookupDirectories(record.path, outputRoot).map(directory => records.get(join(directory, name))).find(Boolean)
    return [name, target?.sourceKey ?? null]
  }))
  cached.set(record.path, context)
  return context
}

/** Hoist only the same actual pnpm instance and resolution context. Every
 * declared dependency and peer edge is checked before committing a move. */
export async function dedupeRuntime(outputRoot, packageRecords) {
  outputRoot = resolve(outputRoot)
  let records = new Map(packageRecords.map(record => [resolve(record.path), { ...record, path: resolve(record.path) }]))
  let removed = 0, hoists = 0
  const originalContexts = new Map([...records].map(([path, record]) => [path, dependencyContext(record, records, outputRoot)]))
  for (let round = 0; round < 4; round++) {
    const groups = new Map()
    for (const record of records.values()) {
      const key = record.sourceKey + '\0' + dependencyContext(record, records, outputRoot)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(record)
    }
    let progress = false
    for (const initial of groups.values()) {
      const available = initial.filter(record => records.has(record.path))
      if (available.length < 2) continue
      const name = available[0].manifest.name
      // A scoped package's scope directory is also a Node lookup ancestor.
      const common = [...new Set(available.flatMap(record => lookupDirectories(record.path, outputRoot)))].sort((a, b) => a.length - b.length)
      for (const directory of common) {
        const group = available.filter(record => records.has(record.path) && lookupDirectories(record.path, outputRoot).includes(directory))
        if (group.length < 2) continue
        const target = join(directory, name)
        if (!within(outputRoot, target) || records.has(target) && !group.some(record => record.path === target)) continue
        if (group.some(record => record.path !== target && under(record.path, target))) continue
        const primary = group.find(record => record.path === target) ?? group[0]
        const moved = [...records.values()].filter(record => under(primary.path, record.path))
        const proposed = new Map([...records].filter(([path]) => !group.some(record => under(record.path, path))))
        const replacements = moved.map(record => ({ ...record, path: join(target, relative(primary.path, record.path)) }))
        if (replacements.some(record => proposed.has(record.path))) continue
        for (const record of replacements) proposed.set(record.path, record)
        let valid = true
        for (const record of proposed.values()) {
          const prior = replacements.includes(record) ? moved[replacements.indexOf(record)] : records.get(record.path)
          if (!prior || dependencyContext(record, proposed, outputRoot) !== dependencyContext(prior, records, outputRoot)) { valid = false; break }
        }
        // Each removed instance must have the same recursive subtree context
        // as its retained counterpart, including private dependency versions.
        for (const instance of group) {
          for (const record of records.values()) if (under(instance.path, record.path)) {
            const replacement = proposed.get(join(target, relative(instance.path, record.path)))
            if (!replacement || replacement.sourceKey !== record.sourceKey || dependencyContext(replacement, proposed, outputRoot) !== dependencyContext(record, records, outputRoot)) valid = false
          }
        }
        if (!valid) continue
        if (primary.path !== target) {
          await mkdir(dirname(target), { recursive: true })
          await cp(primary.path, target, { recursive: true })
        }
        for (const record of group) if (record.path !== target) {
          if (!within(outputRoot, record.path)) throw new Error('Refusing runtime dedupe outside generated closure')
          await rm(record.path, { recursive: true })
        }
        removed += records.size - proposed.size
        records = proposed
        hoists++
        progress = true
        break
      }
    }
    if (!progress) break
  }
  // Kept package locations retain exactly the original edge identities.
  for (const [path, context] of originalContexts) if (records.has(path) && dependencyContext(records.get(path), records, outputRoot) !== context) throw new Error('Runtime dependency resolution changed during dedupe: ' + path)
  return { before: packageRecords.length, after: records.size, removed, hoists }
}
