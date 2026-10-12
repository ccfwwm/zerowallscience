import { createWriteStream } from 'node:fs'
import { lstat, mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { isAbsolute, join, relative, resolve } from 'node:path'

function contained(root: string, path: string): boolean {
  const local = relative(root, path)
  return local !== '..' && !local.startsWith('../') && !local.startsWith('..\\') && !isAbsolute(local)
}
async function resultDirectory(workspace: string, create: boolean): Promise<string> {
  const root = await realpath(resolve(workspace))
  let directory = root
  for (const name of ['.zerowall', 'python-results']) {
    directory = join(directory, name)
    if (create) await mkdir(directory).catch(error => { if (error.code !== 'EEXIST') throw error })
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink() || !contained(root, await realpath(directory))) throw new Error('PYTHON_RESULT_PATH: linked result directory is not allowed.')
  }
  return directory
}
export async function createPythonResult(workspace: string) {
  const directory = await resultDirectory(workspace, true)
  const id = randomUUID()
  const stdout = createWriteStream(join(directory, `${id}.stdout`), { flags: 'wx' })
  const stderr = createWriteStream(join(directory, `${id}.stderr`), { flags: 'wx' })
  return { id, stdout, stderr, async complete(metadata: { exitCode: number; timedOut: boolean; python: string; cancelled?: boolean; error?: string }) {
    await writeFile(join(directory, `${id}.json`), JSON.stringify({ ...metadata, schema: 1 }), { flag: 'wx' })
  } }
}
export async function readPythonResult(workspace: string, id: string, stream: 'stdout' | 'stderr', offset = 0, limit = 4000) {
  if (!/^[a-f0-9-]{36}$/u.test(id) || !['stdout', 'stderr'].includes(stream) || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid Python result page.')
  const directory = await resultDirectory(workspace, false)
  const safeFile = async (suffix: string) => {
    const path = join(directory, `${id}.${suffix}`); const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || !contained(directory, await realpath(path))) throw new Error('PYTHON_RESULT_PATH: linked result file is not allowed.')
    return path
  }
  const metadata = JSON.parse(await readFile(await safeFile('json'), 'utf8'))
  const file = await open(await safeFile(stream), 'r')
  try {
    const { size } = await file.stat()
    // Offsets are byte offsets. Leave a partial UTF-8 codepoint for the next page.
    const buffer = Buffer.alloc(Math.min(8000, limit))
    const { bytesRead } = await file.read(buffer, 0, buffer.length, offset)
    let end = bytesRead
    if (offset + end < size) {
      let start = end - 1
      while (start >= 0 && (buffer[start]! & 0xc0) === 0x80) start--
      if (start >= 0) {
        const lead = buffer[start]!; const length = lead < 0x80 ? 1 : lead < 0xe0 ? 2 : lead < 0xf0 ? 3 : 4
        if (start + length > end) end = start
      }
    }
    // A page smaller than one codepoint must still make progress.
    if (end === 0 && bytesRead > 0) {
      const extra = Buffer.alloc(4); const read = await file.read(extra, 0, 4, offset)
      const lead = extra[0]!; end = Math.min(read.bytesRead, lead < 0x80 ? 1 : lead < 0xe0 ? 2 : lead < 0xf0 ? 3 : 4)
      return { result_id: id, exitCode: metadata.exitCode, offset, total: size, text: extra.subarray(0, end).toString('utf8'), next_offset: offset + end < size ? offset + end : null }
    }
    return { result_id: id, exitCode: metadata.exitCode, timedOut: metadata.timedOut, cancelled: metadata.cancelled ?? false, offset, total: size, text: buffer.subarray(0, end).toString('utf8'), next_offset: offset + end < size ? offset + end : null }
  } finally { await file.close() }
}
