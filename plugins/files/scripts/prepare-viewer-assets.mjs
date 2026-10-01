import { readFile, writeFile, mkdir, cp } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const require = createRequire(resolve(root, 'package.json'))
const pdf = dirname(require.resolve('viewer-pdfjs/package.json'))
const core = dirname(require.resolve('@open-file-viewer/core'))
const coreRequire = createRequire(require.resolve('@open-file-viewer/core'))
const leaflet = dirname(coreRequire.resolve('leaflet/package.json'))
await writeFile(resolve(root, 'src/client/viewer-style.ts'), `// Generated from pinned @open-file-viewer/core@0.1.49.\nexport default ${JSON.stringify(await readFile(resolve(core, 'style.css'), 'utf8'))}\n`)
const target = resolve(root, 'lib/viewer-assets')
await mkdir(resolve(target, 'build'), { recursive: true })
await cp(resolve(pdf, 'build/pdf.worker.mjs'), resolve(target, 'build/pdf.worker.mjs'))
for (const name of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) await cp(resolve(pdf, name), resolve(target, name), { recursive: true })
await cp(resolve(leaflet, 'dist'), resolve(target, 'leaflet'), { recursive: true })
console.log('Prepared offline PDF worker, fonts, CMaps, WASM and GIS styles.')
