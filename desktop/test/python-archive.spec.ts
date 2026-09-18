import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import JSZip from 'jszip'
import { downloadArchive, extractArchive, requireFreeSpace } from '../src/main/python-archive.js'
const roots: string[] = []
async function directory() { const root = await mkdtemp(join(tmpdir(), 'python-archive-')); roots.push(root); return root }
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
describe('streaming Python archives', () => {
  for (const range of [true, false]) it(`resumes partial downloads with range supported=${range}`, async () => {
    const root = await directory(); const path = join(root, 'archive.part'); const bytes = Buffer.from('verified complete archive')
    await writeFile(path, bytes.subarray(0, 8)); const ranges: unknown[] = []
    await downloadArchive({ url: 'https://test/archive.zip', path, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), fetcher: async (_url, options) => {
      ranges.push(options?.headers)
      return range ? new Response(bytes.subarray(8), { status: 206, headers: { 'content-range': `bytes 8-${bytes.length - 1}/${bytes.length}` } }) : new Response(bytes)
    } })
    expect(await readFile(path)).toEqual(bytes); expect(ranges).toHaveLength(range ? 1 : 2)
  })
  it('rejects a corrupt completed cache rather than activating it', async () => {
    const path = join(await directory(), 'archive.part'); await writeFile(path, 'bad')
    await expect(downloadArchive({ url: 'https://test/archive.zip', path, size: 3, sha256: '0'.repeat(64), fetcher: async () => { throw new Error('Should use cache') } })).rejects.toThrow('SHA-256')
    await expect(stat(path)).rejects.toThrow()
  })
  it('keeps the verified prefix after a network interruption', async () => {
    const path = join(await directory(), 'archive.part')
    await expect(downloadArchive({ url: 'https://test/archive.zip', path, size: 100, sha256: '0'.repeat(64), fetcher: async () => new Response('partial') })).rejects.toThrow('下载中断')
    expect(await readFile(path, 'utf8')).toBe('partial')
  })
  for (const name of ['../escape', 'C:/escape', 'CON.txt', 'trailing.']) it(`rejects unsafe extraction path ${name}`, async () => {
    const root = await directory(); const zip = new JSZip(); zip.file(name, 'bad')
    const path = join(root, 'archive.zip'); await writeFile(path, await zip.generateAsync({ type: 'nodebuffer' }))
    await expect(extractArchive(path, join(root, 'target'))).rejects.toThrow()
  })
  it('rejects case-insensitive duplicate destinations on Windows', async () => {
    const root = await directory(); const zip = new JSZip(); zip.file('A.py', 'a'); zip.file('a.py', 'b')
    const path = join(root, 'archive.zip'); await writeFile(path, await zip.generateAsync({ type: 'nodebuffer' }))
    await expect(extractArchive(path, join(root, 'target'))).rejects.toThrow('duplicate')
  })
  it('rejects a symbolic link entry', async () => {
    const root = await directory(); const zip = new JSZip(); zip.file('link', '../escape', { unixPermissions: 0xa1ff })
    const path = join(root, 'archive.zip'); await writeFile(path, await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' }))
    await expect(extractArchive(path, join(root, 'target'))).rejects.toThrow('Unsafe')
  })
  it('reports insufficient disk before installation', async () => {
    await expect(requireFreeSpace(await directory(), Number.MAX_SAFE_INTEGER)).rejects.toThrow('磁盘空间不足')
  })
})
