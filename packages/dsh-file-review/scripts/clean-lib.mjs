#!/usr/bin/env node

import { rm, lstat, realpath, readdir } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'lib')

if (dirname(output) !== root || basename(output) !== 'lib') {
  throw new Error(`refusing to clean unexpected build output: ${output}`)
}

const info = await lstat(output).catch(error => { if (error.code !== 'ENOENT') throw error })
if (info?.isSymbolicLink()) {
  const physical = await realpath(output)
  const artifacts = resolve(process.env.ZEROWALL_ARTIFACT_ROOT || resolve(root, '../../artifacts'))
  const expected = resolve(artifacts, 'dev/dsh-file-review/lib')
  if (physical.toLowerCase() !== expected.toLowerCase()) throw new Error('Refusing to clean an unknown generated output link')
  // Keep the compatibility junction. Removing it makes the next compiler
  // silently recreate generated output inside the source checkout.
  for (const name of await readdir(physical)) await rm(resolve(physical, name), { recursive: true, force: true })
} else await rm(output, { recursive: true, force: true })
console.log('clean-lib: removed generated lib output.')
