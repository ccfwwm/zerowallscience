import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createWindowsReleaseMetadata } from '../generate-windows-release-metadata.mjs'

test('Windows release metadata remains compatible with the 2.x updater contract', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-release-metadata-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const installer = join(root, 'zerowall-science-3.0.2-win-x64.exe')
  await writeFile(installer, Buffer.from('verified-installer'))

  const metadata = await createWindowsReleaseMetadata({
    installer,
    version: '3.0.2',
    notes: 'ZeroWall Science 3.0.2 release notes',
    publishedAt: '2026-08-17T12:00:00Z',
    releaseBaseUrl: 'https://zerowall.chengxunkeji.cn/',
  })

  assert.deepEqual(Object.keys(metadata), [
    'version', 'url', 'name', 'notes', 'publishedAt',
    'assetUrl', 'assetName', 'assetSha256', 'sizeBytes',
  ])
  assert.equal(metadata.assetUrl, 'https://zerowall.chengxunkeji.cn/releases/3.0.2/zerowall-science-3.0.2-win-x64.exe')
  assert.equal(metadata.assetName, 'zerowall-science-3.0.2-win-x64.exe')
  assert.equal(metadata.assetSha256.length, 64)
  assert.equal(metadata.sizeBytes, 18)
})
