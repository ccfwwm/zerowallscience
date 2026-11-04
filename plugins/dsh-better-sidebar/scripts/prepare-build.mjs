// Keep the upstream lib contract without removing the artifact junction.
import { lstat, mkdir, realpath, symlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contract } from '../../../tools/build/paths.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(contract.dev, 'dsh-better-sidebar', 'lib')
const link = join(root, 'lib')
await mkdir(output, { recursive: true })
const existing = await lstat(link).catch(error => {
  if (error.code !== 'ENOENT') throw error
})
if (existing) {
  if (!existing.isSymbolicLink() || await realpath(link) !== await realpath(output)) {
    throw new Error('Preserve existing lib output; run the repository output migration before building')
  }
} else {
  await symlink(output, link, process.platform === 'win32' ? 'junction' : 'dir')
}
