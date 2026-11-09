import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { QiniuReleaseStore } from '../scripts/zerowall-qiniu-store.mjs'
import { suggestDesktopBuildVersion } from '../scripts/desktop-build-version-discovery.ts'

const qiniu = vi.hoisted(() => ({
  open: vi.fn<(environment: NodeJS.ProcessEnv) => Promise<QiniuReleaseStore>>(),
  listPrefix: vi.fn<(prefix: string, timeoutMs: number) => Promise<string[]>>(),
}))

vi.mock('../scripts/zerowall-qiniu-store.mjs', () => ({ openQiniuStore: qiniu.open }))

const roots: string[] = []
const environment = {
  DSH_DESKTOP_UPDATE_PROVIDER: 'qiniu',
  QINIU_BUCKET: 'fixture-bucket',
  QINIU_ACCESS_KEY: 'fixture-access',
  QINIU_SECRET_KEY: 'fixture-secret',
}

afterEach(async () => {
  vi.clearAllMocks()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function store(): QiniuReleaseStore {
  return {
    base: 'https://example.org',
    exists: async () => false,
    listPrefix: qiniu.listPrefix,
    upload: async () => undefined,
    verify: async asset => ({ key: asset.key, url: 'https://example.org/' + asset.key, bytes: 0, sha256: '', verifiedAt: '' }),
    refresh: async () => undefined,
  }
}

it('numbers a Qiniu build after every published version under the release prefix', async () => {
  qiniu.listPrefix.mockResolvedValue([
    'newui/releases/0.2.2-rc.1.20261108.1/win-x64/zerowall-science-0.2.2-rc.1.20261108.1-win-x64.exe',
    'newui/releases/0.2.2-rc.1.20261108.3/win-x64/zerowall-science-0.2.2-rc.1.20261108.3-win-x64.exe',
  ])
  qiniu.open.mockResolvedValue(store())

  await expect(suggestDesktopBuildVersion({ productVersion: '0.2.2-rc.1', target: 'win-x64', environment, date: '20261108', artifactsRoot: 'missing-output' }))
    .resolves.toBe('0.2.2-rc.1.20261108.4')
  expect(qiniu.listPrefix).toHaveBeenCalledWith('newui/releases/zerowall-science-', 8_000)
})

it('falls back to local artifacts when Qiniu cannot list the release prefix', async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), 'zerowall-build-version-'))
  roots.push(artifactsRoot)
  await writeFile(join(artifactsRoot, 'zerowall-science-0.2.2-rc.1.20261108.6-win-x64-unsigned.exe'), 'fixture')
  qiniu.listPrefix.mockRejectedValue(new Error('listing unavailable'))
  qiniu.open.mockResolvedValue(store())

  await expect(suggestDesktopBuildVersion({ productVersion: '0.2.2-rc.1', target: 'win-x64', environment, date: '20261108', artifactsRoot }))
    .resolves.toBe('0.2.2-rc.1.20261108.7')
})

it('rejects an incomplete Qiniu configuration instead of numbering only from local artifacts', async () => {
  const { QINIU_ACCESS_KEY: _accessKey, QINIU_SECRET_KEY: _secretKey, ...incompleteEnvironment } = environment

  await expect(suggestDesktopBuildVersion({ productVersion: '0.2.2-rc.1', target: 'win-x64', environment: incompleteEnvironment, date: '20261108', artifactsRoot: 'missing-output' }))
    .rejects.toThrow(/QINIU_ACCESS_KEY and QINIU_SECRET_KEY/u)
  expect(qiniu.open).not.toHaveBeenCalled()
})
