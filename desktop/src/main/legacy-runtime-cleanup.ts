import { lstat, readdir, realpath, rm } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

// Only disposable runtime/cache paths are owned here. In particular, never
// remove a legacy user-data root, credentials, sessions, settings or imports.
const DISPOSABLE_PATHS = [
  'Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache',
  'python', 'zerowall-python', 'mcp-environments', 'mcp-environment',
  'python-environment', 'python-environments',
  'harness/profiles/node_modules', 'harness/profiles/web/node_modules',
  'harness/resources/downloads', 'harness/resources/cleanup',
] as const
const CANDIDATE_NAME = /^zerowall-pnpm-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u

function samePath(left: string, right: string): boolean {
  const a = resolve(left), b = resolve(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function within(root: string, path: string): boolean {
  const child = relative(resolve(root), resolve(path))
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`))
}

async function physicalDirectory(path: string): Promise<boolean> {
  const info = await lstat(path).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  })
  return !!info && info.isDirectory() && !info.isSymbolicLink() && samePath(path, await realpath(path))
}

export interface LegacyRuntimeCleanupResult {
  state: 'skipped' | 'completed' | 'partial'
  removed: string[]
  skipped: string[]
  failed: Array<{ path: string; code: string }>
}

/** Best-effort background deletion; never copies or inventories legacy data. */
export async function cleanupLegacyRuntimeData(options: {
  ready: boolean
  explicitUserData: boolean
  appDataPath?: string
  userDataPath: string
  protectedRoots: readonly string[]
  channel: 'stable' | 'preview'
}, remove = (path: string) => rm(path, { recursive: true, force: true, maxRetries: 0 })): Promise<LegacyRuntimeCleanupResult> {
  const result: LegacyRuntimeCleanupResult = { state: 'skipped', removed: [], skipped: [], failed: [] }
  if (!options.ready || options.explicitUserData || !options.appDataPath) return result
  const parents = resolve(options.appDataPath)
  if (!await physicalDirectory(parents)) return result
  const protectedRoots = [options.userDataPath, ...options.protectedRoots].map(path => resolve(path))
  const names = options.channel === 'stable'
    ? ['zerowall-science', 'zerowall-science-3']
    : ['zerowall-science-preview', 'zerowall-science-3-preview']
  result.state = 'completed'
  for (const name of names) {
    const root = join(parents, name)
    try {
      if (protectedRoots.some(path => within(root, path) || within(path, root)) || !await physicalDirectory(root)) {
        result.skipped.push(name)
        continue
      }
      const paths: string[] = [...DISPOSABLE_PATHS]
      const profiles = join(root, 'harness/profiles')
      if (await physicalDirectory(profiles)) {
        // One shallow directory read finds owned candidates; their contents
        // are never scanned, hashed or copied before deletion.
        for (const entry of await readdir(profiles, { withFileTypes: true })) {
          if (entry.isDirectory() && !entry.isSymbolicLink() && CANDIDATE_NAME.test(entry.name)) paths.push(`harness/profiles/${entry.name}`)
        }
      }
      for (const path of paths) {
        const target = resolve(root, path)
        const label = `${name}/${path}`
        try {
          if (!within(root, target) || protectedRoots.some(protectedRoot => within(target, protectedRoot) || within(protectedRoot, target))) {
            result.skipped.push(label)
            continue
          }
          // Check each parent without following junctions out of this root.
          let parent = root
          let safe = true
          const segments = path.split('/')
          for (const segment of segments.slice(0, -1)) {
            parent = join(parent, segment)
            if (!await physicalDirectory(parent)) { safe = false; break }
          }
          if (!safe || !await physicalDirectory(target)) { result.skipped.push(label); continue }
          await remove(target)
          result.removed.push(label)
        } catch (error) {
          result.failed.push({ path: label, code: (error as NodeJS.ErrnoException).code ?? 'io' })
        }
      }
    } catch (error) {
      result.failed.push({ path: name, code: (error as NodeJS.ErrnoException).code ?? 'io' })
    }
  }
  if (result.failed.length) result.state = 'partial'
  return result
}
