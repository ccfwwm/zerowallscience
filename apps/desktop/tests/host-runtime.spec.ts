import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { c as createTar } from 'tar'
import {
  HOST_RUNTIME_MANIFEST_FILE,
  activateHostRuntime,
  hostRuntimeManifestPayload,
  parseHostRuntimeManifest,
  readHostRuntimeState,
  resolveHostRuntime,
  rollbackHostRuntime,
  verifyHostRuntimeDirectory,
  writeHostRuntimeState,
  type HostRuntimeCompatibility,
  type HostRuntimeManifest,
  type HostRuntimeState,
} from '../src/host-runtime.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

const expected: HostRuntimeCompatibility = {
  productVersion: '9.1.0', dshVersion: '0.2.2-rc.1', hostProtocolVersion: '4', electronVersion: '44.7.0',
  nodeAbi: '149', libreOfficeKitVersion: '0.1.5', pnpmVersion: '11.28.5', pythonVersion: '3.12.14', platform: 'win32', arch: 'x64',
}

function manifest(payload: Buffer, privateKey: KeyObject): HostRuntimeManifest {
  const body: Omit<HostRuntimeManifest, 'signature'> = {
    schemaVersion: 1, product: 'zerowall-science', runtimeVersion: '9.1.0', productVersion: expected.productVersion,
    platform: expected.platform, arch: expected.arch, dshVersion: expected.dshVersion,
    hostProtocolVersion: expected.hostProtocolVersion, electronVersion: expected.electronVersion,
    nodeAbi: expected.nodeAbi, libreOfficeKitVersion: expected.libreOfficeKitVersion,
    pnpmVersion: expected.pnpmVersion, pythonVersion: expected.pythonVersion,
    payload: { path: '.update/host-runtime.tgz', bytes: payload.byteLength,
      sha256: createSha256(payload) },
  }
  const signed = { ...body, signature: { algorithm: 'ed25519' as const, keyId: 'test', value: '' } }
  signed.signature.value = sign(null, Buffer.from(hostRuntimeManifestPayload(signed)), privateKey).toString('base64')
  return signed
}

function createSha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function publicKey(keys: { readonly publicKey: KeyObject }): string {
  return keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
}

function state(activePath: string): HostRuntimeState {
  return { schemaVersion: 1, active: { version: '9.0.0', path: activePath, verifiedAt: new Date(0).toISOString() } }
}

async function createBundledRuntime(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'desktop-runtime.json'), '{}')
}

