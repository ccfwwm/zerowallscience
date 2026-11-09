/** Isolated ZeroWall feeds publish verified immutable artifacts before the update pointer. */
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash, generateKeyPairSync, verify } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { resolveZeroWallReleaseConfig } from '../scripts/zerowall-release-config.mjs'
import { loadZeroWallQiniuEnvironment, publishZeroWallDownload, publishZeroWallRelease, resolveZeroWallQiniuEnvironmentFile, validateZeroWallQiniuDomain } from '../scripts/publish-zerowall.ts'
import type { DesktopUploadPlan } from '../scripts/desktop-upload-plan.ts'
import type { QiniuReleaseStore } from '../scripts/zerowall-qiniu-store.mjs'
const roots: string[] = []
const signer = 'A'.repeat(40)
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
it('uses the ignored local Qiniu file by default and resolves a resource key beside an alternate file', async () => {
  expect(resolveZeroWallQiniuEnvironmentFile({})).toBe(resolve('apps/desktop/config/publishing/.env.qiniu'))
  const root = await mkdtemp(join(tmpdir(), 'zerowall-qiniu-settings-')); roots.push(root)
  const envFile = join(root, 'release', '.env.qiniu')
  await mkdir(dirname(envFile), { recursive: true })
  await writeFile(envFile, 'QINIU_ACCESS_KEY=fixture\nQINIU_SECRET_KEY=fixture-secret\nQINIU_BUCKET=fixture-bucket\nQINIU_REGION=cn-east-1\nQINIU_DOMAIN=https://example.org\nZEROWALL_RESOURCE_PRIVATE_KEY_FILE=keys/release.pem\nZEROWALL_RESOURCE_KEY_ID=fixture-key\n')
  const environment = await loadZeroWallQiniuEnvironment({ ZEROWALL_QINIU_ENV_FILE: envFile })
  expect(environment).toMatchObject({ DSH_DESKTOP_UPDATE_PROVIDER: 'qiniu', QINIU_BUCKET: 'fixture-bucket',
    ZEROWALL_RESOURCE_PRIVATE_KEY_FILE: join(dirname(envFile), 'keys/release.pem'), ZEROWALL_RESOURCE_KEY_ID: 'fixture-key' })
})

