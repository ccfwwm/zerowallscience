import { join } from 'node:path'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { findDesktopWorkspaceRoot, resolveBundledSkillsPath, resolveDesktopIconPath, resolveDesktopResourcePath } from '../src/main/paths.js'

const workspaceRoot = join(import.meta.dirname, '..', '..')

describe('desktop resource paths', () => {
  it('prefers the canonical optional Skills root and reads a legacy root without migrating it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zws-resource-path-'))
    try {
      expect(resolveBundledSkillsPath(root)).toBe(join(root, 'extensions', 'skills'))
      await mkdir(join(root, 'skills'))
      expect(resolveBundledSkillsPath(root)).toBe(join(root, 'skills'))
      await mkdir(join(root, 'extensions', 'skills'), { recursive: true })
      expect(resolveBundledSkillsPath(root)).toBe(join(root, 'extensions', 'skills'))
    } finally { await rm(root, { recursive: true, force: true }) }
  })
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
      .toBe(join(workspaceRoot, 'resources', 'branding', 'app-icons', 'icon.png'))
    expect(resolveDesktopIconPath({ appPath, isPackaged: true, resourcesPath: join('C:', 'ZeroWall', 'resources') }))
      .toBe(join('C:', 'ZeroWall', 'resources', 'icon.png'))
  })
})
