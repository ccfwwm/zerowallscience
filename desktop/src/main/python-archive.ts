import { createWriteStream } from 'node:fs'
import { mkdir, stat, statfs, open, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, resolve, relative, isAbsolute, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'

export async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  const file = await open(path, 'r')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  try {
    while (true) {
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null)
      if (!bytesRead) break
      hash.update(buffer.subarray(0, bytesRead))
    }
  } finally { await file.close() }
  return hash.digest('hex')
}

export async function requireFreeSpace(path: string, bytes: number): Promise<void> {
  await mkdir(path, { recursive: true })
  const disk = await statfs(path)
  if (disk.bavail * disk.bsize < bytes) throw new Error(`磁盘空间不足，需要至少 ${(bytes / 1024 ** 3).toFixed(1)} GiB 可用空间；当前环境保持可用。`)
}

/** Bounded memory, lazy entries, one file stream at a time. Never buffers the ZIP. */
export async function extractArchive(path: string, target: string, progress: (done: number, total: number) => void = () => undefined): Promise<void> {
  const yauzl = createRequire(import.meta.url)('yauzl')
  await mkdir(target, { recursive: true })
  await new Promise<void>((done, fail) => {
    yauzl.open(path, { lazyEntries: true, autoClose: true, validateEntrySizes: true }, (error: Error | null, zip: any) => {
      if (error) return fail(error)
      const seen = new Set<string>(); let completed = 0; let totalBytes = 0
      const abort = (reason: Error) => { zip.close(); fail(reason) }
      zip.on('error', abort)
      zip.on('end', () => { progress(completed, zip.entryCount); done() })
      zip.on('entry', (entry: any) => {
        void (async () => {
          const name = entry.fileName.replaceAll('\\', '/')
          const destination = resolve(target, name)
          const rel = relative(resolve(target), destination)
          const key = destination.toLowerCase()
          const mode = (entry.externalFileAttributes >>> 16) & 0xf000
          if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) || name.includes(':') || name.split('/').some((part: string) => /[. ]$/u.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part)) || mode === 0xa000 || seen.has(key)) throw new Error('Unsafe or duplicate ZIP entry: ' + name)
          seen.add(key)
          totalBytes += entry.uncompressedSize
          if (!Number.isSafeInteger(totalBytes) || totalBytes > 16 * 1024 ** 3 || entry.uncompressedSize > 4 * 1024 ** 3 || zip.entryCount > 250_000) throw new Error('ZIP extraction size limit exceeded.')
          if (name.endsWith('/')) await mkdir(destination, { recursive: true })
          else {
            await mkdir(dirname(destination), { recursive: true })
            const stream = await new Promise<any>((accept, reject) => zip.openReadStream(entry, (err: Error, value: any) => err ? reject(err) : accept(value)))
            await pipeline(stream, createWriteStream(destination, { flags: 'wx' }))
          }
          completed++
          if (completed % 128 === 0) progress(completed, zip.entryCount)
          zip.readEntry()
        })().catch(abort)
      })
      zip.readEntry()
    })
  })
}

export async function downloadArchive(input: { url: string; size: number; sha256: string; path: string; fetcher?: typeof fetch; progress?: (received: number, speed: number) => void }): Promise<void> {
  await mkdir(dirname(input.path), { recursive: true })
  let offset = await stat(input.path).then(s => s.size, () => 0)
  if (offset > input.size) { await rm(input.path, { force: true }); offset = 0 }
  const fetcher = input.fetcher ?? fetch
  if (offset < input.size) {
    let response = await fetcher(input.url, { headers: offset ? { Range: `bytes=${offset}-` } : {}, signal: AbortSignal.timeout(30 * 60_000) })
    if (offset && (response.status !== 206 || response.headers.get('content-range') !== `bytes ${offset}-${input.size - 1}/${input.size}`)) {
      await response.body?.cancel(); offset = 0
      response = await fetcher(input.url, { signal: AbortSignal.timeout(30 * 60_000) })
    }
    if (!response.ok || (!offset && response.status !== 200)) throw new Error(`下载失败 HTTP ${response.status}`)
    const file = await open(input.path, offset ? 'a' : 'w')
    const start = Date.now(); const initial = offset
    try {
      if (!response.body) throw new Error('下载响应没有数据流。')
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        if (offset + chunk.byteLength > input.size) throw new Error('归档大小超出签名声明。')
        let written = 0
        while (written < chunk.byteLength) written += (await file.write(chunk, written, chunk.byteLength - written)).bytesWritten
        offset += chunk.byteLength
        input.progress?.(offset, (offset - initial) * 1000 / Math.max(1, Date.now() - start))
      }
      await file.sync()
    } finally { await file.close() }
  }
  if (offset !== input.size) throw new Error('下载中断，已保留断点。')
  if (await hashFile(input.path) !== input.sha256) { await rm(input.path, { force: true }); throw new Error('归档 SHA-256 校验失败，当前环境未改变。') }
}
