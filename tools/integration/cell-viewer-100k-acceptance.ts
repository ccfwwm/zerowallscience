/** Real source React -> Host -> h5py, with independent SciPy CSR reference. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { cpus, totalmem } from 'node:os'
import { ResearchStore } from '../../store/src/index.js'
import { CellViewerService } from '../../plugins/research/src/host/cell-viewer.js'

if (!process.argv.includes('--run')) throw new Error('Pass --run for the isolated 100k-cell acceptance.')
const require = createRequire(resolve('plugins/research/package.json'))
const viteRequire = createRequire(require.resolve('vitest/package.json'))
const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href)
const { chromium } = createRequire(resolve('desktop/package.json'))('playwright') as typeof import('playwright')
const root = resolve('.build/cell-viewer-100k-acceptance', new Date().toISOString().replaceAll(':', '-'))
await mkdir(root, { recursive: true })
const python = process.env.ZEROWALL_CELL_PYTHON || process.env.ZEROWALL_PYTHON || 'python'
const runPython = async (...args: string[]) => JSON.parse((await promisify(execFile)(python, ['-E', '-P', resolve('tools/integration/cell-100k-reference.py'), ...args], { windowsHide: true, maxBuffer: 4 * 1024 ** 2 })).stdout)
const fixture = await runPython('make', root)
const store = new ResearchStore(join(root, 'store.sqlite'))
const project = store.createProject({ name: 'Synthetic 100k CSR cells', rootPath: root })
const asset = store.createDataAsset({ projectId: project.id, name: '合成 100,000 cells · CSR · 20 donors', uri: pathToFileURL(fixture.path).href, location: 'local', mediaType: 'application/x-h5ad' })
let service = new CellViewerService(store)
const report: any = { status: 'running', scope: 'Source React/Host/Chromium synthetic 100k CSR acceptance; not packaged Electron, biological inference, or GPU hardware benchmark', fixture, hardware: { platform: process.platform, cpu: cpus()[0]?.model, logicalCpu: cpus().length, totalMemoryBytes: totalmem() }, requests: [], clientTimings: {}, errors: [], external: [], limits: { metadataRows: 2000, embeddingPoints: 200000, pythonOutputBytes: 32 * 1024 ** 2, requestBytes: 1024 ** 2, sourceFileBytes: 20 * 1024 ** 3, readerSeconds: 120, sampling: 'first N, not representative subsampling', transport: 'loopback HTTP test adapter, not Typert/Electron IPC', browserMemory: 'CDP JavaScript heap only; excludes renderer/GPU process resident memory', hostMemory: 'sampled Node RSS including Vite test harness', pythonMemory: 'peak RSS before JSON serialization, included in exported manifest' } }
let peakHostRss = process.memoryUsage().rss
const timer = setInterval(() => { peakHostRss = Math.max(peakHostRss, process.memoryUsage().rss) }, 25)
const app = "import React from 'react';import{createRoot}from'react-dom/client';import{CellViewer}from'/plugins/research/src/client/cell-viewer.tsx';const remote={scienceViewer:async input=>fetch('/fixture-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}).then(r=>r.json())};createRoot(document.getElementById('root')).render(React.createElement(CellViewer,{remote,sessionId:'fixture'}));"
const server = await createServer({ configFile: false, root: resolve('.'), cacheDir: join(root, 'vite-cache'), optimizeDeps: { noDiscovery: true, entries: [], include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'] }, server: { host: '127.0.0.1', port: 0, watch: null }, esbuild: { jsx: 'automatic' }, resolve: { alias: [{ find: /^react$/u, replacement: require.resolve('react') }, { find: /^react\/jsx-runtime$/u, replacement: require.resolve('react/jsx-runtime') }, { find: /^react\/jsx-dev-runtime$/u, replacement: require.resolve('react/jsx-dev-runtime') }, { find: /^react-dom\/client$/u, replacement: require.resolve('react-dom/client') }] }, plugins: [{
  name: 'cells-reference', configureServer(server: any) { server.middlewares.use(async (req: any, res: any, next: () => void) => {
    if (req.url === '/fixture-api' && req.method === 'POST') {
      res.setHeader('Content-Type', 'application/json'); const started = performance.now()
      try {
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 1024 ** 2) throw new Error('Request too large') }
        const input = JSON.parse(body)
        const value = input.action === 'list' ? { assets: store.listDataAssets(project.id), viewers: store.listViewerSessions(project.id) } : { cell: await service.execute(project, { ...input, action: input.action.slice(5), selection: input.cellSelection, camera: input.cellCamera }) }
        const output = JSON.stringify({ ok: true, value })
        report.requests.push({ action: input.action, milliseconds: performance.now() - started, responseBytes: Buffer.byteLength(output), hostRssBytes: process.memoryUsage().rss, selectedCells: value.cell?.selection?.count })
        res.end(output)
      } catch (error) { report.errors.push(String(error)); res.end(JSON.stringify({ ok: false, error: { message: String(error) } })) }
      return
    }
    if (req.url === '/fixture') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await server.transformIndexHtml('/fixture', '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>ZeroWall 100k cells</title><style>:root{--dsw-alias-border-l1:#d5dbe5;color:#16213b;background:#f4f7fb;font-family:system-ui}body{max-width:1200px;margin:20px auto;background:white;padding:20px}button,select,input{padding:6px;margin:4px}</style><div id="root"></div><script type="module" src="/fixture-entry.js"></script></html>')); return }
    next()
  }) }, resolveId(id: string) { if (id === '/fixture-entry.js') return '\0cells-entry' }, load(id: string) { if (id === '\0cells-entry') return app },
}] })
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  await server.listen(); browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'], timeout: 30000 })
  report.browser = { version: browser.version(), rendering: 'Chromium headless, SwiftShader software WebGL permitted' }
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } }); page.setDefaultTimeout(120000)
  const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable')
  page.on('pageerror', error => report.errors.push(error.message)); page.on('request', request => { if (/^https?:/u.test(request.url()) && !request.url().includes('127.0.0.1')) report.external.push(request.url()) })
  const waitIdle = async () => { await page.getByRole('button', { name: '刷新查看', exact: true }).waitFor(); await page.waitForFunction(() => { const b = Array.from(document.querySelectorAll('button')).find(e => e.textContent === '刷新查看'); return b && !b.disabled }); await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))) }
  const timed = async (name: string, fn: () => Promise<unknown>) => { const start = performance.now(); await fn(); await waitIdle(); report.clientTimings[name] = performance.now() - start; const { metrics } = await cdp.send('Performance.getMetrics'); report.clientTimings[name + 'JsHeapBytes'] = metrics.find(m => m.name === 'JSHeapUsedSize')?.value }
  await page.goto(new URL('/fixture', server.resolvedUrls!.local[0]).href)
  await page.getByLabel('H5AD 数据资产', { exact: true }).selectOption(asset.id)
  await timed('openToPaintMilliseconds', () => page.getByRole('button', { name: '打开', exact: true }).click())
  assert.match(await page.locator('body').innerText(), /100,000 点 · WebGL/)
  await page.screenshot({ path: join(root, '100k-open.png'), fullPage: true })
  await page.getByLabel('分组列', { exact: true }).selectOption('donor')
  await timed('donorGroupsMilliseconds', () => page.getByRole('button', { name: '刷新查看', exact: true }).click())
  await page.screenshot({ path: join(root, '100k-donors.png'), fullPage: true })
  await page.getByLabel('基因', { exact: true }).fill('G7')
  await timed('geneExpressionMilliseconds', () => page.getByRole('button', { name: '刷新查看', exact: true }).click())
  assert.match(await page.locator('body').innerText(), /G7 表达 0–2/)
  await timed('fullQcMilliseconds', () => page.getByRole('button', { name: '运行 QC', exact: true }).click())
  await page.getByRole('button', { name: '绘制多边形选区', exact: true }).click()
  const svg = page.getByRole('img', { name: 'X_umap scatter', exact: true }); const box = (await svg.boundingBox())!
  for (const [x, y] of [[145, 80], [380, 80], [380, 210], [145, 210]]) await page.mouse.click(box.x + x! / 520 * box.width, box.y + y! / 280 * box.height)
  await timed('wholeDataSelectionMilliseconds', () => page.getByRole('button', { name: '保存选区并核验全量细胞', exact: true }).click())
  await timed('selectionExportMilliseconds', () => page.getByRole('button', { name: '导出选中细胞 CSV', exact: true }).click())
  const selectionArtifact = store.listArtifacts(project.id).find(a => a.mediaType === 'text/csv')!
  assert.ok(selectionArtifact)
  await page.screenshot({ path: join(root, '100k-selected.png'), fullPage: true })
  const beforeZoom = performance.now(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -240)
  await page.waitForFunction(() => document.body.innerText.includes('缩放 1.62×'))
  report.clientTimings.zoomToVisibleMilliseconds = performance.now() - beforeZoom
  await timed('saveCameraMilliseconds', () => page.getByRole('button', { name: '保存视角', exact: true }).click())
  const saved = store.listViewerSessions(project.id)[0]!
  assert.equal(saved.state.groupBy, 'donor'); assert.equal(saved.state.gene, 'G7'); assert.ok(saved.state.selection); assert.ok(Number((saved.state.camera as any).zoom) > 1)
  service = new CellViewerService(store)
  await page.reload(); await page.getByLabel('恢复细胞视图', { exact: true }).selectOption(saved.id); await waitIdle()
  assert.equal(await page.getByLabel('基因', { exact: true }).inputValue(), 'G7'); assert.equal(await page.getByLabel('分组列', { exact: true }).inputValue(), 'donor')
  assert.match(await page.locator('body').innerText(), /缩放 1.62×/)
  const restored = store.listViewerSessions(project.id)[0]!
  assert.deepEqual(restored.state.selection, saved.state.selection); assert.deepEqual(restored.state.camera, saved.state.camera)
  await timed('analysisExportMilliseconds', () => page.getByRole('button', { name: '导出产物', exact: true }).click())
  await page.screenshot({ path: join(root, '100k-restored-export.png'), fullPage: true })
  const analysisArtifact = store.listArtifacts(project.id).find(a => a.mediaType === 'application/json')!
  report.reference = await runPython('check', root, fileURLToPath(analysisArtifact.uri), fileURLToPath(String(selectionArtifact.metadata.manifestUri)), fileURLToPath(selectionArtifact.uri))
  const manifest = JSON.parse(await readFile(fileURLToPath(analysisArtifact.uri), 'utf8'))
  report.pythonRuntime = manifest.runtime; report.artifacts = { selection: selectionArtifact, analysis: analysisArtifact }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.external, [])
  assert.ok(Math.max(...report.requests.map((r: any) => r.responseBytes)) < report.limits.pythonOutputBytes)
  assert.ok(manifest.runtime.peakResidentMemoryBytes > 0)
  report.status = 'passed'
  console.log(JSON.stringify({ status: report.status, output: root, reference: report.reference, timings: report.clientTimings }))
} catch (error) { report.status = 'failed'; report.failure = String(error); throw error }
finally { clearInterval(timer); report.peakHostRssBytes = peakHostRss; await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2)); await browser?.close(); await server.close(); store.close() }
