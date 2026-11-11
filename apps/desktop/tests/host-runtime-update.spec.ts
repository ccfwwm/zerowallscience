import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { c as createTar } from 'tar'
import { afterEach, expect, it, vi } from 'vitest'
import type { KeyObject } from 'node:crypto'
import { hostRuntimeManifestPayload, resolveHostRuntime, readHostRuntimeState, type HostRuntimeManifest, type HostRuntimeState } from '../src/host-runtime.ts'
import { hostRuntimeFeedPayload, HostRuntimeUpdateCoordinator, parseHostRuntimeFeed, stageHostRuntime } from '../src/host-runtime-update.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

const expected = { productVersion: '9.1.0', dshVersion: '0.2.2-rc.1', hostProtocolVersion: '4', electronVersion: '44.7.0',
  nodeAbi: '149', libreOfficeKitVersion: '0.1.5', pnpmVersion: '11.28.5', pythonVersion: '3.12.14', platform: 'win32' as const, arch: 'x64' as const }

function signedManifest(archive: Buffer, privateKey: KeyObject): HostRuntimeManifest {
  const body: Omit<HostRuntimeManifest, 'signature'> = { schemaVersion: 1, product: 'zerowall-science', runtimeVersion: '9.1.0',
    productVersion: expected.productVersion, platform: expected.platform, arch: expected.arch, dshVersion: expected.dshVersion,
    hostProtocolVersion: expected.hostProtocolVersion, electronVersion: expected.electronVersion, nodeAbi: expected.nodeAbi,
    libreOfficeKitVersion: expected.libreOfficeKitVersion, pnpmVersion: expected.pnpmVersion, pythonVersion: expected.pythonVersion,
    payload: { path: '.update/host-runtime.tgz', bytes: archive.byteLength, sha256: createHash('sha256').update(archive).digest('hex') } }
  const manifest = { ...body, signature: { algorithm: 'ed25519' as const, keyId: 'stable-4', value: '' } }
  manifest.signature.value = sign(null, Buffer.from(hostRuntimeManifestPayload(manifest)), privateKey).toString('base64')
  return manifest
}

function signedFeed(manifest: HostRuntimeManifest, privateKey: KeyObject) {
  const unsigned = { schemaVersion: 1 as const, product: 'zerowall-science' as const, manifest,
    archiveUrl: 'https://example.test/host-runtime.tgz' }
  return { ...unsigned, signature: { algorithm: 'ed25519' as const, keyId: 'stable-4',
    value: sign(null, Buffer.from(hostRuntimeFeedPayload({ ...unsigned, signature: { algorithm: 'ed25519', keyId: 'stable-4', value: '' } })), privateKey).toString('base64') } }
}

it('parses a signed formal feed pointer and rejects insecure archive URLs', () => {
  const manifest = { schemaVersion: 1, product: 'zerowall-science', runtimeVersion: '9.1.0', productVersion: '9.1.0',
    platform: 'win32', arch: 'x64', dshVersion: '0.2.2-rc.1', hostProtocolVersion: '4', electronVersion: '44.7.0',
    nodeAbi: '149', libreOfficeKitVersion: '0.1.5', pnpmVersion: '11.28.5', pythonVersion: '3.12.14',
    payload: { path: 'payload.bin', bytes: 1, sha256: 'a'.repeat(64) },
    signature: { algorithm: 'ed25519', keyId: 'stable-4', value: 'signature' } }
  expect(parseHostRuntimeFeed({ schemaVersion: 1, product: 'zerowall-science', archiveUrl: 'https://example.test/runtime.tgz', manifest,
    signature: { algorithm: 'ed25519', keyId: 'stable-4', value: 'feed-signature' } })).toMatchObject({ archiveUrl: 'https://example.test/runtime.tgz' })
  expect(() => parseHostRuntimeFeed({ schemaVersion: 1, product: 'zerowall-science', archiveUrl: 'http://example.test/runtime.tgz', manifest,
    signature: { algorithm: 'ed25519', keyId: 'stable-4', value: 'feed-signature' } })).toThrow('feed')
})

