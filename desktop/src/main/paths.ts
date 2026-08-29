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
  return join(findDesktopWorkspaceRoot(options.appPath), 'resources', 'brand', 'app-icons', 'icon.png')
}