it('rejects a Qiniu public domain that differs from the immutable release origin', () => {
  expect(() =>{  validateZeroWallQiniuDomain({ QINIU_DOMAIN: 'https://wrong.example.org' }, 'https://zerowall.chengxunkeji.cn') }).toThrow(/match the public release origin/u)
})
it('isolates preview and stable feeds and rejects channel, platform, or old service mismatches', () => {
  expect(resolveZeroWallReleaseConfig({}, 'win32', 'x64').publicUrl).toBe('https://zerowall.chengxunkeji.cn/newui/preview/win-x64/')
  expect(resolveZeroWallReleaseConfig({ DSH_DESKTOP_UPDATE_CHANNEL: 'latest' }, 'win32', 'x64').publicUrl).toContain('/newui/stable/win-x64/')
  expect(() => resolveZeroWallReleaseConfig({ DSH_DESKTOP_UPDATE_CHANNEL: 'latest', DSH_DESKTOP_AUTO_UPDATE_ENV: 'test' }, 'win32', 'x64')).toThrow()
  expect(() => resolveZeroWallReleaseConfig({ ZEROWALL_DOWNLOAD_ORIGIN: 'https://download.deepseek.com' }, 'win32', 'x64')).toThrow()
  expect(() => resolveZeroWallReleaseConfig({}, 'linux', 'x64')).toThrow()
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-publish-')); roots.push(root)
  const config = resolveZeroWallReleaseConfig({ QINIU_BUCKET: 'test' }, 'win32', 'x64')
  const exe = join(root, 'app.exe'); const blockmap = join(root, 'app.exe.blockmap'); const yaml = join(root, 'nightly.yml')
  await writeFile(exe, 'signed fixture'); await writeFile(blockmap, 'blockmap'); await writeFile(yaml, 'version: 1.0.0-rc.1')
  const plan: DesktopUploadPlan = { ...config, version: '1.0.0-rc.1', artifacts: [
    { path: exe, filename: 'app.exe', key: 'newui/releases/1.0.0-rc.1/win-x64/app.exe', contentType: 'application/octet-stream', channelMetadata: false },
    { path: blockmap, filename: 'app.exe.blockmap', key: 'newui/releases/1.0.0-rc.1/win-x64/app.exe.blockmap', contentType: 'application/octet-stream', channelMetadata: false },
    { path: yaml, filename: 'nightly.yml', key: 'newui/preview/win-x64/nightly.yml', contentType: 'text/yaml', channelMetadata: true, contents: 'version: 1.0.0-rc.1' },
  ] }
  const events: string[] = []; const objects = new Map<string, Buffer>()
  const store: QiniuReleaseStore = { base: config.origin, exists: async key => objects.has(key), listPrefix: async () => [],
    upload: async (asset, mutable) => { const bytes = await readFile(asset.path); const old = objects.get(asset.key)
      if (old && !old.equals(bytes) && !mutable) throw Error('immutable conflict')
      objects.set(asset.key, bytes); events.push('upload:' + asset.key) },
    verify: async (asset) => { const bytes = await readFile(asset.path); if (!objects.get(asset.key)?.equals(bytes)) throw Error('public checksum mismatch')
      events.push('verify:' + asset.key); return { key: asset.key, url: config.origin + '/' + asset.key, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), verifiedAt: new Date().toISOString() } },
    refresh: async (keys) => { events.push('refresh:' + keys.join(',')) },
  }
  return { root, plan, store, events, objects }
}
it('switches the pointer only after all binaries, blockmap and release metadata verify', async () => {
  const { root, plan, store, events, objects } = await fixture()
  const record = await publishZeroWallRelease(plan, store, join(root, 'records'), async () => ({ status: 'Valid', timestamped: true, thumbprint: signer }), signer)
  const pointer = 'newui/preview/win-x64/nightly.yml'
  const switchAt = events.indexOf('upload:' + pointer)
  expect(events.slice(0, switchAt).filter(event => event.startsWith('verify:'))).toHaveLength(4)
  expect(events.at(-1)).toBe('verify:' + pointer)
  expect((JSON.parse(await readFile(join(record, 'publication.json'), 'utf8')) as { phase: string }).phase).toBe('verified')
  expect((JSON.parse(objects.get('newui/releases/1.0.0-rc.1/win-x64/release.json')!.toString()) as { files: { bytes: number }[] }).files[0]).toMatchObject({ bytes: 14 })
})
it('keeps the pointer untouched when public verification or certificate identity fails', async () => {
  const { root, plan, store, events } = await fixture()
  const signature = async () => ({ status: 'Valid', timestamped: true, thumbprint: signer })
  await expect(publishZeroWallRelease(plan, store, root, signature, 'B'.repeat(40))).rejects.toThrow(/signer/u)
  expect(events).toHaveLength(0)
  store.verify = async () => { throw Error('damaged object') }
  await expect(publishZeroWallRelease(plan, store, join(root, 'records'), signature, signer)).rejects.toThrow(/damaged/u)
  expect(events).not.toContain('upload:newui/preview/win-x64/nightly.yml')
})
it('stops same-version different-byte publication without changing an existing feed', async () => {
  const { root, plan, store, objects } = await fixture()
  const signature = async () => ({ status: 'Valid', timestamped: true, thumbprint: signer })
  await publishZeroWallRelease(plan, store, join(root, 'records'), signature, signer)
  const pointer = objects.get('newui/preview/win-x64/nightly.yml')
  await writeFile(plan.artifacts[0]!.path, 'different')
  await expect(publishZeroWallRelease(plan, store, join(root, 'records'), signature, signer)).rejects.toThrow(/immutable/u)
  expect(objects.get('newui/preview/win-x64/nightly.yml')).toEqual(pointer)
})

it('publishes manual preview downloads with resource signatures and never switches an update pointer', async () => {
  const f = await fixture()
  const installer = join(f.root, 'zerowall-science-1.0.0-rc.1-win-x64-unsigned.exe')
  await writeFile(installer, 'manual fixture')
  const calls: string[] = []
  const store: QiniuReleaseStore = { base: 'https://zerowall.chengxunkeji.cn', exists: async () => false, listPrefix: async () => [],
    upload: async (asset, mutable) => { expect(mutable).toBeUndefined(); calls.push(asset.key) },
    verify: async asset => ({ key: asset.key, url: 'https://zerowall.chengxunkeji.cn/' + asset.key, bytes: (await readFile(asset.path)).length, sha256: createHash('sha256').update(await readFile(asset.path)).digest('hex'), verifiedAt: new Date().toISOString() }),
    refresh: async () => { throw new Error('Manual download must not refresh a pointer') } }
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const result = await publishZeroWallDownload(installer, '1.0.0-rc.1', store, f.root, { keyId: 'fixture', privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString() })
  const envelope = JSON.parse(await readFile(join(result, 'download.json'), 'utf8')) as { payload: { automaticUpdate: boolean }; signature: string }
  expect(envelope.payload.automaticUpdate).toBe(false)
  expect(verify(null, Buffer.from(JSON.stringify(envelope.payload)), publicKey, Buffer.from(envelope.signature, 'base64'))).toBe(true)
  expect(calls.every(key => key.startsWith('newui/releases/1.0.0-rc.1/win-x64/'))).toBe(true)
  expect(calls).toHaveLength(2)
})
