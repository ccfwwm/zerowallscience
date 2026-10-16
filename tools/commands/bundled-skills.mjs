import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { compareVersions } from './resource-catalog.mjs'

async function treeDigest(root) {
  const hash = createHash('sha256')
  async function visit(directory, prefix = '') {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = prefix + entry.name
      if (entry.isDirectory()) await visit(join(directory, entry.name), path + '/')
      else if (entry.isFile()) { hash.update(path + '\0'); hash.update(createHash('sha256').update(await readFile(join(directory, entry.name))).digest()) }
      else throw new Error('Skill upgrade requires regular files')
    }
  }
  await visit(root)
  return hash.digest('hex')
}

/** Retire only untouched old catalog copies that shadow a newer installed
 * bundle. User imports, edits and disabled selections keep their precedence.
 * The old copy remains in normal Skill rollback history; no network is used. */
export async function reconcileBundledCatalogSkills({ home, bundledRoot, versions, yaml }) {
  const enabled = join(home, 'zerowall-skills/enabled')
  const cache = join(home, 'resources/skills')
  const sources = await readdir(cache, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error })
  const entries = await readdir(enabled, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error })
  const updated = [], preserved = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9-]*$/u.test(entry.name) || !versions[entry.name]) continue
    const target = join(enabled, entry.name)
    const markdown = await readFile(join(target, 'SKILL.md'), 'utf8').catch(() => '')
    const frontmatter = /^---\s*\r?\n([\s\S]*?)\r?\n---/u.exec(markdown)
    let metadata
    try { metadata = frontmatter && yaml.parse(frontmatter[1])?.metadata?.zerowall } catch { continue }
    if (metadata?.source !== 'catalog' || typeof metadata.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/u.test(metadata.version)
      || compareVersions(versions[entry.name], metadata.version) <= 0) continue
    // A matching frontmatter marker alone never authorizes replacing user
    // content. Require a complete byte-identical saved catalog source.
    const current = await treeDigest(target).catch(() => undefined)
    if (!current) { preserved.push(entry.name); continue }
    let pristine = false
    for (const source of sources) {
      if (!source.isDirectory() || !/^[a-f0-9]{64}$/u.test(source.name)) continue
      const baseline = join(cache, source.name)
      if (await readFile(join(baseline, 'SKILL.md'), 'utf8').catch(() => '') !== markdown) continue
      if (await treeDigest(baseline).catch(() => undefined) === current) { pristine = true; break }
    }
    if (!pristine) { preserved.push(entry.name); continue }
    await readFile(join(bundledRoot, entry.name, 'SKILL.md'))
    if (await treeDigest(target) !== current) { preserved.push(entry.name); continue }
    const backup = join(dirname(enabled), 'history', entry.name, randomUUID())
    await mkdir(dirname(backup), { recursive: true })
    await rename(target, backup)
    updated.push({ id: entry.name, from: metadata.version, to: versions[entry.name], backup })
  }
  return { updated, preserved }
}
