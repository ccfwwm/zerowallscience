import { createHash, generateKeyPairSync } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { stageHostRelease, promoteHostRelease } from '../scripts/publish-host-runtime.ts'
import type { QiniuReleaseStore } from '../scripts/zerowall-qiniu-store.mjs'
import { parseHostRuntimeFeed } from '../src/host-runtime-update.ts'

const roots: string[] = []
const script = fileURLToPath(new URL('../scripts/package-host-runtime.mjs', import.meta.url))
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

it('builds signed release files and refuses to overwrite an immutable runtime version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'host-runtime-release-')); roots.push(root)
  const runtime = join(root, 'runtime')
  const output = join(root, 'feed')
  const keyFile = join(root, 'signing-key.pem')
  const keys = generateKeyPairSync('ed25519')
  const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' })
  await mkdir(join(runtime, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib'), { recursive: true })
  await writeFile(join(runtime, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh-desktop-host', version: '0.2.2-rc.1', main: 'lib/index.js',
  }))
  await writeFile(join(runtime, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'index.js'), 'export {}\n')
  await mkdir(join(runtime, 'node_modules', '@deepseek-ai', 'dsh'), { recursive: true })
  await writeFile(join(runtime, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh', version: '0.2.2-rc.1',
  }))
  await writeFile(keyFile, privateKey)
  const args = [script, '--runtime', runtime, '--output', output, '--version', '9.1.0', '--product', '9.1.0',
    '--dsh', '0.2.2-rc.1', '--protocol', '4', '--electron', '44.7.0', '--abi', '149', '--libreoffice', '0.1.5',
    '--pnpm', '11.28.5', '--python', '3.12.14', '--platform', 'win32', '--arch', 'x64',
    '--archive-url', 'https://zerowall.chengxunkeji.cn/stable/host-runtime/releases/9.1.0/host-runtime.tgz',
    '--key-file', keyFile, '--key-id', 'stable-4']
  const first = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 60_000 })
  expect(first.status, first.stderr).toBe(0)
  const archivePath = join(output, 'releases', '9.1.0', 'host-runtime.tgz')
  const archive = await readFile(archivePath)
  const feed = parseHostRuntimeFeed(JSON.parse(await readFile(join(output, 'latest.json'), 'utf8')))
  const record = JSON.parse(await readFile(join(output, 'releases', '9.1.0', 'release.json'), 'utf8')) as Record<string, unknown>
  expect(feed.signature).toMatchObject({ algorithm: 'ed25519', keyId: 'stable-4' })
  expect(record.archive).toMatchObject({ bytes: archive.byteLength,
    sha256: createHash('sha256').update(archive).digest('hex') })

  const duplicate = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 60_000 })
  expect(duplicate.status).not.toBe(0)
  expect(duplicate.stderr).toContain('release 9.1.0 already exists')
  await expect(readFile(archivePath)).resolves.toEqual(archive)

  const objects = new Map<string, Buffer>()
  const store: QiniuReleaseStore = {
    base: 'https://zerowall.chengxunkeji.cn',
    exists: async key => objects.has(key),
    listPrefix: async prefix => [...objects.keys()].filter(key => key.startsWith(prefix)),
    upload: async (asset, mutable = false) => {
      const bytes = await readFile(asset.path)
      if (!mutable && objects.has(asset.key) && !objects.get(asset.key)!.equals(bytes)) throw new Error('immutable object changed')
      objects.set(asset.key, bytes)
    },
    verify: async (asset) => {
      const bytes = await readFile(asset.path)
      if (!objects.get(asset.key)?.equals(bytes)) throw new Error('public object mismatch')
      return { key: asset.key, url: store.base + '/' + asset.key, bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'), verifiedAt: new Date().toISOString() }
    },
    refresh: async () => {},
  }
  const trust = { keyId: 'stable-4', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() }
  const recordPath = join(root, 'records')
  const publication = await stageHostRelease(output, store, recordPath, trust, async () => undefined)
  expect(objects.has('stable/host-runtime/latest.json')).toBe(false)
  expect(objects.size).toBe(4)
  await expect(promoteHostRelease(publication, store, async () => Buffer.from('concurrent release'))).rejects.toThrow('pointer moved')
  await promoteHostRelease(publication, store, async () => undefined)
  expect(parseHostRuntimeFeed(JSON.parse(objects.get('stable/host-runtime/latest.json')!.toString())).manifest.runtimeVersion).toBe('9.1.0')
  const published = JSON.parse(await readFile(join(publication.directory, 'publication.json'), 'utf8')) as Record<string, unknown>
  expect(published.phase).toBe('verified')
  await expect(stageHostRelease(output, store, recordPath, { ...trust, keyId: 'untrusted' }, async () => undefined)).rejects.toThrow('signing key mismatch')
})
