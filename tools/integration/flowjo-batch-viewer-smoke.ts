/** Real source React + Host FlowJo batch acceptance with two compatible FCS sources and one intentional refusal. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ResearchStore } from '../../store/src/index.js'
import { FlowService } from '../../plugins/research/src/host/flow.js'

if (!process.argv.includes('--run')) throw new Error('Pass --run to execute the local Chromium FlowJo batch acceptance check.')

function padded(value: number): string { return String(value).padStart(8, ' ') }
function fcs(events: number[][]): Uint8Array {
  const text = `|$TOT|${events.length}|$PAR|2|$DATATYPE|F|$BYTEORD|1,2,3,4|$P1N|FSC-A|$P1S|FSC-A|$P1B|32|$P1R|1024|$P2N|SSC-A|$P2S|SSC-A|$P2B|32|$P2R|1024|`
  const textStart = 58; const textEnd = textStart + Buffer.byteLength(text) - 1; const dataStart = textEnd + 1; const dataEnd = dataStart + events.length * 8 - 1
  const bytes = Buffer.alloc(dataEnd + 1); bytes.write('FCS3.0', 0, 'ascii'); bytes.write(padded(textStart), 10, 'ascii'); bytes.write(padded(textEnd), 18, 'ascii'); bytes.write(padded(dataStart), 26, 'ascii'); bytes.write(padded(dataEnd), 34, 'ascii'); bytes.write(text, textStart, 'utf8')
  let offset = dataStart; for (const row of events) for (const value of row) { bytes.writeFloatLE(value, offset); offset += 4 }
  return bytes
}
function workspace(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Workspace xmlns:gating="http://www.isac-net.org/std/Gating-ML/v2.0/gating" xmlns:data-type="http://www.isac-net.org/std/Gating-ML/v2.0/datatypes" version="20.0" flowJoVersion="10.6.2"><Matrices/><Groups><GroupNode name="All"><Group><SampleRefs><SampleRef sampleID="1"/><SampleRef sampleID="2"/></SampleRefs></Group></GroupNode></Groups><SampleList><Sample><DataSet uri="sample-1" sampleID="1"/><Transformations/><SampleNode name="sample-1"><Subpopulations><Population name="Cells"><Gate><gating:RectangleGate gating:id="s1"><gating:dimension gating:min="0" gating:max="10"><data-type:fcs-dimension data-type:name="FSC-A"/></gating:dimension></gating:RectangleGate></Gate></Population></Subpopulations></SampleNode></Sample><Sample><DataSet uri="sample-2" sampleID="2"/><Transformations/><SampleNode name="sample-2"><Subpopulations><Population name="Cells"><Gate><gating:RectangleGate gating:id="s2"><gating:dimension gating:min="10" gating:max="30"><data-type:fcs-dimension data-type:name="FSC-A"/></gating:dimension></gating:RectangleGate></Gate></Population></Subpopulations></SampleNode></Sample></SampleList></Workspace>`
}

const require = createRequire(resolve('plugins/research/package.json'))
const viteRequire = createRequire(require.resolve('vitest/package.json'))
const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href)
const { chromium } = createRequire(resolve('desktop/package.json'))('playwright') as typeof import('playwright')
const root = resolve('.build', 'flowjo-batch-viewer-smoke', new Date().toISOString().replaceAll(':', '-'))
await mkdir(root, { recursive: true })
const store = new ResearchStore(join(root, 'store.sqlite'))
const project = store.createProject({ name: 'FlowJo batch browser acceptance', rootPath: root })
const source1 = join(root, 'sample-1.fcs'); const source2 = join(root, 'sample-2.fcs'); const invalid = join(root, 'broken.fcs'); const wsp = join(root, 'gates.wsp')
await Promise.all([writeFile(source1, fcs([[1, 2], [6, 3], [11, 4]])), writeFile(source2, fcs([[5, 1], [15, 2], [25, 3], [35, 4]])), writeFile(invalid, 'not an FCS file'), writeFile(wsp, workspace())])
const assets = [
  store.createDataAsset({ projectId: project.id, name: 'sample-1.fcs', uri: pathToFileURL(source1).href, location: 'local', mediaType: 'application/octet-stream' }),
  store.createDataAsset({ projectId: project.id, name: 'sample-2.fcs', uri: pathToFileURL(source2).href, location: 'local', mediaType: 'application/octet-stream' }),
  store.createDataAsset({ projectId: project.id, name: 'broken.fcs', uri: pathToFileURL(invalid).href, location: 'local', mediaType: 'application/octet-stream' }),
  store.createDataAsset({ projectId: project.id, name: 'gates.wsp', uri: pathToFileURL(wsp).href, location: 'local', mediaType: 'application/xml' }),
]
const service = new FlowService(store)
const requests: Array<{ action: string; runStatus?: string }> = []
const errors: string[] = []
const app = "import React from 'react';import {createRoot} from 'react-dom/client';import {FlowViewer} from '/plugins/research/src/client/flow-viewer.tsx';const remote={scienceViewer:async input=>fetch('/fixture-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}).then(r=>r.json())};createRoot(document.getElementById('root')).render(React.createElement(FlowViewer,{remote,sessionId:'flowjo-browser'}));"
const server = await createServer({ configFile: false, root: resolve('.'), cacheDir: join(root, 'vite-cache'), optimizeDeps: { noDiscovery: true, entries: [], include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'] }, server: { host: '127.0.0.1', port: 0, watch: null }, esbuild: { jsx: 'automatic' }, resolve: { alias: [{ find: /^react$/u, replacement: require.resolve('react') }, { find: /^react\/jsx-runtime$/u, replacement: require.resolve('react/jsx-runtime') }, { find: /^react\/jsx-dev-runtime$/u, replacement: require.resolve('react/jsx-dev-runtime') }, { find: /^react-dom\/client$/u, replacement: require.resolve('react-dom/client') }] }, plugins: [{
  name: 'flowjo-batch-viewer-smoke', configureServer(vite: any) { vite.middlewares.use(async (req: any, res: any, next: () => void) => {
    if (req.url === '/fixture-api' && req.method === 'POST') {
      res.setHeader('Content-Type', 'application/json')
      try {
        let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 1024 * 1024) throw new Error('Request too large') }
        const input = JSON.parse(raw)
        const value = input.action === 'list' ? { assets: store.listDataAssets(project.id), viewers: store.listViewerSessions(project.id) } : { flow: await service.execute(project, { ...input.flow, ...input, action: input.action.replace(/^flow_/u, '') }) }
        requests.push({ action: input.action, runStatus: value.flow?.run?.status }); res.end(JSON.stringify({ ok: true, value })); return
      } catch (error) { errors.push(String(error)); res.end(JSON.stringify({ ok: false, error: { message: String(error) } })); return }
    }
    if (req.url === '/fixture') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await vite.transformIndexHtml('/fixture', '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>:root{--dsw-alias-border-l1:#d5dbe5;color:#16213b;font-family:system-ui}body{max-width:1000px;margin:20px auto;padding:20px}button,select,input{margin:4px;padding:5px}</style><div id="root"></div><script type="module" src="/fixture-entry.js"></script>')); return }
    next()
  }) }, resolveId(id: string) { return id === '/fixture-entry.js' ? '\0fixture-entry' : undefined }, load(id: string) { return id === '\0fixture-entry' ? app : undefined },
}] })

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  await server.listen(); browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); page.setDefaultTimeout(15_000); page.on('pageerror', error => errors.push(error.message)); page.on('console', entry => { if (entry.type() === 'error') errors.push(entry.text()) })
  await page.goto(new URL('/fixture', server.resolvedUrls!.local[0]).href)
  await page.waitForTimeout(500); await writeFile(join(root, 'initial-dom.html'), await page.content()); await writeFile(join(root, 'initial-errors.json'), JSON.stringify(errors, null, 2))
  for (const asset of assets.slice(0, 3)) await page.getByLabel(asset.name, { exact: true }).check()
  await page.getByLabel('批处理 FlowJo WSP', { exact: true }).selectOption(assets[3]!.id)
  await page.getByRole('button', { name: '运行批处理', exact: true }).click()
  await page.getByText('批处理状态：succeeded', { exact: false }).waitFor()
  await page.getByLabel('批处理结果', { exact: true }).getByText(new RegExp(`${assets[0]!.id}: 完成`, 'u')).waitFor(); await page.getByLabel('批处理结果', { exact: true }).getByText(new RegExp(`${assets[1]!.id}: 完成`, 'u')).waitFor(); await page.getByLabel('批处理结果', { exact: true }).getByText(new RegExp(`${assets[2]!.id}: 拒绝`, 'u')).waitFor()
  await page.screenshot({ path: join(root, 'flowjo-batch-result.png'), fullPage: true })
  const run = store.listRuns(project.id).find(item => item.leaseOwner === 'flow-batch')!; assert.equal(run.status, 'succeeded'); assert.ok(run.logUri)
  const artifact = store.listArtifacts(project.id).find(item => item.runId === run.id)!; assert.ok(artifact)
  const result = JSON.parse(await readFile(new URL(artifact.uri), 'utf8')); assert.deepEqual(result.items.map((item: { assetId: string; analysis?: unknown; error?: string }) => Boolean(item.analysis)), [true, true, false]); assert.equal(result.items[0].analysis.gates[0].count, 2); assert.equal(result.items[1].analysis.gates[0].count, 2)
  const partial = JSON.parse(await readFile(new URL(run.logUri!), 'utf8')); assert.equal(partial.completed, 3); assert.deepEqual(errors, [])
  await writeFile(join(root, 'report.json'), JSON.stringify({ status: 'passed', scope: 'Actual source React FlowViewer, FlowService, ResearchStore and Chromium; synthetic FCS only.', assets: assets.map(asset => asset.id), requests, run, artifact, result, partial, screenshot: 'flowjo-batch-result.png', errors }, null, 2))
  console.log(JSON.stringify({ status: 'passed', root, runId: run.id, requests }))
} finally { await browser?.close(); await server.close(); store.close() }
