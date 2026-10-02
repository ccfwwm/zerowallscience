import { mkdir, readFile, rename } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { root } from '../build/paths.mjs'
import { preparePublishPackage } from './publish-package.mjs'

const source = resolve(process.cwd())
const manifest = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'))
const staging = resolve(source, manifest.publishConfig.directory)
const boundary = resolve(root, 'artifacts/dev/publish')
const subpath = relative(boundary, staging)
if (!subpath || subpath.startsWith('..') || isAbsolute(subpath)) throw new Error('Pack staging must remain within artifacts/dev/publish')
await mkdir(dirname(staging), { recursive: true })
await rename(staging, `${staging}.previous-${randomUUID()}`).catch(error => { if (error.code !== 'ENOENT') throw error })
await preparePublishPackage(source, staging)
console.log(`Prepared ${manifest.name}@${manifest.version} in ${staging}`)
