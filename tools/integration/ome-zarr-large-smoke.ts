/** Real 10 GiB uncompressed synthetic directory; bounded source Host and browser acceptance. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { cpus, totalmem, release } from 'node:os'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ResearchStore } from '../../store/src/index.js'
import { ImageViewerService } from '../../plugins/research/src/host/image-viewer.js'
import { registerLocalAsset } from '../../plugins/research/src/host/local-assets.js'
import { readOmeZarrMetadata, readOmeZarrPlane } from '../../plugins/research/src/host/ome-zarr.js'

if (!process.argv.includes('--run')) throw new Error('Pass --run to generate and verify a real 10 GiB synthetic OME-Zarr dataset.')
const root = resolve('.build', 'ome-zarr-large-smoke', new Date().toISOString().replaceAll(':', '-'))
const reuse = process.argv.find(value => value.startsWith('--reuse='))?.slice(8)
const dataset = reuse ? resolve(reuse) : join(root, 'volume.zarr'); await mkdir(root, { recursive: true })
if (!reuse) await mkdir(join(dataset, '0'), { recursive: true })
const planes = 5120; const width = 1024; const height = 1024; const chunkBytes = width * height * 2
const attrs = { multiscales: [{ version: '0.4', axes: [{ name: 'z', type: 'space', unit: 'micrometer' }, { name: 'y', type: 'space', unit: 'micrometer' }, { name: 'x', type: 'space', unit: 'micrometer' }], datasets: [{ path: '0', coordinateTransformations: [{ type: 'scale', scale: [2, 0.5, 0.5] }] }] }] }
if (!reuse) {
  await writeFile(join(dataset, '.zattrs'), JSON.stringify(attrs))
  await writeFile(join(dataset, '0', '.zarray'), JSON.stringify({ zarr_format: 2, shape: [planes, height, width], chunks: [1, height, width], dtype: '<u2', compressor: null, fill_value: 0, order: 'C' }))
}
const pattern = (z: number) => {
  const output = Buffer.alloc(chunkBytes)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) output.writeUInt16LE((z + x + 3 * y) % 256, (y * width + x) * 2)
  return output
}
const startedGeneration = performance.now(); let actualBytes = 0
for (let z = 0; z < planes; z++) {
  const path = join(dataset, '0', `${z}.0.0`)
  if (!reuse) await writeFile(path, pattern(z), { flag: 'wx' })
  actualBytes += (await stat(path)).size
  if ((z + 1) % 1024 === 0) console.log(JSON.stringify({ generatedGiB: actualBytes / 1024 ** 3 }))
}
assert.equal(actualBytes, 10 * 1024 ** 3)
const generationMs = performance.now() - startedGeneration
const store = new ResearchStore(join(root, 'store.sqlite'))
const project = store.createProject({ name: 'Ten GiB synthetic OME-Zarr', rootPath: reuse ? resolve(dataset, '..') : root })
let start = performance.now(); const asset = await registerLocalAsset(store, project, dataset); const registrationMs = performance.now() - start
const service = new ImageViewerService(store)
const require = createRequire(resolve('plugins/research/package.json'))
const viteRequire = createRequire(require.resolve('vitest/package.json'))
const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href)
const { chromium } = createRequire(resolve('desktop/package.json'))('playwright') as typeof import('playwright')
const requests: Array<{ action: string; ms: number; bytes: number }> = []
let peakHostRss = process.memoryUsage().rss; const monitor = setInterval(() => { peakHostRss = Math.max(peakHostRss, process.memoryUsage().rss) }, 20)
const app = "import React from 'react';import {createRoot} from 'react-dom/client';import {ImageViewer} from '/plugins/research/src/client/image-viewer.tsx';const remote={scienceViewer:async input=>fetch('/fixture-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}).then(r=>r.json())};createRoot(document.getElementById('root')).render(React.createElement(ImageViewer,{remote,sessionId:'fixture'}));"
const server = await createServer({ configFile: false, root: resolve('.'), cacheDir: join(root, 'vite-cache'), optimizeDeps: { noDiscovery: true, entries: [], include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'] }, server: { host: '127.0.0.1', port: 0, watch: null }, esbuild: { jsx: 'automatic' }, resolve: { alias: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'].map(name => ({ find: new RegExp(`^${name}$`), replacement: require.resolve(name) })) }, plugins: [{
  name: 'ome-zarr-reference', configureServer(server: any) { server.middlewares.use(async (req: any, res: any, next: () => void) => {
    if (req.url === '/fixture-api' && req.method === 'POST') {
      res.setHeader('Content-Type', 'application/json')
      try {
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 1024 ** 2) throw new Error('Request too large') }
        const input = JSON.parse(body); const started = performance.now()
        const value = input.action === 'list' ? { assets: store.listDataAssets(project.id), viewers: store.listViewerSessions(project.id) } : input.action === 'native_status' ? { launches: [] } : await service.execute(project, input)
        const payload = JSON.stringify({ ok: true, value }); requests.push({ action: input.action, ms: performance.now() - started, bytes: Buffer.byteLength(payload) }); res.end(payload)
      } catch (error) { res.end(JSON.stringify({ ok: false, error: { message: String(error) } })) }
      return
    }
    if (req.url === '/fixture') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await server.transformIndexHtml('/fixture', '<html lang="zh-CN"><meta charset="utf-8"><title>10 GiB OME-Zarr QA</title><style>body{font-family:system-ui;margin:24px;background:#fff;color:#16213b}button,input,select{margin:4px;padding:5px}</style><div id="root"></div><script type="module" src="/fixture-entry.js"></script></html>')); return }
    next()
  }) }, resolveId(id: string) { if (id === '/fixture-entry.js') return '\0zarr-entry' }, load(id: string) { if (id === '\0zarr-entry') return app },
}] })
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  await server.listen(); browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } }); page.setDefaultTimeout(30000)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto(new URL('/fixture', server.resolvedUrls!.local[0]).href)
  await page.getByLabel('内置图像资产', { exact: true }).selectOption(asset.id)
  start = performance.now(); await page.getByRole('button', { name: '打开图像', exact: true }).click()
  await page.getByRole('img', { name: '图像 ROI 画布', exact: true }).waitFor()
  await page.waitForFunction(() => { const image = document.querySelector('svg image'); return image?.getAttribute('href')?.startsWith('data:image/png;base64,') })
  // Decode the actual browser preview: accepting only an img element missed black output.
  const displayedPixels = await page.evaluate(async () => {
    const href = document.querySelector('svg image')!.getAttribute('href')!
    const bitmap = await createImageBitmap(await (await fetch(href)).blob())
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0)
    return [...context.getImageData(0, 0, 256, 1).data].filter((_, i) => i % 4 === 0)
  })
  assert.deepEqual(displayedPixels, Array.from({ length: 256 }, (_, i) => i))
  const firstScreenMs = performance.now() - start
  await page.screenshot({ path: join(root, 'first-screen.png'), fullPage: true })
  start = performance.now()
  await page.getByLabel('OME Z 位置', { exact: true }).fill('5119')
  await page.getByRole('button', { name: '保存图像视角', exact: true }).click()
  await page.getByLabel('OME 轴位置', { exact: true }).filter({ hasText: '当前页 5119' }).waitFor()
  const changePlaneMs = performance.now() - start
  start = performance.now(); await page.reload(); await page.getByRole('tab').first().click()
  await page.getByLabel('OME 轴位置', { exact: true }).filter({ hasText: '当前页 5119' }).waitFor()
  assert.equal(await page.getByLabel('OME Z 位置', { exact: true }).inputValue(), '5119')
  const restoreMs = performance.now() - start
  await page.screenshot({ path: join(root, 'last-plane-restored.png'), fullPage: true })
  // The source plane is validated independently of display normalization and PNG.
  const metadata = await readOmeZarrMetadata(dataset)
  const numerical: unknown[] = []
  for (const z of [0, 255, 5119]) {
    const plane = await readOmeZarrPlane(dataset, metadata, z)
    const expected = pattern(z); assert.deepEqual(plane.raw, expected)
    numerical.push({ z, sha256: createHash('sha256').update(plane.raw).digest('hex'), decodedBytes: plane.raw.length })
  }
  await writeFile(join(root, 'browser-state.txt'), await page.locator('body').innerText())
  assert.deepEqual(errors, [])
  assert.ok(Math.max(...requests.map(item => item.bytes)) < 2 * 1024 ** 2)
  const report = { status: 'passed', scope: 'Actual 10 GiB uncompressed Zarr v2 source Host/React/Chromium viewing; not tiled XY, OME-Zarr analysis, packaged Electron or full pixel hash', dataset, input: { actualChunkFileBytes: actualBytes, files: planes, sparse: false, shape: [planes, height, width], chunks: [1, height, width], dtype: '<u2', reused: Boolean(reuse), cacheState: 'OS cache not dropped; local warm-cache acceptance' }, hardware: { os: release(), cpu: cpus()[0]?.model, logicalCpu: cpus().length, memoryBytes: totalmem(), node: process.version }, timings: { generationOrStatMs: generationMs, registrationMs, firstScreenMs, changePlaneMs, restoreMs }, peakHostRss, memoryScope: 'Sampled Node RSS includes Vite and Host; excludes Chromium processes.', requests, numerical, errors }
  await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: 'passed', root, firstScreenMs, peakHostRss }))
} finally { clearInterval(monitor); await browser?.close(); await server.close(); store.close() }
