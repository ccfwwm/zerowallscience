/** Actual React -> CanvasService -> four artifacts; synthetic plotting reference. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ResearchStore } from '../../store/src/index.js'
import { CanvasService } from '../../plugins/research/src/host/canvas.js'
if (!process.argv.includes('--run')) throw new Error('Pass --run for the synthetic canvas reference.')
const require = createRequire(resolve('plugins/research/package.json'))
const viteRequire = createRequire(require.resolve('vitest/package.json'))
const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href)
const { chromium } = createRequire(resolve('desktop/package.json'))('playwright') as typeof import('playwright')
const root = resolve('.build/canvas-viewer-smoke', new Date().toISOString().replaceAll(':', '-')); await mkdir(root, { recursive: true })
const store = new ResearchStore(join(root, 'store.sqlite')); const project = store.createProject({ name: 'Synthetic plotting reference', rootPath: root }); const service = new CanvasService(store)
const app = "import React from 'react';import {createRoot} from 'react-dom/client';import {CanvasViewer} from '/plugins/research/src/client/canvas-viewer.tsx';const remote={scienceViewer:async input=>fetch('/api',{method:'POST',body:JSON.stringify(input)}).then(r=>r.json())};createRoot(document.getElementById('root')).render(React.createElement(CanvasViewer,{remote,sessionId:'canvas-smoke'}));"
const server = await createServer({ configFile: false, root: resolve('.'), cacheDir: join(root, 'vite-cache'), optimizeDeps: { noDiscovery: true, entries: [], include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'] }, server: { host: '127.0.0.1', port: 0, watch: null }, esbuild: { jsx: 'automatic' }, resolve: { alias: [{ find: /^react$/u, replacement: require.resolve('react') }, { find: /^react\/jsx-runtime$/u, replacement: require.resolve('react/jsx-runtime') }, { find: /^react\/jsx-dev-runtime$/u, replacement: require.resolve('react/jsx-dev-runtime') }, { find: /^react-dom\/client$/u, replacement: require.resolve('react-dom/client') }] }, plugins: [{
  name: 'canvas-smoke', configureServer(server: any) { server.middlewares.use(async (req: any, res: any, next: () => void) => {
    if (req.url === '/api' && req.method === 'POST') {
      res.setHeader('Content-Type', 'application/json')
      try { let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4 * 1024 ** 2) throw new Error('Request too large') } const input = JSON.parse(body); const value = { canvas: await service.execute(project, input.canvas) }; res.end(JSON.stringify({ ok: true, value })) } catch (error) { res.end(JSON.stringify({ ok: false, error: { message: String(error) } })) }
      return
    }
    if (req.url === '/fixture') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await server.transformIndexHtml('/fixture', '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>ZeroWall Canvas</title><style>body{font:14px system-ui;max-width:1100px;margin:20px auto}input,button,select{padding:5px}input[type=number]{width:90px}</style><div id="root"></div><script type="module" src="/entry.js"></script></html>')); return } next()
  }) }, resolveId(id: string) { if (id === '/entry.js') return '\0canvas-entry' }, load(id: string) { if (id === '\0canvas-entry') return app },
}] })
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  await server.listen(); browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } }); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto(new URL('/fixture', server.resolvedUrls!.local[0]).href)
  await page.getByRole('button', { name: '添加面板' }).click()
  await page.getByLabel('面板标题', { exact: true }).fill('Independent reference')
  const raw = JSON.parse(await page.getByLabel('科研画布 JSON').inputValue()); raw.panels[0].series[0].points = [{ x: -1, y: 4 }, { x: 0, y: 3 }, { x: 1, y: 5 }]; raw.panels[0].series[0].color = '#c64c40'; raw.panels[0].xRange = [-2, 2]
  await page.getByLabel('科研画布 JSON').fill(JSON.stringify(raw, null, 2))
  await page.getByRole('button', { name: '预览 SVG' }).click()
  await page.getByLabel('科研画布预览').locator('svg').first().waitFor()
  await page.getByLabel('科研画布预览').screenshot({ path: join(root, 'two-panel-preview.png') })
  await page.reload(); assert.match(await page.getByLabel('科研画布 JSON').inputValue(), /Independent reference/)
  await page.getByRole('button', { name: '导出 SVG/PNG/PDF' }).click(); await page.getByRole('status').filter({ hasText: '已登记 4 个产物' }).waitFor()
  const artifacts = store.listArtifacts(project.id); assert.equal(artifacts.length, 4)
  for (const artifact of artifacts) assert.equal(createHash('sha256').update(await readFile(fileURLToPath(artifact.uri))).digest('hex'), artifact.checksum)
  const manifest = JSON.parse(await readFile(fileURLToPath(artifacts.find(a => a.mediaType === 'application/json')!.uri), 'utf8')); assert.equal(manifest.canvas.pointCount, 6); assert.equal(manifest.spec.panels.length, 1)
  const exported = await readFile(fileURLToPath(artifacts.find(a => a.mediaType === 'image/svg+xml')!.uri), 'utf8'); assert.equal((exported.match(/<circle /g) ?? []).length, 6); assert.ok(exported.includes('cx="263.50"')); assert.deepEqual(errors, [])
  await page.screenshot({ path: join(root, 'restored-export.png'), fullPage: true })
  await writeFile(join(root, 'report.json'), JSON.stringify({ status: 'passed', scope: 'Synthetic two-panel actual React/Host/Chromium; not packaged Electron or publication review', pointCount: 6, panelCount: 2, artifacts, screenshots: ['two-panel-preview.png', 'restored-export.png'], errors }, null, 2))
  console.log(JSON.stringify({ status: 'passed', root }))
} finally { await browser?.close(); await server.close(); store.close() }
