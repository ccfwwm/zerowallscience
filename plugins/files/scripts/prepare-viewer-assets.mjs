import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { contract } from '../../../tools/build/paths.mjs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const require = createRequire(resolve(root, 'package.json'))
const pdf = dirname(require.resolve('viewer-pdfjs/package.json'))
const core = dirname(require.resolve('@open-file-viewer/core'))
const coreRequire = createRequire(require.resolve('@open-file-viewer/core'))
const leaflet = dirname(coreRequire.resolve('leaflet/package.json'))
const target = resolve(contract.dev, '@zerowallscience__plugin-files/lib/viewer-assets')
await mkdir(resolve(target, 'build'), { recursive: true })
await cp(resolve(pdf, 'build/pdf.worker.mjs'), resolve(target, 'build/pdf.worker.mjs'))
for (const name of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) await cp(resolve(pdf, name), resolve(target, name), { recursive: true })
await cp(resolve(leaflet, 'dist'), resolve(target, 'leaflet'), { recursive: true })
const hashes = { 'viewer.css': createHash('sha256').update(await readFile(resolve(core, 'style.css'))).digest('hex') }
async function fingerprint(directory, prefix = '') {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const key = prefix + entry.name
    if (entry.isDirectory()) await fingerprint(resolve(directory, entry.name), key + '/')
    else if (entry.name !== 'asset-manifest.json') hashes[key] = createHash('sha256').update(await readFile(resolve(directory, entry.name))).digest('hex')
  }
}
await fingerprint(target)
await writeFile(resolve(target, 'asset-manifest.json'), JSON.stringify({ version: createHash('sha256').update(JSON.stringify(hashes)).digest('hex'), files: hashes }, null, 2) + '\n')
console.log('Prepared offline PDF worker, fonts, CMaps, WASM and GIS styles.')
