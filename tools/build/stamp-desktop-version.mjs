import { randomUUID } from 'node:crypto'
import { lstat, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Cache templates stay independent of the Desktop version. Replace only the
 * few branded files, atomically detaching their hard links before writing. */
export async function stampDesktopVersion(directory, version) {
  if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error('Invalid desktop version')
  let stamped = 0
  async function visit(path) {
    const info = await lstat(path)
    if (info.isSymbolicLink()) throw new Error(`Runtime template contains a link: ${path}`)
    if (info.isDirectory()) for (const name of await readdir(path)) await visit(join(path, name))
    else if (info.isFile() && /\.(?:js|mjs|cjs|html)$/u.test(path)) {
      const source = await readFile(path, 'utf8')
      if (!source.includes('__ZEROWALL_DESKTOP_VERSION__')) return
      const temporary = `${path}.${randomUUID()}.tmp`
      await writeFile(temporary, source.replaceAll('__ZEROWALL_DESKTOP_VERSION__', version), { flag: 'wx', mode: info.mode & 0o777 })
      await rename(temporary, path)
      stamped++
    }
  }
  const branded = join(directory, '@deepseek-ai')
  if (await lstat(branded).catch(error => error.code === 'ENOENT' ? undefined : Promise.reject(error))) await visit(branded)
  return stamped
}
