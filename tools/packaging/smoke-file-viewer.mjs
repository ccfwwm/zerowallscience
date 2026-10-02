import { contract } from '../build/paths.mjs'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const root = resolve(import.meta.dirname, '../..')
const require = createRequire(resolve(root, 'desktop/package.json'))
const { chromium } = require('playwright')
const clientRequire = createRequire(resolve(root, 'plugins/files/package.json'))
const output = resolve(process.env.ZEROWALL_VIEWER_TEST_OUTPUT ?? resolve(contract.verification, 'file-viewer'))
await mkdir(output, { recursive: true })
const pluginRoot = process.env.ZEROWALL_VIEWER_TEST_PLUGIN ?? resolve(root, 'plugins/files')
const samples = JSON.parse(await readFile(process.argv[2], 'utf8'))
const reactRoot = dirname(clientRequire.resolve('react/package.json'))
const html = `<!doctype html><meta charset="utf-8"><style>html,body,#root{height:100%;margin:0}</style><div id="root"></div>
<script src="/react.js"></script><script src="/react-dom.js"></script><script>
window.__ModuleLoader__={load({factory}){window.plugin=factory(name=>{if(name==='react')return React;if(name==='react/jsx-runtime')return {Fragment:React.Fragment,jsx:(t,p,k)=>React.createElement(t,{...p,key:k}),jsxs:(t,p,k)=>React.createElement(t,{...p,key:k})};throw new Error('Unexpected browser require '+name)})}};
window.viewers=[];const tabs=[];const ctx={effect:fn=>fn(),get:name=>name==='sidebarRightTabs'?{register:()=>()=>{}}:name==='slots'?{inject:(n,fn)=>fn(),register:()=>()=>{}}:{},betterSidebar:{registerFileViewer:v=>{viewers.push(v);return ()=>{}},registerTab:v=>{tabs.push(v);return ()=>{}}}};
window.start=async sample=>{plugin.apply(ctx);const data=new Uint8Array(await (await fetch('/sample/'+sample)).arrayBuffer());const v=viewers[0];ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(v.component,{title:sample,path:sample,scope:{sessionId:'viewer-smoke'},customData:data}));};
</script><script src="/plugin.js"></script>`
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    let file
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end(html); return }
    if (pathname === '/plugin.js') file = resolve(pluginRoot, 'lib/client.js')
    else if (pathname === '/react.js') file = resolve(reactRoot, 'umd/react.production.min.js')
    else if (pathname === '/react-dom.js') file = resolve(dirname(require.resolve('react-dom/package.json')), 'umd/react-dom.production.min.js')
    else if (pathname.startsWith('/sample/')) file = samples.find(v => v.name === pathname.slice(8))?.path
    else if (/^\/zerowall\/viewer-assets\/[a-f0-9]{64}\/(?:build|cmaps|standard_fonts|wasm|iccs)\/[\w.-]+$/u.test(pathname)) file = resolve(pluginRoot, 'lib/viewer-assets', pathname.replace(/^\/zerowall\/viewer-assets\/[a-f0-9]{64}\//u, ''))
    if (!file) { res.writeHead(404); res.end(); return }
    res.setHeader('content-type', /\.(?:m?js)$/u.test(file) ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream')
    res.end(await readFile(file))
  } catch (error) { res.writeHead(500); res.end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const sample of samples) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []; const requests = []; const warnings = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (['warning', 'error'].includes(message.type())) warnings.push(message.text().slice(0, 800)) })
    page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:') && !/^(?:blob|data):/u.test(request.url())) requests.push(request.url()) })
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    assert.equal(errors.length, 0, 'Viewer bundle failed to load: ' + errors.join('; '))
    await page.evaluate(name => start(name), sample.name)
    await page.waitForFunction(selector => document.querySelector(selector) || document.querySelector('[role="alert"]'), sample.readySelector ?? 'canvas,table,[data-ofv-docx-auto-line-height],.ofv-pptx-viewer svg,.ofv-page,audio,video,.ofv-image,img', { timeout: 30000 }).catch(error => errors.push(error.message))
    await page.screenshot({ path: resolve(output, sample.name + '.png'), fullPage: true })
    const state = await page.evaluate(() => ({ text: document.body.innerText.slice(0, 5000), canvases: document.querySelectorAll('canvas').length, tables: document.querySelectorAll('table').length, tableRows: document.querySelectorAll('table tr').length, tableColumns: Math.max(0, ...[...document.querySelectorAll('table tr')].map(row => row.children.length)), graphicalSlides: document.querySelectorAll('.ofv-pptx-viewer svg').length, html: document.getElementById('root').innerHTML.slice(-1000), alert: document.querySelector('[role="alert"]')?.textContent }))
    if (sample.expectedText) assert.ok(state.text.includes(sample.expectedText), `Missing sample content: ${sample.expectedText}`)
    if (sample.minRows) assert.ok(state.tableRows >= sample.minRows, `Missing spreadsheet rows: ${state.tableRows}`)
    if (sample.minColumns) assert.ok(state.tableColumns >= sample.minColumns, `Missing spreadsheet columns: ${state.tableColumns}`)
    const bytes = await readFile(sample.path)
    results.push({ name: sample.name, sha256: createHash('sha256').update(bytes).digest('hex'), errors, warnings, externalRequests: requests, ...state })
    await page.close()
  }
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results.map(({ html, text, ...result }) => result), null, 2))
  for (const result of results) { assert.equal(result.errors.length, 0, `${result.name}: ${result.errors}`); assert.equal(result.externalRequests.length, 0); assert.equal(result.alert, undefined); assert.ok(!result.warnings.some(text => text.includes('graphical renderer failed')), 'PPTX must render graphically') }
} finally { await browser.close(); server.close() }
