/** Check payloads and Host boot with private native-cache and Harness directories. */
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { runtimeArchivePath } from '../../desktop-host/src/office-engine.ts'
import { readPrimaryRuntime } from '../../../packages/skill/tool-workspace-dependencies/src/index.ts'
import { desktopNodeEnvironment } from '../src/node-environment.ts'
import { readHostRuntimeState, resolveHostRuntime, type HostRuntimeCompatibility, type HostRuntimeResolution } from '../src/host-runtime.ts'
import type { DesktopRuntimeDescriptor } from '../src/runtime-tree.ts'
import { scrubWindowsSigningEnvironment } from './windows-sign.mjs'
import { smokeDesktopRuntime } from './smoke-runtime.ts'
import { verifyRuntimeArchive } from './verify-runtime-archive.ts'

/**
 * Exercise real runtime files and Host composition, including an ASAR root when packaged.
 * @param root Prepared or archived dsh directory.
 * @param node Target Electron executable.
 * @param resourcesRuntime External runtime directory beside the archive.
 * @param descriptor Runtime descriptor already verified against the selected target, which may differ from the build host.
 * @returns Resolves after archive integrity, payload checks, Host startup, Office conversion and teardown.
 */
export async function smokePreparedRuntime(
  root: string, node: string, resourcesRuntime: string, descriptor: DesktopRuntimeDescriptor,
): Promise<void> {
  const cache = await mkdtemp(join(tmpdir(), 'desktop-native-smoke-'))
  const environment = { ...scrubWindowsSigningEnvironment(process.env), NODE_OPTIONS: '',
    NARB_NATIVE_CACHE_DIR: cache, NARB_DISABLE_NATIVE_CACHE: '0' }
  try {
    const nodeEnvironment = desktopNodeEnvironment(node, join(resourcesRuntime, 'bin'), environment)
    const archive = runtimeArchivePath(root)
    if (archive !== undefined) await verifyRuntimeArchive(archive, descriptor)
    const { stdout } = await promisify(execFile)(node, [
      '--expose-internals', resolve(import.meta.dirname, '../tests/fixtures/runtime-payload-smoke.mjs'), root, resourcesRuntime,
    ], { timeout: 120_000, windowsHide: true,
      env: nodeEnvironment }).catch((error: unknown) => {
      if (error instanceof Error) {
        if ('stdout' in error && typeof error.stdout === 'string') process.stdout.write(error.stdout)
        if ('stderr' in error && typeof error.stderr === 'string') process.stderr.write(error.stderr)
        if ('killed' in error && 'signal' in error) {
          process.stderr.write(`runtime payload: killed=${String(error.killed)}, signal=${String(error.signal)}\n`)
        }
      }
      throw error
    })
    process.stdout.write(stdout)
    let hostRuntimeResolver: ((storeRoot: string) => Promise<HostRuntimeResolution>) | undefined
    if (descriptor.platform === 'win32') {
      if (descriptor.arch !== 'x64') throw new Error('desktop runtime: unsupported Windows smoke architecture')
      const identityScript = 'const fs = require("node:fs"); const path = require("node:path"); '
        + 'const root = process.argv[1]; '
        + 'const libreOffice = JSON.parse(fs.readFileSync(path.join(root, "node_modules", "@deepseek-ai", "libreoffice-kit", "package.json"), "utf8")); '
        + 'console.log(JSON.stringify({ electron: process.versions.electron, nodeAbi: process.versions.modules, libreOfficeKitVersion: libreOffice.version }))'
      const identityOutput = await promisify(execFile)(node, ['-e', identityScript, root],
        { env: nodeEnvironment, timeout: 10_000, windowsHide: true })
      const identity: unknown = JSON.parse(identityOutput.stdout)
      if (typeof identity !== 'object' || identity === null || !('electron' in identity)
        || typeof identity.electron !== 'string' || !('nodeAbi' in identity) || typeof identity.nodeAbi !== 'string'
        || !('libreOfficeKitVersion' in identity) || typeof identity.libreOfficeKitVersion !== 'string') {
        throw new Error('desktop runtime: target Electron returned invalid Host Runtime identity')
      }
      const primary = await readPrimaryRuntime(join(resourcesRuntime, 'primary-runtime'))
      if (primary.pnpm === undefined) {
        throw new Error('desktop runtime: bundled Host Runtime compatibility metadata is incomplete')
      }
      const expected: HostRuntimeCompatibility = {
        productVersion: descriptor.release.productVersion ?? descriptor.release.version,
        dshVersion: descriptor.release.version,
        hostProtocolVersion: String(descriptor.release.hostProtocolVersion),
        electronVersion: identity.electron,
        nodeAbi: identity.nodeAbi,
        libreOfficeKitVersion: identity.libreOfficeKitVersion,
        pnpmVersion: primary.pnpm,
        pythonVersion: primary.python,
        platform: 'win32',
        arch: 'x64',
      }
      hostRuntimeResolver = async (storeRoot) => {
        const options = { storeRoot, bundledRoot: root, expected }
        if (archive === undefined) return resolveHostRuntime(options)
        // Only Electron provides the filesystem operations used by the packaged Bootstrap.
        const require = createRequire(import.meta.url)
        const resolverUrl = new URL('../src/host-runtime.ts', import.meta.url).href
        const script = `import { resolveHostRuntime } from ${JSON.stringify(resolverUrl)};
const options = JSON.parse(process.argv[1]);
const result = await resolveHostRuntime(options);
if (result.selection.source !== 'bundled' || result.selection.runtimeDir !== options.bundledRoot
  || result.state?.active.path !== 'bundled') throw new Error('desktop runtime: Bootstrap selected an unexpected runtime');`
        await promisify(execFile)(node, ['--import', pathToFileURL(require.resolve('tsx/esm')).href,
          '--input-type=module', '-e', script, JSON.stringify(options)],
        { env: nodeEnvironment, timeout: 30_000, windowsHide: true })
        const state = await readHostRuntimeState(storeRoot)
        if (state === undefined) throw new Error('desktop runtime: Bootstrap did not persist its runtime selection')
        console.log('desktop runtime: packaged Bootstrap selected the bundled ASAR runtime')
        return { selection: { runtimeDir: root, source: 'bundled' }, state }
      }
    }
    await smokeDesktopRuntime(root, node, descriptor, environment, resourcesRuntime, hostRuntimeResolver)
  } finally {
    await rm(cache, { recursive: true, force: true })
  }
}