describe('Host Runtime manifest and recovery', () => {
  it('accepts a signed compatible payload and rejects tampering', async () => {
    const root = await mkdtemp(join(tmpdir(), 'host-runtime-')); roots.push(root)
    const runtime = join(root, '9.1.0')
    await mkdir(runtime, { recursive: true })
    const keys = generateKeyPairSync('ed25519')
    await mkdir(join(runtime, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib'), { recursive: true })
    await writeFile(join(runtime, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'index.js'), 'host')
    const archivePath = join(root, 'runtime.tgz')
    await createTar({ gzip: true, file: archivePath, cwd: root }, ['9.1.0'])
    const payload = await readFile(archivePath)
    const value = manifest(payload, keys.privateKey)
    await mkdir(join(runtime, '.update'))
    await writeFile(join(runtime, '.update', 'host-runtime.tgz'), payload)
    await writeFile(join(runtime, HOST_RUNTIME_MANIFEST_FILE), JSON.stringify(value))
    await expect(verifyHostRuntimeDirectory(runtime, expected, publicKey(keys))).resolves.toMatchObject({ runtimeVersion: '9.1.0' })
    const hostFile = join(runtime, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'index.js')
    await writeFile(hostFile, 'evil')
    await expect(verifyHostRuntimeDirectory(runtime, expected, publicKey(keys))).rejects.toThrow('extracted file digest')
    await writeFile(hostFile, 'host')
    await writeFile(join(runtime, 'extra.js'), 'unlisted')
    await expect(verifyHostRuntimeDirectory(runtime, expected, publicKey(keys))).rejects.toThrow('membership')
    await rm(join(runtime, 'extra.js'))
    for (const field of ['productVersion', 'dshVersion', 'hostProtocolVersion', 'electronVersion', 'nodeAbi', 'libreOfficeKitVersion', 'pnpmVersion', 'arch', 'platform'] as const) {
      await expect(verifyHostRuntimeDirectory(runtime, { ...expected, [field]: 'mismatch' }, publicKey(keys))).rejects.toThrow('compatibility')
    }
    await expect(verifyHostRuntimeDirectory(runtime, expected, publicKey(generateKeyPairSync('ed25519')))).rejects.toThrow('signature')
    await expect(verifyHostRuntimeDirectory(runtime, expected, publicKey(keys), 'wrong')).rejects.toThrow('untrusted')
    await writeFile(join(runtime, '.update', 'host-runtime.tgz'), 'tampered')
    await expect(verifyHostRuntimeDirectory(runtime, expected, publicKey(keys))).rejects.toThrow('payload')
  })

  it('rejects traversal and invalid signatures before reading payloads', () => {
    expect(() => parseHostRuntimeManifest({ schemaVersion: 1, product: 'zerowall-science', runtimeVersion: '9.1.0',
      productVersion: '9.1.0', platform: 'win32', arch: 'x64', dshVersion: '0.2.2-rc.1', hostProtocolVersion: '4',
      electronVersion: '44.7.0', nodeAbi: '149', libreOfficeKitVersion: '0.1.5', pnpmVersion: '11.28.5', pythonVersion: '3.12.14',
      payload: { path: '../payload.bin', bytes: 1, sha256: 'a'.repeat(64) },
      signature: { algorithm: 'ed25519', keyId: 'test', value: 'x' } })).toThrow('manifest')
  })

  it('uses the bundled Host when the external active generation is invalid', async () => {
    const root = await mkdtemp(join(tmpdir(), 'host-runtime-')); roots.push(root)
    const store = join(root, 'store')
    const bundled = join(root, 'bundled')
    await createBundledRuntime(bundled)
    await mkdir(join(store, '9.1.0'), { recursive: true })
    await writeHostRuntimeState(store, { ...state('9.1.0'), active: { version: '9.1.0', path: '9.1.0', verifiedAt: new Date(0).toISOString() } })
    const result = await resolveHostRuntime({ storeRoot: store, bundledRoot: bundled, expected })
    expect(result.selection).toEqual({ runtimeDir: bundled, source: 'bundled' })
    expect(result.ignoredExternal).toContain('trust key')
  })

  it('keeps the current Host when a staged generation fails verification', async () => {
    const root = await mkdtemp(join(tmpdir(), 'host-runtime-')); roots.push(root)
    const store = join(root, 'store')
    const bundled = join(root, 'bundled')
    await createBundledRuntime(bundled)
    const keys = generateKeyPairSync('ed25519')
    const current: HostRuntimeState = { ...state('bundled'), active: {
      version: expected.productVersion, path: 'bundled', verifiedAt: new Date(0).toISOString(),
    }, pending: { version: '9.2.0', path: '9.2.0', phase: 'staged' } }
    await writeHostRuntimeState(store, current)
    const result = await resolveHostRuntime({ storeRoot: store, bundledRoot: bundled, expected,
      publicKey: publicKey(keys) })
    expect(result.selection).toEqual({ runtimeDir: bundled, source: 'bundled' })
    expect(result.state).toMatchObject({ active: { path: 'bundled' }, lastFailure: {
      version: '9.2.0', phase: 'verification', code: 'HOST_RUNTIME_INVALID',
    } })
    expect(result.state?.pending).toBeUndefined()
  })

  it('initializes bundled state and rejects an active path mismatch', async () => {
    const root = await mkdtemp(join(tmpdir(), 'host-runtime-')); roots.push(root)
    const store = join(root, 'store')
    const bundled = join(root, 'bundled')
    await createBundledRuntime(bundled)
    const keys = generateKeyPairSync('ed25519')
    const initial = await resolveHostRuntime({ storeRoot: store, bundledRoot: bundled, expected,
      publicKey: publicKey(keys) })
    expect(initial.selection).toEqual({ runtimeDir: bundled, source: 'bundled' })
    await expect(readHostRuntimeState(store)).resolves.toMatchObject({ active: { path: 'bundled' } })
    await writeHostRuntimeState(store, { schemaVersion: 1,
      active: { version: expected.productVersion, path: 'wrong-generation', verifiedAt: new Date(0).toISOString() } })
    const recovered = await resolveHostRuntime({ storeRoot: store, bundledRoot: bundled, expected,
      publicKey: publicKey(keys) })
    expect(recovered.selection).toEqual({ runtimeDir: bundled, source: 'bundled' })
    expect(recovered.ignoredExternal).toContain('active runtime path mismatch')
  })

  it('requires the bundled descriptor before persisting a runtime selection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'host-runtime-')); roots.push(root)
    const store = join(root, 'store')
    const bundled = join(root, 'bundled')
    await mkdir(bundled, { recursive: true })
    await expect(resolveHostRuntime({ storeRoot: store, bundledRoot: bundled, expected })).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readHostRuntimeState(store)).resolves.toBeUndefined()
  })

  it('activates a staged generation and restores the previous generation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'host-runtime-')); roots.push(root)
    await mkdir(join(root, '9.0.0'), { recursive: true })
    await mkdir(join(root, '9.1.0'), { recursive: true })
    const pending: HostRuntimeState = {
      ...state('9.0.0'), pending: { version: '9.1.0', path: '9.1.0', phase: 'activating' },
    }
    const active = activateHostRuntime(root, pending, '9.1.0')
    expect(active).toMatchObject({ active: { version: '9.1.0' }, previous: { version: '9.0.0' } })
    const restored = rollbackHostRuntime(root, active, { phase: 'startup', code: 'HOST_BOOT_FAILED' })
    expect(restored).toMatchObject({ active: { version: '9.0.0' }, lastFailure: { code: 'HOST_BOOT_FAILED' } })
    await writeHostRuntimeState(root, restored)
    await expect(readHostRuntimeState(root)).resolves.toMatchObject({ active: { version: '9.0.0' } })
  })
})
