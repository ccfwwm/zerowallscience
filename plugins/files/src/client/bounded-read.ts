export interface ByteWindow { data: Uint8Array; eof: boolean; version: string; bytes?: number }
export const PREVIEW_MAX_BYTES = 50 * 1024 * 1024
export const PREVIEW_WINDOW_BYTES = 512 * 1024

/** Bounded first request, version checks on every window, and no partial success. */
export async function readPreviewBytes(read: (offset: number, length: number) => Promise<ByteWindow>, signal: AbortSignal): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let total = 0
  let version: string | undefined
  for (;;) {
    signal.throwIfAborted()
    const value = await read(total, PREVIEW_WINDOW_BYTES)
    signal.throwIfAborted()
    if (value.bytes !== undefined && value.bytes > PREVIEW_MAX_BYTES) throw new Error('文件超过 50 MiB 预览上限；请下载或拆分后预览。')
    if (version !== undefined && version !== value.version) throw new Error('文件在读取过程中发生变化；请重试。')
    version = value.version
    if (value.data.length > PREVIEW_WINDOW_BYTES || total + value.data.length > PREVIEW_MAX_BYTES) throw new Error('读取结果超过预览内存上限。')
    if (!value.data.length && !value.eof) throw new Error('文件读取停滞，未返回数据。')
    total += value.data.length
    chunks.push(value.data)
    if (value.eof) {
      if (value.bytes !== undefined && total !== value.bytes) throw new Error('文件长度不一致；请重试。')
      const output = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length }
      return output
    }
  }
}
