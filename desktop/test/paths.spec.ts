import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findDesktopWorkspaceRoot, resolveDesktopIconPath, resolveDesktopResourcePath } from '../src/main/paths.js'

const workspaceRoot = join(import.meta.dirname, '..', '..')

describe('desktop resource paths', () => {
  it('finds the workspace when Electron starts from the compiled main bundle', () => {
    expect(findDesktopWorkspaceRoot(join(workspaceRoot, 'desktop', 'out', 'main'))).toBe(workspaceRoot)
  })

  it('resolves development resources from desktop/build', () => {
    expect(resolveDesktopResourcePath({
      appPath: join(workspaceRoot, 'desktop', 'out', 'main'),
      isPackaged: false,
      name: 'splash.html',
      resourcesPath: 'unused',
    })).toBe(join(workspaceRoot, 'desktop', 'build', 'splash.html'))
  })

  it('uses Electron resources in packaged builds', () => {
    expect(resolveDesktopResourcePath({
      appPath: 'unused',
      isPackaged: true,
      name: 'splash.html',
      resourcesPath: join('C:', 'ZeroWall', 'resources'),
    })).toBe(join('C:', 'ZeroWall', 'resources', 'splash.html'))
  })

  it('loads the ZeroWall icon from the workspace in development and resources when packaged', () => {
    const appPath = join(workspaceRoot, 'desktop', 'out', 'main')
    expect(resolveDesktopIconPath({ appPath, isPackaged: false, resourcesPath: 'unused' }))
      .toBe(join(workspaceRoot, 'resources', 'brand', 'app-icons', 'icon.png'))
    expect(resolveDesktopIconPath({ appPath, isPackaged: true, resourcesPath: join('C:', 'ZeroWall', 'resources') }))
      .toBe(join('C:', 'ZeroWall', 'resources', 'icon.png'))
  })
})