it('checks archive bytes before extracting and stages only safe host entries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'host-runtime-feed-')); roots.push(root)
  const source = join(root, 'source'); await mkdir(join(source, 'runtime', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib'), { recursive: true })
  await writeFile(join(source, 'runtime', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'index.js'), 'host')
  const archivePath = join(root, 'host-runtime.tgz')
  await createTar({ gzip: true, file: archivePath, cwd: source }, ['runtime'])
  const archive = await readFile(archivePath)
  const keys = generateKeyPairSync('ed25519')
  const manifest = signedManifest(archive, keys.privateKey)
  const feed = signedFeed(manifest, keys.privateKey)
  const store = join(root, 'store')
  const state: HostRuntimeState = { schemaVersion: 1, active: { version: '9.1.0', path: 'bundled', verifiedAt: new Date(0).toISOString() } }
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  await expect(stageHostRuntime(feed, join(root, 'short'), state, expected, publicKey, 'stable-4',
    async () => new Response(archive.subarray(0, -1)))).rejects.toThrow('size mismatch')
  const tampered = Buffer.from(archive); tampered[0] = tampered[0]! ^ 1
  await expect(stageHostRuntime(feed, join(root, 'tampered'), state, expected, publicKey, 'stable-4',
    async () => new Response(tampered))).rejects.toThrow('digest mismatch')
  await expect(stageHostRuntime(feed, join(root, 'offline'), state, expected, publicKey, 'stable-4',
    async () => { throw new Error('offline') })).rejects.toThrow('offline')
  const next = await stageHostRuntime(feed, store, state, expected, publicKey, 'stable-4',
    async () => new Response(archive))
  expect(next.pending).toMatchObject({ version: '9.1.0', phase: 'staged' })
  await expect(readFile(join(store, '9.1.0', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'index.js'), 'utf8')).resolves.toBe('host')
  const bundled = join(root, 'bundled'); await mkdir(bundled)
  await writeFile(join(bundled, 'desktop-runtime.json'), '{}')
  const selected = await resolveHostRuntime({ storeRoot: store, bundledRoot: bundled, expected, publicKey, keyId: 'stable-4' })
  expect(selected.selection).toMatchObject({ source: 'external', version: '9.1.0' })
  expect(selected.state?.pending?.phase).toBe('activating')
  const interrupted = await resolveHostRuntime({ storeRoot: store, bundledRoot: bundled, expected, publicKey, keyId: 'stable-4' })
  expect(interrupted.selection.source).toBe('bundled')
  expect((await readHostRuntimeState(store))?.lastFailure?.code).toBe('HOST_STARTUP_INTERRUPTED')

  await createTar({ gzip: true, file: join(root, 'traversal.tgz'), cwd: source, prefix: '../escape' }, ['runtime'])
  const traversal = await readFile(join(root, 'traversal.tgz'))
  const unsafeFeed = signedFeed(signedManifest(traversal, keys.privateKey), keys.privateKey)
  await expect(stageHostRuntime(unsafeFeed, join(root, 'unsafe'), state, expected, publicKey, 'stable-4',
    async () => new Response(traversal))).rejects.toThrow()
})

it('coalesces concurrent checks and forgets a feed after a failed refresh', async () => {
  const keys = generateKeyPairSync('ed25519')
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const feed = signedFeed(signedManifest(Buffer.from('archive'), keys.privateKey), keys.privateKey)
  const response = Promise.withResolvers<Response>()
  const fetcher = vi.fn(() => response.promise)
  const updates = new HostRuntimeUpdateCoordinator('9.0.0')
  const first = updates.check('https://example.test/feed', expected, publicKey, 'stable-4', fetcher)
  const second = updates.check('https://example.test/feed', expected, publicKey, 'stable-4', fetcher)
  expect(first).toBe(second)
  response.resolve(new Response(JSON.stringify(feed)))
  expect((await first).phase).toBe('available')
  expect(fetcher).toHaveBeenCalledTimes(1)
  await updates.check('https://example.test/feed', expected, publicKey, 'stable-4', async () => new Response(null, { status: 503 }))
  await expect(updates.stage('unused', { schemaVersion: 1, active: { version: '9.1.0', path: 'bundled', verifiedAt: new Date(0).toISOString() } },
    expected, publicKey, 'stable-4')).rejects.toThrow('check required')
})

it('clears a stale candidate when Bootstrap selects the bundled runtime', () => {
  const updates = new HostRuntimeUpdateCoordinator('9.0.0')
  updates.setActiveVersion('9.1.0')
  expect(updates.state).toMatchObject({ phase: 'idle', activeVersion: '9.1.0' })
  updates.setActiveVersion(undefined)
  expect(updates.state).toEqual({ phase: 'idle' })
})
