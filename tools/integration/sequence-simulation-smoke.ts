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
import {pcrTemplate,pcrForward,pcrReverse,pcrExpected,gibsonSequences,gibsonExpected,goldenSequences,goldenExpected,fixtureReverseComplement} from '../../plugins/research/test/sequence-simulation-fixture.js'

if (!process.argv.includes('--run')) throw new Error('Pass --run for isolated synthetic sequence validation.')
const require = createRequire(resolve('plugins/research/package.json'))
const viteRequire = createRequire(require.resolve('vitest/package.json'))
const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href)
const desktopRequire = createRequire(resolve('desktop/package.json'))
const { chromium } = desktopRequire('playwright') as typeof import('playwright')
const root = resolve('.build', 'sequence-simulation-smoke', new Date().toISOString().replaceAll(':', '-'))
await mkdir(root, { recursive: true })
const inputs={template:pcrTemplate,forward:pcrForward,reverse:pcrReverse,circularForward:pcrTemplate.slice(170,190),circularReverse:fixtureReverseComplement(pcrTemplate.slice(10,30)),gibson:gibsonSequences,golden:goldenSequences,gibsonExpected,goldenExpected}
await writeFile(join(root,'reference-input.json'),JSON.stringify(inputs))
const reference=await promisify(execFile)(process.env.ZEROWALL_PYTHON||'python',[resolve('tools/integration/sequence-simulation-reference.py'),join(root,'reference-input.json')])
const independent=JSON.parse(reference.stdout)
assert.equal(independent.pcr,pcrExpected);assert.equal(independent.circularPcr,pcrTemplate.slice(170)+pcrTemplate.slice(0,30));assert.equal(independent.gibson.circularEquivalent,true);assert.ok(independent.golden.every((item:any)=>item.circularEquivalent))
for(const digest of independent.digests){assert.deepEqual(digest.cuts,[[8,56],[8,60]]);assert.deepEqual(digest.overhangs,[-4,-4]);assert.equal(digest.retainedWatson.join(''),goldenExpected)}
const sources=[['PCR 模板',[pcrTemplate]],['Gibson 片段',gibsonSequences],['Golden Gate 片段',goldenSequences]] as const
const paths:string[]=[]
for(let i=0;i<sources.length;i++){const path=join(root,'source-'+i+'.fasta');await writeFile(path,sources[i]![1].map((seq,j)=>'>fragment-'+(j+1)+'\n'+seq+'\n').join(''));paths.push(path)}
const store = new ResearchStore(join(root, 'store.sqlite'))
const project = store.createProject({ name: 'Synthetic sequence', rootPath: root })
const assets=paths.map((path,i)=>store.createDataAsset({projectId:project.id,name:sources[i]![0],uri:pathToFileURL(path).href,location:'local',mediaType:'text/x-fasta'}))
const service = new ScienceViewerService(store)
const requests: string[] = []
const app = `import React from 'react';import {createRoot} from 'react-dom/client';import {SequenceViewer} from '/plugins/research/src/client/sequence-viewer.tsx';const remote={scienceViewer:async input=>fetch('/fixture-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}).then(r=>r.json())};createRoot(document.getElementById('root')).render(React.createElement(SequenceViewer,{remote,sessionId:'fixture'}));`
const server = await createServer({ configFile: false, root: resolve('.'), cacheDir: join(root, 'vite-cache'), optimizeDeps: { noDiscovery: true, entries: [], include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'] }, server: { host: '127.0.0.1', port: 0, watch: null }, esbuild: { jsx: 'automatic' }, resolve: { alias: [{ find: /^react$/u, replacement: require.resolve('react') }, { find: /^react\/jsx-runtime$/u, replacement: require.resolve('react/jsx-runtime') }, { find: /^react\/jsx-dev-runtime$/u, replacement: require.resolve('react/jsx-dev-runtime') }, { find: /^react-dom\/client$/u, replacement: require.resolve('react-dom/client') }] }, plugins: [{
  name: 'sequence-simulation-smoke', configureServer(server: any) { server.middlewares.use(async (req: any, res: any, next: () => void) => {
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
  const expected=[pcrExpected,gibsonExpected,goldenExpected]
  for(let i=0;i<assets.length;i++){
    await page.getByLabel('序列资产',{exact:true}).selectOption(assets[i]!.id)
    await page.getByRole('button',{name:'打开序列',exact:true}).click()
    await page.getByLabel('序列分析操作',{exact:true}).waitFor()
    if(i===0){await page.getByLabel('选择终点',{exact:true}).fill(String(pcrTemplate.length));await page.getByRole('button',{name:'保存并查看',exact:true}).click()}
    await page.getByLabel('序列分析操作',{exact:true}).selectOption(['pcr','gibson','golden-gate'][i]!)
    if(i===0){await page.getByLabel('PCR 正向引物',{exact:true}).fill(pcrForward);await page.getByLabel('PCR 反向引物',{exact:true}).fill(pcrReverse);await page.getByLabel('PCR 正向退火长度',{exact:true}).fill('20');await page.getByLabel('PCR 反向退火长度',{exact:true}).fill('20')}
    else await page.getByLabel('拼接片段顺序',{exact:true}).fill(i===1?'1+, 2+, 3+':'1+, 2+')
    const previous=store.listArtifacts(project.id).length
    await page.getByRole('button',{name:'导出并登记产物',exact:true}).click()
    await page.waitForFunction(()=>document.body.innerText.includes('已登记产物'))
    assert.equal(store.listArtifacts(project.id).length,previous+1)
    const artifact=store.listArtifacts(project.id).find(a=>a.name.includes(['pcr','gibson','golden-gate'][i]!))!
    const manifest=JSON.parse(await readFile(new URL(artifact.uri),'utf8'))
    assert.equal(manifest.analysis.sequence,expected[i]);assert.ok(manifest.analysis.simulation.parameters)
    assert.equal(createHash('sha256').update(await readFile(new URL(artifact.uri))).digest('hex'),artifact.checksum)
    const fasta=await readFile(new URL(String(artifact.metadata.fastaUri)),'utf8');assert.equal(fasta.split('\n').slice(1).join(''),expected[i])
    await page.screenshot({path:join(root,['pcr','gibson','golden-gate'][i]+'.png'),fullPage:true})
  }
  await page.reload();await page.getByRole('tab').first().click();await page.getByLabel('序列分析操作',{exact:true}).waitFor()
  assert.deepEqual(errors,[])
  const report={status:'passed',scope:'Real source React + Host + Chromium, synthetic PCR/Gibson/Golden Gate fixtures, independent pydna and Biopython; not packaged Electron or experimental validation',independent,requests,artifacts:store.listArtifacts(project.id)}
  await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:'passed',output:root,artifacts:report.artifacts.length}))
} finally { await browser?.close(); await server.close(); store.close() }
