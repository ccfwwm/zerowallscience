/** Stable publication keeps legacy pointers unchanged until immutable artifacts are verified. */
import { createHash, generateKeyPairSync } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { stageStableRelease, promoteStableRelease } from '../scripts/publish-zerowall-stable.ts'
import { resolveZeroWallReleaseConfig } from '../scripts/zerowall-release-config.mjs'
import { verifyResourceRelease } from '../src/resource-update.ts'
import type { QiniuReleaseStore } from '../scripts/zerowall-qiniu-store.mjs'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-stable-')); roots.push(root)
  const installer = join(root, 'zerowall-science-9.0.0-win-x64.exe')
  await writeFile(installer, 'MZfixture-installer'); await writeFile(installer + '.blockmap', 'blockmap')
  const keys = generateKeyPairSync('ed25519')
  const signing = { keyId: 'fixture', privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }
  const trust = { keyId: 'fixture', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() }
  const events: string[] = [], objects = new Map<string, Buffer>()
  const store: QiniuReleaseStore = { base: 'https://zerowall.chengxunkeji.cn', exists: async key => objects.has(key), listPrefix: async () => [],
    upload: async (asset, mutable) => {
      events.push((mutable ? 'pointer:' : 'immutable:') + asset.key)
      const data = await readFile(asset.path)
      if (!mutable && objects.has(asset.key) && !objects.get(asset.key)?.equals(data)) throw new Error('immutable conflict')
      objects.set(asset.key, data)
    },
    verify: async (asset) => {
      events.push('verify:' + asset.key)
      const data = await readFile(asset.path)
      if (!objects.get(asset.key)?.equals(data)) throw new Error('Public digest mismatch')
      return { key: asset.key, url: store.base + '/' + asset.key, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), verifiedAt: new Date().toISOString() }
    }, refresh: async (keys) => { events.push('refresh:' + keys.join(',')) } }
  const pointer = async () => Buffer.from('old-8.x-pointer')
  return { root, installer, signing, trust, store, events, objects, pointer }
}

it('uses the 8.x identity and feed only in the explicit Windows stable release mode', () => {
  const env = { ZEROWALL_OFFICIAL_UNSIGNED: '1', DSH_DESKTOP_APP_ID: 'com.zerowall.science', DSH_DESKTOP_UPDATE_CHANNEL: 'latest', DSH_DESKTOP_AUTO_UPDATE_ENV: 'production' }
  expect(resolveZeroWallReleaseConfig(env, 'win32', 'x64')).toMatchObject({ publicUrl: 'https://zerowall.chengxunkeji.cn/stable/', binaryKeyPrefix: 'stable/releases' })
  expect(() => resolveZeroWallReleaseConfig({ ...env, DSH_DESKTOP_UPDATE_CHANNEL: 'nightly' }, 'win32', 'x64')).toThrow()
  expect(() => resolveZeroWallReleaseConfig(env, 'darwin', 'x64')).toThrow()
})

it('stages signed immutable files and promotes the legacy YAML and website JSON only afterward', async () => {
  const f = await fixture()
  const record = await stageStableRelease(f.installer, '9.0.0', f.store, f.root, f.signing, f.pointer)
  expect(f.events.some(event => event.startsWith('pointer:'))).toBe(false)
  const envelope = JSON.parse(await readFile(join(record.directory, 'release.json'), 'utf8')) as { keyId: string; signature: string; payload: { version: string } }
  expect(verifyResourceRelease(envelope, '9.0.0', f.trust).files).toHaveLength(2)
  expect(() => verifyResourceRelease({ ...envelope, payload: { ...envelope.payload, version: '9.0.1' } }, '9.0.1', f.trust)).toThrow('signature mismatch')
  expect(() => verifyResourceRelease(envelope, '9.0.1', f.trust)).toThrow('Invalid signed release metadata')
  await promoteStableRelease(record, f.store, f.pointer)
  expect(f.events.filter(event => event.startsWith('pointer:'))).toEqual(['pointer:stable/latest.yml', 'pointer:stable/releases/latest.json'])
  const json = JSON.parse(f.objects.get('stable/releases/latest.json')!.toString()) as { assetUrl: string; assetSha256: string }
  expect(json.assetUrl).toBe('https://zerowall.chengxunkeji.cn/stable/releases/9.0.0/zerowall-science-9.0.0-win-x64.exe')
  expect(json.assetSha256).toMatch(/^[a-f0-9]{64}$/u)
})

it('rejects concurrent pointer changes and damaged public files before promotion', async () => {
  const f = await fixture(), record = await stageStableRelease(f.installer, '9.0.0', f.store, f.root, f.signing, f.pointer)
  await expect(promoteStableRelease(record, f.store, async () => Buffer.from('newer-pointer'))).rejects.toThrow('pointer moved')
  f.objects.set(record.assets[0]!.key, Buffer.from('damaged'))
  await expect(promoteStableRelease(record, f.store, f.pointer)).rejects.toThrow('digest mismatch')
  expect(f.events.some(event => event.startsWith('pointer:'))).toBe(false)
})
