/** Actual React -> CanvasService -> four artifacts; synthetic plotting reference. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ResearchStore } from '../../store/src/index.js'
import { SangerService } from '../../plugins/research/src/host/sanger.js'
if (!process.argv.includes('--run')) throw new Error('Pass --run for the synthetic canvas reference.')
const require = createRequire(resolve('plugins/research/package.json'))
const viteRequire = createRequire(require.resolve('vitest/package.json'))
const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href)
const { chromium } = createRequire(resolve('desktop/package.json'))('playwright') as typeof import('playwright')
const root = resolve('.build/sanger-revision-viewer-smoke', new Date().toISOString().replaceAll(':', '-')); await mkdir(root, { recursive: true })
const store = new ResearchStore(join(root, 'store.sqlite')); const project = store.createProject({ name: 'Synthetic plotting reference', rootPath: root }); const service = new SangerService(store)
const source = resolve('.build/sanger-reference/3100.ab1'); const path = join(root, '3100.ab1'); const original = await readFile(source); await writeFile(path, original); const asset = store.createDataAsset({ projectId: project.id, name: '3100 instrument reference', uri: pathToFileURL(path).href, location: 'local', mediaType: 'application/octet-stream' })
const app = "import React from 'react';import {createRoot} from 'react-dom/client';import {SangerViewer} from '/plugins/research/src/client/sanger-viewer.tsx';const remote={scienceViewer:async input=>fetch('/api',{method:'POST',body:JSON.stringify(input)}).then(r=>r.json())};createRoot(document.getElementById('root')).render(React.createElement(SangerViewer,{remote,sessionId:'canvas-smoke'}));"
const server = await createServer({ configFile: false, root: resolve('.'), cacheDir: join(root, 'vite-cache'), optimizeDeps: { noDiscovery: true, entries: [], include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'] }, server: { host: '127.0.0.1', port: 0, watch: null }, esbuild: { jsx: 'automatic' }, resolve: { alias: [{ find: /^react$/u, replacement: require.resolve('react') }, { find: /^react\/jsx-runtime$/u, replacement: require.resolve('react/jsx-runtime') }, { find: /^react\/jsx-dev-runtime$/u, replacement: require.resolve('react/jsx-dev-runtime') }, { find: /^react-dom\/client$/u, replacement: require.resolve('react-dom/client') }] }, plugins: [{
  name: 'canvas-smoke', configureServer(server: any) { server.middlewares.use(async (req: any, res: any, next: () => void) => {
    if (req.url === '/api' && req.method === 'POST') {
      res.setHeader('Content-Type', 'application/json')
      try { let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4 * 1024 ** 2) throw new Error('Request too large') } const input = JSON.parse(body); const value = input.action === 'list' ? { assets: store.listDataAssets(project.id), viewers: store.listViewerSessions(project.id) } : { sanger: await service.execute(project, { ...(input.sanger ?? {}), ...input, action: input.action.slice(7) }) }; res.end(JSON.stringify({ ok: true, value })) } catch (error) { res.end(JSON.stringify({ ok: false, error: { message: String(error) } })) }
      return
    }
    if (req.url === '/fixture') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await server.transformIndexHtml('/fixture', '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>ZeroWall Canvas</title><style>body{font:14px system-ui;max-width:1100px;margin:20px auto}input,button,select{padding:5px}input[type=number]{width:90px}</style><div id="root"></div><script type="module" src="/entry.js"></script></html>')); return } next()
  }) }, resolveId(id: string) { if (id === '/entry.js') return '\0canvas-entry' }, load(id: string) { if (id === '\0canvas-entry') return app },
}] })
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  await server.listen(); browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } }); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto(new URL('/fixture', server.resolvedUrls!.local[0]).href)
  await page.getByLabel('Sanger 资产', { exact: true }).selectOption(asset.id)
  await page.getByRole('button', { name: '打开峰图', exact: true }).click()
  await page.getByLabel('人工碱基修订', { exact: true }).waitFor()
  await page.getByLabel('修订碱基位置', { exact: true }).fill('100')
  await page.getByLabel('修订碱基', { exact: true }).selectOption('R')
  await page.getByLabel('碱基修订依据').fill('Deliberate synthetic revision of public instrument fixture; not a variant call')
  await page.getByRole('button', { name: '登记碱基修订', exact: true }).click()
  await page.getByText('历史修订批次：1', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('端点概率阈值').inputValue(), '0')
  await page.getByRole('button', { name: '导出并登记', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '已登记产物' }).waitFor()
  await page.getByLabel('Sanger 峰图查看与分析', { exact: true }).screenshot({ path: join(root, 'revised-trace.png') })
  const artifact = store.listArtifacts(project.id)[0]!; const result = JSON.parse(await readFile(fileURLToPath(artifact.uri), 'utf8'))
  assert.equal(result.analysis.trim.sequence[99], 'R'); assert.equal(result.analysis.trim.qualities[99], null); assert.equal(result.editHistory[0].edits[0].position, 100)
  assert.equal(createHash('sha256').update(original).digest('hex'), result.sourceSha256)
  assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), result.sourceSha256)
  await page.reload(); await page.getByRole('tab', { name: /3100 instrument reference/ }).click(); await page.getByText('历史修订批次：1', { exact: true }).waitFor()
  assert.deepEqual(errors, [])
  await writeFile(join(root, 'report.json'), JSON.stringify({ status: 'passed', scope: 'Real public AB1 instrument file, React/Host/Chromium; manually injected revision for software validation, not a biological variant finding', source, sourceSha256: result.sourceSha256, artifact, editHistory: result.editHistory, errors }, null, 2))
  console.log(JSON.stringify({ status: 'passed', root }))
} finally { await browser?.close(); await server.close(); store.close() }
