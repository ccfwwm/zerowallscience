/** Actual React + Host service + Chromium; synthetic data and Biopython reference. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ResearchStore } from '../../store/src/index.js'
import { ScienceViewerService } from '../../plugins/research/src/host/science-viewer.js'
import { parseGenBank } from '../../plugins/research/src/host/sequence.js'

if (!process.argv.includes('--run')) throw new Error('Pass --run for isolated synthetic sequence validation.')
const require = createRequire(resolve('plugins/research/package.json'))
const viteRequire = createRequire(require.resolve('vitest/package.json'))
const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href)
const desktopRequire = createRequire(resolve('desktop/package.json'))
const { chromium } = desktopRequire('playwright') as typeof import('playwright')
const root = resolve('.build', 'sequence-viewer-smoke', new Date().toISOString().replaceAll(':', '-'))
await mkdir(root, { recursive: true })
const sequence = 'ATGGAATTCTAA'.repeat(10)
assert.equal(sequence.length, 120)
const path = join(root, 'example.gbk')
await promisify(execFile)(process.env.ZEROWALL_PYTHON || 'python', ['-c', `from Bio import SeqIO
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord
from Bio.SeqFeature import SeqFeature, SimpleLocation, CompoundLocation
import sys
r=SeqRecord(Seq(sys.argv[2]),id='example',name='example',description='Synthetic plasmid; no biological finding.')
r.annotations={'molecule_type':'DNA','topology':'circular'}
r.features=[SeqFeature(SimpleLocation(0,120,strand=1),type='source'),SeqFeature(CompoundLocation([SimpleLocation(0,18,strand=-1),SimpleLocation(90,120,strand=-1)]),type='CDS',qualifiers={'gene':['origin-spanning']}),SeqFeature(SimpleLocation(34,50,strand=1),type='misc_feature',qualifiers={'label':['selection-marker']})]
SeqIO.write(r,sys.argv[1],'genbank')`, path, sequence])
const input = await readFile(path, 'utf8')
const records = parseGenBank(input)
const reference = await promisify(execFile)(process.env.ZEROWALL_PYTHON || 'python', ['-c', `from Bio import SeqIO
import Bio,json,sys
r=SeqIO.read(sys.argv[1],'genbank')
print(json.dumps({'version':Bio.__version__,'sequence':str(r.seq),'circular':r.annotations.get('topology')=='circular','features':[{'type':f.type,'segments':[{'start':int(p.start)+1,'end':int(p.end),'strand':p.strand} for p in f.location.parts]} for f in r.features]}))`, path])
const independent = JSON.parse(reference.stdout)
assert.equal(independent.sequence, records[0]!.sequence)
assert.equal(independent.circular, records[0]!.circular)
assert.deepEqual(independent.features, records[0]!.features.map(feature => ({ type: feature.type, segments: feature.segments.map(({ start, end, strand }) => ({ start, end, strand })) })))
const store = new ResearchStore(join(root, 'store.sqlite'))
const project = store.createProject({ name: 'Synthetic sequence', rootPath: root })
const asset = store.createDataAsset({ projectId: project.id, name: '合成环状 GenBank', uri: pathToFileURL(path).href, location: 'local', mediaType: 'text/x-genbank' })
const service = new ScienceViewerService(store)
const requests: string[] = []
const app = `import React from 'react';import {createRoot} from 'react-dom/client';import {SequenceViewer} from '/plugins/research/src/client/sequence-viewer.tsx';const remote={scienceViewer:async input=>fetch('/fixture-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}).then(r=>r.json())};createRoot(document.getElementById('root')).render(React.createElement(SequenceViewer,{remote,sessionId:'fixture'}));`
const server = await createServer({ configFile: false, root: resolve('.'), cacheDir: join(root, 'vite-cache'), optimizeDeps: { noDiscovery: true, entries: [], include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'] }, server: { host: '127.0.0.1', port: 0, watch: null }, esbuild: { jsx: 'automatic' }, resolve: { alias: [{ find: /^react$/u, replacement: require.resolve('react') }, { find: /^react\/jsx-runtime$/u, replacement: require.resolve('react/jsx-runtime') }, { find: /^react\/jsx-dev-runtime$/u, replacement: require.resolve('react/jsx-dev-runtime') }, { find: /^react-dom\/client$/u, replacement: require.resolve('react-dom/client') }] }, plugins: [{
  name: 'sequence-viewer-smoke', configureServer(server: any) { server.middlewares.use(async (req: any, res: any, next: () => void) => {
    if (req.url === '/fixture-api' && req.method === 'POST') {
      res.setHeader('Content-Type', 'application/json')
      try { let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 1024 * 1024) throw new Error('Request too large') } const request = JSON.parse(body); requests.push(request.action); res.end(JSON.stringify({ ok: true, value: await service.execute(project, request) })) }
      catch (error) { res.end(JSON.stringify({ ok: false, error: { message: String(error) } })) }
      return
    }
    if (req.url === '/fixture') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await server.transformIndexHtml('/fixture', '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>ZeroWall Sequence QA</title><style>:root{--dsw-alias-border-l1:#d5dbe5;color:#16213b;background:#f4f7fb;font-family:system-ui}body{max-width:1100px;margin:20px auto;background:white;padding:20px}button,select,input{padding:5px;margin:3px}td,th{text-align:left;padding:4px 12px}</style><div id="root"></div><script type="module" src="/fixture-entry.js"></script></html>')); return }
    next()
  }) }, resolveId(id: string) { if (id === '/fixture-entry.js') return '\0fixture-entry' }, load(id: string) { if (id === '\0fixture-entry') return app },
} ] })
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  await server.listen()
  console.log('Sequence fixture server ready')
  browser = await chromium.launch({ headless: true, timeout: 30000 })
  const page = await browser.newPage({ viewport: { width: 1360, height: 1100 } })
  page.setDefaultTimeout(15000)
  const errors: string[] = []; page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()) })
  page.on('requestfailed', request => console.error(`Failed request ${request.url()}: ${request.failure()?.errorText}`))
  const url = new URL('/fixture', server.resolvedUrls!.local[0]).href
  await page.goto(url)
  await page.getByLabel('序列资产', { exact: true }).selectOption(asset.id)
  await page.getByRole('button', { name: '打开序列', exact: true }).click()
  await page.getByRole('img', { name: 'example 环形图谱', exact: true }).waitFor()
  await page.screenshot({ path: join(root, 'circular.png'), fullPage: true })
  await page.getByRole('button', { name: 'selection-marker', exact: true }).click()
  await page.getByRole('button', { name: '保存并查看', exact: true }).click()
  await page.getByLabel('图谱布局', { exact: true }).selectOption('linear')
  await page.getByRole('button', { name: '保存并查看', exact: true }).click()
  await page.reload()
  await page.getByRole('tab').first().click()
  await page.getByRole('img', { name: 'example 线性图谱', exact: true }).waitFor()
  assert.equal(await page.getByLabel('选择起点', { exact: true }).inputValue(), '35')
  assert.equal(await page.getByLabel('选择终点', { exact: true }).inputValue(), '50')
  await page.getByRole('button', { name: '导出并登记产物', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '已登记产物' }).waitFor()
  await page.screenshot({ path: join(root, 'linear-restored.png'), fullPage: true })
  assert.deepEqual(errors, [])
  const artifact = store.listArtifacts(project.id)[0]!
  assert.ok(artifact)
  const report = { scope: 'Real source React/Host/Chromium with synthetic GenBank; not packaged Electron acceptance', biopython: independent.version, referenceMatch: true, requests, restored: store.listViewerSessions(project.id)[0]!.state, artifact, sourceSha256: createHash('sha256').update(await readFile(path)).digest('hex'), screenshots: ['circular.png', 'linear-restored.png'] }
  await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ status: 'passed', output: root, requests, artifactId: artifact.id }))
} finally { await browser?.close(); await server.close(); store.close() }
