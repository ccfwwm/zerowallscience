import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

export function findDesktopWorkspaceRoot(startPath: string): string {
  let cursor = resolve(startPath)
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(cursor, 'deepseek-harness', 'apps', 'cli', 'lib', 'bin.js'))) return cursor
    cursor = resolve(cursor, '..')
  }
  return resolve(startPath)
}

export function resolveDesktopResourcePath(options: {
  appPath: string
  isPackaged: boolean
  name: string
  resourcesPath: string
}): string {
  if (options.isPackaged) return join(options.resourcesPath, options.name)
  return join(findDesktopWorkspaceRoot(options.appPath), 'desktop', 'build', options.name)
}

export function resolveDesktopIconPath(options: {
  appPath: string
  isPackaged: boolean
  resourcesPath: string
}): string {
  if (options.isPackaged) return join(options.resourcesPath, 'icon.png')
  return resolveWorkspaceResourcePath(findDesktopWorkspaceRoot(options.appPath), 'brand', 'app-icons', 'icon.png')
}

/** Resolve an authoring resource in development while accepting both the
 * 8.0.7 logical layout and the 8.0.6 source path. Packaged resources keep
 * their explicitly configured destinations and do not use this resolver. */
export function resolveWorkspaceResourcePath(workspaceRoot: string, logical: string, ...parts: string[]): string {
  const aliases: Record<string, string[]> = {
    skills: ['extensions', 'skills'],
    mcp: ['extensions', 'mcp'],
    python: ['extensions', 'python'],
    runtimes: ['extensions', 'runtimes'],
    r: ['extensions', 'engines', 'r'],
    biogenie: ['extensions', 'capabilities', 'biogenie'],
    'research-cases': ['cases', 'research'],
    brand: ['branding'],
  }
  const preferred = join(workspaceRoot, 'resources', ...(aliases[logical] ?? [logical]), ...parts)
  if (existsSync(preferred)) return preferred
  return join(workspaceRoot, 'resources', logical, ...parts)
}

/** Optional packaged Skills use the canonical layout; accept the 8.0.6 root
 * read-only when inspecting or running an older installed resource set. */
export function resolveBundledSkillsPath(resourcesPath: string): string {
  const canonical = join(resourcesPath, 'extensions', 'skills')
  const legacy = join(resourcesPath, 'skills')
  return existsSync(canonical) || !existsSync(legacy) ? canonical : legacy
}
