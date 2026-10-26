import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { promisify } from 'node:util'
const run = promisify(execFile)
export async function extractSkill(file, target, options) {
  return extractBundle(file, target, 'SKILL.md', options)
}
export async function extractBundle(file, target, requiredFile, { signal } = {}) {
  signal?.throwIfAborted()
  const options = { maxBuffer: 4 * 1024 ** 2, windowsHide: true, signal, timeout: 120_000 }
  const { stdout: names } = await run('tar', ['-tf', file], options)
  const { stdout: listing } = await run('tar', ['-tvf', file], options)
  if (listing.split(/\r?\n/).some(line => line && !['-', 'd'].includes(line[0]))) throw new Error('Skill archive cannot contain links or special files')
  for (const name of names.split(/\r?\n/).filter(Boolean)) {
    if (name.startsWith('/') || name.includes('\\') || name.includes(':') || name.split('/').includes('..')) throw new Error('Unsafe Skill archive path')
  }
  if (!requiredFile || requiredFile.startsWith('/') || requiredFile.includes('\\') || requiredFile.includes(':') || requiredFile.split('/').includes('..')) throw new Error('Unsafe bundle entrypoint')
  if (!names.split(/\r?\n/).some(name => name === requiredFile || name === './' + requiredFile)) throw new Error('Archive must contain its declared entrypoint')
  await mkdir(target, { recursive: true })
  await run('tar', ['-xf', file, '-C', target], options)
  return target
}
