import { readdir, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Remove only this compiler's direct output files; never recurse or follow links. */
export async function cleanHostOutput(directory = fileURLToPath(new URL('../lib/', import.meta.url))) {
  const output = resolve(directory)
  const entries = await readdir(output, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const removed = []
  for (const entry of entries) {
    if (!entry.isFile() || !/^(?:index|chunk-[A-Z0-9]+)\.js$/u.test(entry.name)) continue
    await unlink(join(output, entry.name))
    removed.push(entry.name)
  }
  return removed.sort()
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const removed = await cleanHostOutput()
  console.log(`[clean-host-output] removed ${removed.length} generated Host files`)
}
