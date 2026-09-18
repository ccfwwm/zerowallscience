import { createHash } from 'node:crypto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { verifyDownloadedArtifact } from '../src/main/update-artifact.js'

it('checks cached bytes and binary version against the offered update', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-update-artifact-'))
  try {
    const name = `zerowall-science-6.4.0-win-${process.arch}.exe`
    const downloadedFile = join(root, name)
    await writeFile(downloadedFile, 'fixture')
    const info = { version: '6.4.0', downloadedFile, files: [{ url: `releases/6.4.0/${name}`, sha512: createHash('sha512').update('fixture').digest('base64') }] }
    await expect(verifyDownloadedArtifact(info, '6.3.0', async () => '6.4.0.0')).resolves.toBeUndefined()
    await expect(verifyDownloadedArtifact(info, '6.3.0', async () => '6.2.0.0')).rejects.toThrow('binary version')
    await expect(verifyDownloadedArtifact({ ...info, downloadedFile: join(root, 'zerowall-science-6.2.0-win-x64.exe') }, '6.3.0')).rejects.toThrow('filename')
    await expect(verifyDownloadedArtifact(info, '6.4.0', async () => '6.4.0.0')).rejects.toThrow('newer')
    await writeFile(downloadedFile, 'corrupted cache')
    await expect(verifyDownloadedArtifact(info, '6.3.0', async () => '6.4.0.0')).rejects.toThrow('checksum mismatch')
  } finally { await rm(root, { recursive: true, force: true }) }
})
