import { cp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { join, dirname, relative } from 'node:path'
import { root, contract } from '../build/paths.mjs'
import { loadResourceSigner } from '../release/resource-signing.mjs'
import { signCatalog } from '../release/resource-catalog.mjs'
const source = join(root, 'plugins/python')
const worker = join(source, 'lib/worker')
const require = createRequire(join(source, 'package.json'))
for (const name of ['yauzl', 'pend']) {
  const input = dirname(await realpath(require.resolve(`${name}/package.json`)))
  await mkdir(join(worker, 'modules'), { recursive: true })
  await cp(input, join(worker, 'modules', name), { recursive: true, dereference: true })
}
const files = []
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await collect(path)
    else if (entry.isFile() && !['worker-manifest.json', 'development-keys.json'].includes(entry.name)) {
      const bytes = await readFile(path)
      files.push({ path: relative(worker, path).replaceAll('\\', '/'), size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
    } else if (!entry.isFile()) throw new Error('Unsafe Python worker closure')
  }
}
await collect(worker)
const signer = await loadResourceSigner({ root, cacheRoot: contract.cache })
if (signer.localOnly) await writeFile(join(worker, 'development-keys.json'), JSON.stringify(signer.keys))
else await rm(join(worker, 'development-keys.json'), { force: true })
const version = JSON.parse(await readFile(join(source, 'package.json'), 'utf8')).version
await writeFile(join(worker, 'worker-manifest.json'), JSON.stringify(signCatalog({ schema: 1, abi: 1, version, localOnly: signer.localOnly, entry: 'python-updater-worker.js', files: files.sort((a,b) => a.path.localeCompare(b.path)) }, signer.privateKey, signer.keyId), null, 2) + '\n')
