import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { parse } from 'yaml'

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export async function dependencyLockFingerprint(root, importers, tools = [], lockText) {
  const lock = parse(lockText ?? await readFile(join(root, 'pnpm-lock.yaml'), 'utf8'))
  const selected = {}, seen = new Set()
  function visit(name, ref) {
    if (typeof ref !== 'string' || /^(?:link:|workspace:)/u.test(ref)) return
    const key = ref.startsWith(name + '@') ? ref : name + '@' + ref
    if (seen.has(key)) return
    seen.add(key)
    const snapshot = lock.snapshots?.[key]
    selected[key] = { snapshot, package: lock.packages?.[key.split('(')[0]] }
    for (const [dep, version] of Object.entries({ ...snapshot?.dependencies, ...snapshot?.optionalDependencies })) visit(dep, version)
  }
  for (const importer of importers) {
    const record = lock.importers?.[importer]
    if (!record) throw new Error('Missing lockfile importer: ' + importer)
    selected['importer:' + importer] = record
    for (const [name, entry] of Object.entries({ ...record.dependencies, ...record.devDependencies, ...record.optionalDependencies })) visit(name, entry.version)
  }
  const toolEntries = {}
  for (const name of tools) {
    const entry = lock.importers?.['.']?.devDependencies?.[name]
    if (!entry) throw new Error('Missing build tool lock: ' + name)
    toolEntries[name] = entry
    visit(name, entry.version)
  }
  selected.tools = toolEntries
  selected.settings = lock.settings
  return hash(Object.fromEntries(Object.entries(selected).sort(([a], [b]) => a.localeCompare(b))))
}

// Trace literal local imports and source-only exported helpers. External
// runtime services contribute their locked identity, not all their source.
export async function sharedSourceInputs(root, sourceRoot) {
  const inputs = new Set(), visited = new Set()
  async function fileAt(base) {
    for (const path of [base, base.replace(/\.js$/u, '.ts'), base.replace(/\.js$/u, '.tsx'), base + '.ts', base + '.tsx', base + '.mjs', base + '.css', join(base, 'index.ts')]) if ((await stat(path).catch(() => undefined))?.isFile()) return path
  }
  async function trace(path) {
    if (!path || visited.has(path)) return
    visited.add(path)
    const rel = relative(root, path).replaceAll('\\', '/')
    if (rel.startsWith('../')) throw new Error('Build import escapes repository')
    if (/(?:^|\/)(?:lib|dist|node_modules)\//u.test(rel)) return
    if (!path.startsWith(sourceRoot + '\\') && !path.startsWith(sourceRoot + '/')) inputs.add(rel)
    const source = await readFile(path, 'utf8')
    const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['"]([^'"]+)['"]/gu)].map(match => match[1])
    for (const specifier of imports) {
      if (specifier.startsWith('.')) await trace(await fileAt(resolve(dirname(path), specifier.split('?')[0])))
      else if (specifier === '@zerowallscience/plugin-base/client-helpers') await trace(join(root, 'plugins/base/src/shared/client-helpers.ts'))
      else if (/^@zerowallscience\/plugin-[^/]+\/(?:src\/|client\/)/u.test(specifier)) {
        const [, id, tail] = /^@zerowallscience\/plugin-([^/]+)\/(.*)$/u.exec(specifier)
        await trace(await fileAt(join(root, 'plugins', id, tail)))
      }
    }
  }
  // Adapters compile secondary exports and workers as well as host/client.
  // Inspect source entries so literal dynamic imports from those entries
  // also contribute their shared helpers to the component fingerprint.
  async function sourceEntries(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(error => {
      if (error.code === 'ENOENT') return []
      throw error
    })) {
      if (['node_modules', 'lib', 'dist', 'test', 'tests', '__tests__'].includes(entry.name)) continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await sourceEntries(path)
      else if (/\.[cm]?[jt]sx?$/u.test(entry.name) && !/\.(?:test|spec)\./u.test(entry.name)) await trace(path)
    }
  }
  await sourceEntries(join(sourceRoot, 'src'))
  for (const entry of ['tsdown.config.ts', 'tsdown.config.mjs', 'tsconfig.build.json']) await trace(await fileAt(join(sourceRoot, entry)))
  return [...inputs].sort()
}
