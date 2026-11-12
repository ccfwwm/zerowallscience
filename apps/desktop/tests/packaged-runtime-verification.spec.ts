import { describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { verifyWindowsUpdaterDependencies } from '../scripts/electron-builder-config.mjs'
import { resolveDesktopTargetBuildPaths } from '../scripts/desktop-build-paths.mjs'
import { desktopBuildVersionPrefix } from '../scripts/desktop-build-version.mjs'

const { verifyDesktopRuntime } = vi.hoisted(() => ({
  verifyDesktopRuntime: vi.fn<(root: string, expected: string) => Promise<void>>(async () => undefined),
}))
// The hook imports the built tree, which a clean checkout has not produced; this is the path it resolves.
vi.mock('/apps/desktop/lib/types/runtime-tree.js', () => ({ verifyDesktopRuntime }))
vi.mock('../scripts/windows-asar-unpack.mjs', async importOriginal => ({
  ...await importOriginal<typeof import('../scripts/windows-asar-unpack.mjs')>(),
  verifyWindowsAsarUnpack: async () => undefined,
}))

const ENVIRONMENT = {
  DSH_DESKTOP_APP_ID: 'com.example.installer',
  DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
  DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }),
  DSH_DESKTOP_TARGET_PLATFORM: 'win32',
  DSH_DESKTOP_TARGET_ARCH: 'x64',
  DSH_DESKTOP_UNSIGNED: '1',
  DOWNLOAD_TEST_ORIGIN: 'https://desktop-updates.example.com',
  DOWNLOAD_TEST_RELEASE_ID: '0123456789abcdef0123456789abcdef',
}

const VALID_UPDATER_ENTRIES = [
  '\\node_modules\\debug\\package.json',
  '\\node_modules\\debug\\src\\index.js',
  '\\node_modules\\ms\\package.json',
  '\\node_modules\\ms\\index.js',
]

async function withPackagedApp<T>(run: (context: object) => Promise<T>): Promise<T> {
  const { createRequire } = await import('node:module')
  const { mkdtemp, mkdir, rm, writeFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const require = createRequire(import.meta.url)
  const asarRequire = createRequire(require.resolve('electron-builder/package.json'))
  const asar = asarRequire('@electron/asar') as { createPackage(source: string, destination: string): Promise<void> }
  const root = await mkdtemp(join(tmpdir(), 'dsh-packaged-runtime-'))
  const source = join(root, 'source')
  const resources = join(root, 'resources')
  try {
    for (const relative of [
      'package.json',
      'node_modules/debug/package.json',
      'node_modules/debug/src/index.js',
      'node_modules/ms/package.json',
      'node_modules/ms/index.js',
    ]) {
      const file = join(source, relative)
      await mkdir(join(file, '..'), { recursive: true })
      await writeFile(file, relative.endsWith('package.json') ? '{"name":"fixture"}\n' : 'module.exports = {}\n')
    }
    await mkdir(resources, { recursive: true })
    await asar.createPackage(source, join(resources, 'app.asar'))
    return await run({ appOutDir: root, packager: { getResourcesDir: () => resources } })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

/**
 * Run the packaging hook that verifies the bundled runtime.
 * @returns The version that hook required the runtime to declare.
 */
async function requiredRuntimeVersion(preparedRuntime?: string, preparedRuntimeVersion?: string): Promise<unknown> {
  verifyDesktopRuntime.mockClear()
  const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
  const config = createElectronBuilderConfig(ENVIRONMENT, 'win32', 'x64', preparedRuntime, preparedRuntimeVersion)
  await withPackagedApp(context => config.afterPack(context as never))
  return verifyDesktopRuntime.mock.calls[0]?.[1]
}

describe('packaged runtime verification', () => {
  it('requires the updater closure and rejects shell copies of ZeroWall runtime packages', () => {
    expect(() => { verifyWindowsUpdaterDependencies(VALID_UPDATER_ENTRIES) }).not.toThrow()
    expect(() => { verifyWindowsUpdaterDependencies(VALID_UPDATER_ENTRIES.slice(1)) })
      .toThrow('desktop package: app.asar is missing node_modules/debug/package.json')
    expect(() => { verifyWindowsUpdaterDependencies([
      ...VALID_UPDATER_ENTRIES,
      '\\node_modules\\@zerowall\\dsh-bundle-science\\package.json',
    ]) }).toThrow('ZeroWall runtime packages must stay under app.asar/dsh')
  })

  it('keeps the Science bundle out of the Electron shell production dependency tree', async () => {
    const manifest = JSON.parse(await import('node:fs/promises').then(fs => fs.readFile(new URL('../package.json', import.meta.url), 'utf8'))) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(manifest.dependencies).not.toHaveProperty('@zerowall/dsh-bundle-science')
    expect(manifest.devDependencies).toHaveProperty('@zerowall/dsh-bundle-science', '0.1.1')
  })

  it('carries the complete physical runtime directory including the science wheelhouse', async () => {
    const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
    const config = createElectronBuilderConfig(ENVIRONMENT, 'win32', 'x64')
    const runtime = resolveDesktopTargetBuildPaths(ENVIRONMENT, 'win32', 'x64').runtime
    expect(config.extraResources).toContainEqual({ from: runtime, to: 'runtime' })
  })

  it('requires the product version when the target tree supplies the runtime', async () => {
    const productVersion = (JSON.parse(
      await import('node:fs/promises').then(async fs => fs.readFile(new URL('../package.json', import.meta.url), 'utf8')),
    ) as { version: string }).version
    expect(await requiredRuntimeVersion()).toBe(productVersion)
  })

  it('requires the version installed-update qualification wrote into its private runtime', async () => {
    // Qualification rewrites the runtime's own version, so comparing against the product version would always fail.
    expect(await requiredRuntimeVersion('/qualification/dsh', '0.1.6-alpha.2.20260921.1')).toBe('0.1.6-alpha.2.20260921.1')
  })

  it('does not let a build version change what the bundled runtime must declare', async () => {
    const productVersion = (JSON.parse(
      await import('node:fs/promises').then(async fs => fs.readFile(new URL('../package.json', import.meta.url), 'utf8')),
    ) as { version: string }).version
    const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
    verifyDesktopRuntime.mockClear()
    const buildVersion = `${desktopBuildVersionPrefix(productVersion)}20260921.1`
    const config = createElectronBuilderConfig(
      { ...ENVIRONMENT, DSH_DESKTOP_BUILD_VERSION: buildVersion }, 'win32', 'x64')
    expect(config.extraMetadata).toMatchObject({ version: buildVersion })
    await withPackagedApp(context => config.afterPack(context as never))
    expect(verifyDesktopRuntime.mock.calls[0]?.[1]).toBe(productVersion)
  })
})
