/** Actual million-event source React + FlowService + Chromium, using independent NumPy/FlowIO reference. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { cpus, platform, release, totalmem } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { ResearchStore } from '../../store/src/index.js'
import { FlowService } from '../../plugins/research/src/host/flow.js'
import { FLOW_STREAM_LIMITS } from '../../plugins/research/src/host/flow-reader.js'

if (!process.argv.includes('--run')) throw new Error('Pass --run for the million-event UI acceptance check.')
const require = createRequire(resolve('plugins/research/package.json'))
const viteRequire = createRequire(require.resolve('vitest/package.json'))
const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href)
const { chromium } = createRequire(resolve('desktop/package.json'))('playwright') as typeof import('playwright')
const root = resolve('.build', 'flow-viewer-smoke', new Date().toISOString().replaceAll(':', '-'))
await mkdir(root, { recursive: true })
const referenceRoot = resolve('.build/flow-reference/streaming-8192-20260922')
const reference = JSON.parse(await readFile(join(referenceRoot, 'reference.json'), 'utf8'))
assert.equal(reference.count, 1_000_000)
const store = new ResearchStore(join(root, 'store.sqlite')); const service = new FlowService(store)
// The benchmark FCS stays in its existing project root; isolated SQLite is in this run directory.
const project = store.createProject({ name: '百万事件流式交互基准', rootPath: referenceRoot })
const asset = store.createDataAsset({ projectId: project.id, name: '百万合成事件 · 非生物学结果', uri: pathToFileURL(reference.file.path).href, location: 'local', mediaType: 'application/octet-stream', checksum: reference.file.sha256, checksumAlgorithm: 'sha256' })
const requests: Array<{ action: string; responseBytes: number; rawPreview: number; analyzedPreview: number; hostMs: number }> = []
const errors: string[] = []; const timing: Record<string, number> = {}
const app = `import React from 'react';import {createRoot} from 'react-dom/client';import {FlowViewer} from '/plugins/research/src/client/flow-viewer.tsx';const remote={scienceViewer:async input=>fetch('/fixture-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}).then(r=>r.json())};createRoot(document.getElementById('root')).render(React.createElement(FlowViewer,{remote,sessionId:'fixture'}));`
const server = await createServer({ configFile: false, root: resolve('.'), cacheDir: join(root, 'vite-cache'), optimizeDeps: { noDiscovery: true, entries: [], include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'] }, server: { host: '127.0.0.1', port: 0, watch: null }, esbuild: { jsx: 'automatic' }, resolve: { alias: [{ find: /^react$/u, replacement: require.resolve('react') }, { find: /^react\/jsx-runtime$/u, replacement: require.resolve('react/jsx-runtime') }, { find: /^react\/jsx-dev-runtime$/u, replacement: require.resolve('react/jsx-dev-runtime') }, { find: /^react-dom\/client$/u, replacement: require.resolve('react-dom/client') }] }, plugins: [{
  name: 'flow-viewer-smoke', configureServer(server: any) { server.middlewares.use(async (req: any, res: any, next: () => void) => {
    if (req.url === '/fixture-api' && req.method === 'POST') {
      res.setHeader('Content-Type', 'application/json')
      try {
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 1024 * 1024) throw new Error('Request too large') }
        const request = JSON.parse(body); const start = performance.now()
        const value = request.action === 'list' ? { assets: store.listDataAssets(project.id), viewers: store.listViewerSessions(project.id) } : { flow: await service.execute(project, { ...request.flow, ...request, action: request.action.replace(/^flow_/u, '') }) }
        const flow = 'flow' in value ? value.flow : undefined
        if (flow?.artifact) store.createDataAsset({ projectId: project.id, name: '已导出标准 GatingML', uri: String(flow.artifact.metadata.gatingMlUri), location: 'local', mediaType: 'application/xml', checksum: String(flow.artifact.metadata.gatingMlSha256), checksumAlgorithm: 'sha256' })
        assert.ok((flow?.dataset?.events.length ?? 0) <= 5000); assert.ok((flow?.analysis?.preview.length ?? 0) <= 10000)
        const response = JSON.stringify({ ok: true, value }); requests.push({ action: request.action, responseBytes: Buffer.byteLength(response), rawPreview: flow?.dataset?.events.length ?? 0, analyzedPreview: flow?.analysis?.preview.length ?? 0, hostMs: performance.now() - start }); res.end(response)
      } catch (error) { errors.push(String(error)); res.end(JSON.stringify({ ok: false, error: { message: String(error) } })) }
      return
    }
    if (req.url === '/fixture') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await server.transformIndexHtml('/fixture', '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>ZeroWall Flow QA</title><style>:root{--dsw-alias-border-l1:#d5dbe5;color:#16213b;background:#f4f7fb;font-family:system-ui}body{max-width:1100px;margin:20px auto;background:white;padding:20px}button,select,input{padding:5px;margin:3px}td,th{text-align:left;padding:4px 12px}</style><div id="root"></div><script type="module" src="/fixture-entry.js"></script></html>')); return }
    next()
  }) }, resolveId(id: string) { if (id === '/fixture-entry.js') return '\0fixture-entry' }, load(id: string) { if (id === '\0fixture-entry') return app },
} ] })
const monitor = spawn(resolve('.build/flow-reference-venv/Scripts/python.exe'), ['-c', `import psutil,sys,time,json,pathlib
p=psutil.Process(int(sys.argv[1])); root=pathlib.Path(sys.argv[2]); n=0; host=0; hostpeak=0; tree=0; children=0
while not (root/'monitor.stop').exists():
 try:
  info=p.memory_info(); host=max(host,info.rss); hostpeak=max(hostpeak,getattr(info,'peak_wset',info.rss)); current=info.rss; child=0
  for c in p.children(recursive=True):
   if c.pid==__import__('os').getpid(): continue
   try: child+=c.memory_info().rss
   except psutil.Error: pass
  children=max(children,child); tree=max(tree,current+child); n+=1
 except psutil.Error: break
 time.sleep(.02)
(root/'memory.json').write_text(json.dumps({'sampleIntervalMs':20,'samples':n,'hostSampledPeakRssBytes':host,'hostOsPeakWorkingSetBytes':hostpeak,'sampledChildrenPeakSumRssBytes':children,'sampledTreePeakSumRssBytes':tree,'scope':'Host plus Chromium/Vite children; sum RSS may double-count shared pages; monitor process excluded'}))`, String(process.pid), root], { windowsHide: true, stdio: 'pipe' })
const monitored = new Promise<void>((done, reject) => { monitor.on('exit', code => code === 0 ? done() : reject(new Error(`Monitor exit ${code}`))); monitor.on('error', reject) })
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  await server.listen(); browser = await chromium.launch({ headless: true, timeout: 30000 })
  const page = await browser.newPage({ viewport: { width: 1360, height: 1100 } }); page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(error.message))
  await page.goto(new URL('/fixture', server.resolvedUrls!.local[0]).href)
  await page.getByLabel('流式资产', { exact: true }).selectOption(asset.id)
  let start = performance.now(); await page.getByRole('button', { name: '打开 FCS', exact: true }).click(); await page.getByRole('img', { name: '流式散点预览' }).waitFor(); await page.waitForFunction(() => document.querySelectorAll('svg circle').length === 5000); timing.firstScatterMs = performance.now() - start
  await page.screenshot({ path: join(root, 'first-screen.png'), fullPage: true })
  for (let index = 0; index < 2; index++) {
    await page.getByRole('button', { name: '新增矩形门', exact: true }).click(); const gate = reference.cases[0].parameters.gates[index]; const id = `gate-${index + 1}`
    if (index) await page.getByLabel(`${id} 父门`, { exact: true }).selectOption('gate-1')
    for (const axis of ['x', 'y']) for (const bound of ['min', 'max']) await page.getByLabel(`${id} ${axis} ${bound}`, { exact: true }).fill(String(gate[axis][bound]))
    if (gate.polygon) { await page.getByLabel(`${id} 多边形顶点`, { exact: true }).fill(JSON.stringify(gate.polygon)); await page.getByRole('button', { name: '应用多边形', exact: true }).nth(index).click() }
  }
  start = performance.now(); await page.getByRole('button', { name: '计算门控', exact: true }).click(); await page.getByLabel('流式分析结果', { exact: true }).getByText(`Gate 2: ${reference.cases[0].reference.gates[1].count}`, { exact: false }).waitFor(); timing.gatingToVisibleResultsMs = performance.now() - start
  await page.getByRole('button', { name: '计算门控', exact: true }).waitFor({ state: 'visible' }); await page.waitForFunction(() => !document.querySelector('section > fieldset')?.hasAttribute('disabled'))
  start = performance.now(); await page.reload(); await page.getByRole('tab').first().click(); await page.getByLabel('流式分析结果', { exact: true }).waitFor(); timing.reloadRestoreToVisibleResultsMs = performance.now() - start
  assert.equal(await page.getByLabel('gate-2 父门', { exact: true }).inputValue(), 'gate-1'); assert.equal(await page.getByLabel('gate-2 x min', { exact: true }).inputValue(), '250')
  assert.equal(await page.getByLabel('gate-2 多边形顶点', { exact: true }).inputValue(), JSON.stringify(reference.cases[0].parameters.gates[1].polygon))
  start = performance.now(); await page.getByRole('button', { name: '导出结果/GatingML', exact: true }).click(); await page.getByRole('status').filter({ hasText: '已登记产物' }).waitFor(); timing.exportToRegisteredArtifactMs = performance.now() - start
  await page.screenshot({ path: join(root, 'gates-restored-exported.png'), fullPage: true })
  const artifact = store.listArtifacts(project.id)[0]!; assert.ok(artifact); const bytes = await readFile(fileURLToPath(artifact.uri)); assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.checksum)
  const output = JSON.parse(bytes.toString()); const expected = reference.cases[0].reference
  for (let index = 0; index < 2; index++) { assert.equal(output.analysis.gates[index].count, expected.gates[index].count); for (const channel of reference.channels) for (const statistic of ['mean', 'median']) assert.ok(Math.abs(output.analysis.gates[index].statistics[channel][statistic] - expected.gates[index].statistics[channel][statistic]) <= reference.tolerances[`${statistic}Absolute`]) }
  assert.ok(output.analysis.preview.length <= 10000); assert.equal(output.analysis.eventCount, 1_000_000); assert.deepEqual(errors, [])
  const xmlAsset = store.listDataAssets(project.id).find(item => item.mediaType === 'application/xml')!; assert.ok(xmlAsset)
  await page.getByLabel('GatingML 资产', { exact: true }).selectOption(xmlAsset.id)
  start = performance.now(); await page.getByRole('button', { name: '导入 GatingML 并计算', exact: true }).click(); await page.waitForFunction(() => !document.querySelector('section > fieldset')?.hasAttribute('disabled')); timing.gatingMlImportToVisibleResultsMs = performance.now() - start
  assert.deepEqual((store.listViewerSessions(project.id)[0]!.state.gatingMlSource as any).assetId, xmlAsset.id)
  await page.getByLabel('流式分析结果', { exact: true }).getByText(`Gate 2: ${reference.cases[0].reference.gates[1].count}`, { exact: false }).waitFor()
  await page.screenshot({ path: join(root, 'gatingml-imported.png'), fullPage: true })
  const renderedPoints = await page.locator('svg circle').count(); assert.equal(renderedPoints, 5000)
  const browserHeap = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory ? JSON.parse(JSON.stringify((performance as any).memory, ['usedJSHeapSize', 'totalJSHeapSize', 'jsHeapSizeLimit'])) : null)
  await writeFile(join(root, 'monitor.stop'), ''); await monitored
  const report = { status: 'passed', scope: 'Actual source React, FlowService, isolated SQLite and headless Chromium; not packaged Electron or FlowJo compatibility', measuredAt: new Date().toISOString(), hardware: { platform: platform(), release: release(), cpu: cpus()[0]?.model, logicalCpu: cpus().length, totalMemoryBytes: totalmem(), node: process.version }, input: reference.file, count: reference.count, independentReference: reference.referenceRuntime, timing, requests, renderedPoints, browserHeap, memory: JSON.parse(await readFile(join(root, 'memory.json'), 'utf8')), streamingLimits: FLOW_STREAM_LIMITS, storedViewer: store.listViewerSessions(project.id)[0], artifact, screenshots: ['first-screen.png', 'gates-restored-exported.png', 'gatingml-imported.png'], errors }
  await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: 'passed', root, timing, memory: report.memory, requests }))
} finally { await writeFile(join(root, 'monitor.stop'), ''); await monitored; await browser?.close(); await server.close(); store.close() }
