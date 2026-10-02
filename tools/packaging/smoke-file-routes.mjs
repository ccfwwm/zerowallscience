import { contract } from '../build/paths.mjs'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join, basename } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'

const root = resolve(import.meta.dirname, '../..')
const require = createRequire(join(root, 'desktop/package.json'))
const { chromium } = require('playwright')
const output = resolve(process.env.ZEROWALL_ROUTE_TEST_OUTPUT ?? join(contract.verification, 'file-routes'))
const data = join(output, 'profile-' + Date.now())
const workspace = join(output, 'workspace')
await mkdir(workspace, { recursive: true })
const samples = JSON.parse(await readFile(process.argv[2], 'utf8'))
const executable = process.argv[3] ? resolve(process.argv[3]) : join(contract.packages, 'win-unpacked/ZeroWallScience.exe')
const child = spawn(executable, ['--remote-debugging-port=0'], { windowsHide: true, stdio: 'pipe', env: { ...process.env, ZEROWALL_USER_DATA_DIR: data, APPDATA: join(data, 'appdata'), LOCALAPPDATA: join(data, 'localappdata'), USERPROFILE: data } })
console.log('Isolated preview test app PID:', child.pid, 'output:', output)
let processOutput = ''; let browser; let page
const events = []; const results = []
const consoleErrors = []
let excelOverrideHits = 0
const endpoint = new Promise((ok, fail) => {
  const timer = setTimeout(() => fail(new Error('Isolated app DevTools startup timeout')), 150000)
  const capture = chunk => { processOutput += String(chunk); const match = processOutput.match(/DevTools listening on (ws:\/\/[^\s]+)/u); if (match) { clearTimeout(timer); ok(match[1]) } }
  child.stdout.on('data', capture); child.stderr.on('data', capture)
  child.once('exit', code => { clearTimeout(timer); fail(new Error('App exited: ' + code)) })
})
try {
  browser = await chromium.connectOverCDP(await endpoint)
  const context = browser.contexts()[0]
  for (let deadline = Date.now() + 150000; Date.now() < deadline;) {
    page = context.pages().find(value => value.url().startsWith('http://127.0.0.1:'))
    if (page) break
    await new Promise(ok => setTimeout(ok, 250))
  }
  assert.ok(page, 'App did not navigate to the local Host')
  page.on('pageerror', error => events.push({ type: 'pageerror', message: error.message }))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 8000)) })
  // Offline basemap must not prevent local SHP geometry from rendering.
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort())
  await page.waitForFunction(() => Array.isArray(window.__DSH_BOOT__?.entries), undefined, { timeout: 120000 })
  if (process.env.ZEROWALL_ROUTE_EXCEL_OVERRIDE) {
    const body = await readFile(resolve(root, process.env.ZEROWALL_ROUTE_EXCEL_OVERRIDE))
    await page.route(url => decodeURIComponent(url.pathname + url.search).includes('dsh-client-ui-sidebar-documentpreview/client.excel.js'), route => { excelOverrideHits++; return route.fulfill({ contentType: 'text/javascript', body }) })
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 })
  }
  if (process.env.ZEROWALL_ROUTE_CLIENT_OVERRIDE) {
    // Development pilot against the retained old package. Final installation
    // validation has no overrides and must serve this asset from its own ASAR.
    await page.route('**/zerowall/viewer-assets/leaflet/leaflet.css', async route => route.fulfill({ contentType: 'text/css', body: await readFile(join(root, 'plugins/files/lib/viewer-assets/leaflet/leaflet.css')) }))
    const strip = source => source.replace(/^\/\/[#@]\s*(?:sourceURL|sourceMappingURL).*$/gmu, '').trim()
    const bundle = strip(await readFile(resolve(root, process.env.ZEROWALL_ROUTE_CLIENT_OVERRIDE), 'utf8'))
    const asar = require('@electron/asar')
    const archive = join(executable, '../resources/app.asar')
    const file = asar.listPackage(archive).find(path => path.endsWith('/@zerowallscience/plugin-files/lib/client.js') || path.endsWith('\\@zerowallscience\\plugin-files\\lib\\client.js'))
    assert.ok(file, 'Packaged file client not found')
    const original = strip(asar.extractFile(archive, file.replace(/^[\\/]/u, '')).toString('utf8'))
    let hits = 0
    await page.route(url => decodeURIComponent(url.search).includes('@zerowallscience/plugin-files/client.js'), async route => {
      const response = await route.fetch(); const source = await response.text()
      assert.ok(source.includes(original), 'Packaged file client factory not found in the combo script')
      hits++; await route.fulfill({ response, body: source.replace(original, () => bundle) })
    })
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.getByRole('button', { name: '设置', exact: true }).waitFor({ timeout: 120000 })
    assert.ok(hits > 0, 'Client override was not requested')
  }
  const rpc = (method, args) => page.evaluate(async ({ method, args }) => {
    const response = await fetch('/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args } }) })
    const result = await response.json()
    if (!result.result?.ok) throw new Error(method + ': ' + JSON.stringify(result.result?.error))
    return result.result.value
  }, { method, args })
  const nativeOffice = name => /\.(docx?|pptx?|xlsx?|csv|tsv)$/iu.test(name)
  const gis = name => /\.(shp|geojson|topojson|kml|kmz|gpx)$/iu.test(name)
  const nativeContainer = name => page.locator(`[data-textpreview-url$="/${encodeURIComponent(name)}"]:visible`).last()
  const pdfMetrics = () => page.evaluate(() => Array.from(document.querySelectorAll('.ofv-pdf-viewer canvas.ofv-pdf-page')).map(canvas => {
    const bounds = canvas.getBoundingClientRect()
    return { width: bounds.width, height: bounds.height, pixels: canvas.width * canvas.height, visible: getComputedStyle(canvas).visibility !== 'hidden' }
  }).find(canvas => canvas.visible && canvas.pixels > 0 && canvas.width > 250 && canvas.height > 140))
  if (!process.env.ZEROWALL_ROUTE_CLIENT_OVERRIDE && samples.some(sample => gis(sample.name))) {
    for (const [path, mediaType] of [['leaflet/leaflet.css', 'text/css'], ['leaflet/images/marker-icon.png', 'image/png']]) {
      const response = await page.request.get(new URL('/zerowall/viewer-assets/' + path, page.url()).href)
      assert.equal(response.status(), 200, 'Bundled GIS resource missing: ' + path)
      assert.ok(response.headers()['content-type']?.startsWith(mediaType), 'Incorrect GIS resource MIME: ' + path)
      assert.ok((await response.body()).length > 100)
    }
    for (const path of ['leaflet/index.js', 'leaflet/images/unknown.png', 'leaflet/%2e%2e%2findex.js']) {
      const response = await page.request.get(new URL('/zerowall/viewer-assets/' + path, page.url()).href)
      assert.equal(response.status(), 404, 'Unexpected viewer asset access: ' + path)
    }
  }
  const verifyPreview = async (sample, label) => {
    let preview
    if (/\.(xlsx?|csv|tsv)$/iu.test(sample.name)) {
      const body = nativeContainer(sample.name).locator('[data-excel-preview]:visible')
      await body.waitFor({ timeout: 45000 })
      const diagnostics = JSON.parse(await body.getAttribute('data-excel-diagnostics'))
      if (sample.name === 'sample.xlsx') assert.deepEqual(diagnostics, [{ name: 'Sheet3', rows: 13, columns: 14, cells: 173 }])
      const bounds = await body.boundingBox()
      assert.ok(bounds.width > 300 && bounds.height > 150, 'Native Excel pane collapsed')
      await body.locator('canvas').first().waitFor({ timeout: 10000 })
      preview = { renderer: 'native-excel', diagnostics, width: bounds.width, height: bounds.height }
    } else if (nativeOffice(sample.name)) {
      const container = nativeContainer(sample.name)
      await container.waitFor({ timeout: 120000 })
      await container.locator('[data-document-loading]').waitFor({ state: 'hidden', timeout: 120000 })
      const body = container.locator('[data-pdf-preview]:visible')
      await body.waitFor({ timeout: 120000 })
      const canvas = body.locator('[data-pdf-page="1"] canvas:visible').first()
      await canvas.waitFor({ timeout: 30000 })
      await page.waitForFunction(name => Array.from(document.querySelectorAll('[data-textpreview-url]')).filter(node => node.getAttribute('data-textpreview-url').endsWith('/' + encodeURIComponent(name))).some(node => Array.from(node.querySelectorAll('[data-pdf-page="1"] canvas')).some(canvas => canvas.getBoundingClientRect().width > 250 && canvas.width > 0)), sample.name, { timeout: 30000 })
      const bounds = await canvas.boundingBox()
      assert.ok(bounds.width > 250 && bounds.height > 140 && bounds.width / bounds.height > 0.5 && bounds.width / bounds.height < 2.5, 'Native PDF page collapsed or distorted')
      const colors = await canvas.evaluate(canvas => {
        const ctx = canvas.getContext('2d'); const colors = new Set()
        for (let y = 0; y < canvas.height; y += Math.max(1, Math.floor(canvas.height / 100))) for (let x = 0; x < canvas.width; x += Math.max(1, Math.floor(canvas.width / 100))) colors.add(Array.from(ctx.getImageData(x, y, 1, 1).data).join(','))
        return colors.size
      })
      assert.ok(colors > 3, 'Native Office page is blank')
      preview = { renderer: 'native-office', pages: await body.locator('[data-pdf-page]').count(), width: bounds.width, height: bounds.height, colors }
      assert.ok(preview.pages > 0, 'Current Office file has no rendered pages')
      if (sample.name === 'sample.pptx') assert.equal(preview.pages, 12)
      if (sample.name === 'generated-pilot.pptx') assert.equal(preview.pages, 2)
      if (sample.name.endsWith('.docx')) assert.ok(bounds.height > bounds.width, 'DOCX page should be portrait')
    } else if (gis(sample.name)) {
      const body = page.locator('.ofv-gis-viewer:visible').last()
      await body.waitFor({ timeout: 60000 })
      await body.locator('.ofv-map-feature').first().waitFor({ state: 'attached', timeout: 60000 })
      // Let Leaflet's scheduled size invalidation settle before measuring.
      await page.evaluate(() => new Promise(ok => setTimeout(ok, 400)))
      const bounds = await body.locator('.ofv-map-stage').boundingBox()
      assert.ok(bounds.width > 250 && bounds.height > 150, 'GIS map pane collapsed')
      assert.equal(await body.locator('.ofv-map-feature').count() > 0, true, 'GIS geometry did not render')
      assert.ok(await page.locator('#ofv-leaflet-css').evaluate(node => node.sheet?.cssRules.length > 0), 'Bundled Leaflet CSS did not load')
      const geometry = await body.evaluate(body => Array.from(body.querySelectorAll('.leaflet-overlay-pane > svg')).map(svg => ({ width: svg.getAttribute('width'), height: svg.getAttribute('height'), bounds: { width: svg.getBoundingClientRect().width, height: svg.getBoundingClientRect().height }, css: { maxWidth: getComputedStyle(svg).maxWidth, maxHeight: getComputedStyle(svg).maxHeight }, features: Array.from(svg.querySelectorAll('.ofv-map-feature')).map(path => ({ box: path.getBBox(), bounds: { x: path.getBoundingClientRect().x, y: path.getBoundingClientRect().y, width: path.getBoundingClientRect().width, height: path.getBoundingClientRect().height } })) })))
      await writeFile(join(output, label + '-geometry.json'), JSON.stringify(geometry, null, 2))
      assert.ok(geometry.every(svg => Math.abs(Number(svg.width) - svg.bounds.width) < 2 && Math.abs(Number(svg.height) - svg.bounds.height) < 2), 'GIS SVG viewport size was overridden and clips geometry')
      preview = { renderer: 'universal-gis', features: await body.locator('.ofv-map-feature').count(), width: bounds.width, height: bounds.height, summary: await body.locator('.ofv-gis-summary').textContent(), geometry }
    } else {
      await page.getByText('通用查看器', { exact: false }).first().waitFor({ timeout: 30000 })
      const canvas = page.locator('.ofv-pdf-viewer:visible canvas.ofv-pdf-page:visible').first()
      await canvas.waitFor({ timeout: 60000 })
      // PDF rendering replaces its initial placeholder canvas. Query the
      // current DOM on each poll instead of retaining a detached element.
      await page.waitForFunction(() => Array.from(document.querySelectorAll('.ofv-pdf-viewer canvas.ofv-pdf-page')).some(canvas => canvas.width > 0 && canvas.getBoundingClientRect().width > 250), undefined, { timeout: 60000 })
      let bounds
      for (const deadline = Date.now() + 60000; Date.now() < deadline;) {
        bounds = await pdfMetrics()
        if (bounds) break
        await page.waitForTimeout(100)
      }
      assert.ok(bounds, 'Universal PDF rendered canvas is missing')
      assert.ok(bounds.width > 250 && bounds.height > 140, 'Universal PDF pane collapsed')
      preview = { renderer: 'universal', width: bounds.width, height: bounds.height }
    }
    const text = await page.locator('body').innerText()
    for (const error of ['预览失败（', 'undefined (reading', 'Excel preview failed', 'GIS 数据解析失败', '文件读取失败：']) assert.ok(!text.includes(error), error)
    await page.screenshot({ path: join(output, label + '-' + sample.name + '.png'), fullPage: true })
    return preview
  }
  await page.getByRole('button', { name: '设置', exact: true }).waitFor({ timeout: 60000 })
  const createdWorkspace = await rpc('workspace/create', { request: { path: workspace } })
  for (const mode of ['workspace', 'no-workspace']) {
    const { sessionId } = await rpc('session/create', { request: mode === 'workspace' ? { workspaceId: createdWorkspace.workspace.workspaceId } : {} })
    const uploads = []
    for (const sample of samples) {
      const bytes = await readFile(sample.path)
      await copyFile(sample.path, join(workspace, sample.name))
      const upload = await page.evaluate(async ({ sessionId, name, data }) => {
        const query = new URLSearchParams({ sessionId, name })
        const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0))
        const response = await fetch('/api/session/uploadFileBinary?' + query, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: bytes })
        const result = await response.json(); if (!result.ok) throw new Error(JSON.stringify(result.error)); return result.value
      }, { sessionId, name: sample.name, data: bytes.toString('base64') })
      uploads.push({ sample, upload, sha256: createHash('sha256').update(bytes).digest('hex') })
    }
    await rpc('session/prompt', { request: { sessionId, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text: '这个是啥，请根据附件解析摘要识别文件。' }, ...uploads.map(({ upload }) => ({ type: 'file', receiptId: upload.receiptId }))] } })
    await rpc('session/rename', { request: { sessionId, title: '预览验收 ' + mode } })
    if (mode === 'workspace') {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 }); await page.getByText('workspace', { exact: true }).first().click({ timeout: 120000 })
      await page.getByText('预览验收 ' + mode, { exact: true }).first().click({ timeout: 30000 })
    } else {
      await page.getByRole('button', { name: '搜索会话', exact: true }).click()
      await page.getByPlaceholder('搜索会话名称').fill('预览验收 no-workspace')
      await page.getByRole('treeitem').filter({ hasText: '预览验收 no-workspace' }).first().click({ timeout: 30000 })
    }
    for (const { sample, upload, sha256 } of uploads) {
      const original = upload.attachment ?? upload.file ?? upload
      const attachmentId = original.attachmentId
      assert.ok(attachmentId, 'Native upload did not return an attachment ID')
      const extraction = await rpc('zerowallFiles/extract', { input: { sessionId, attachmentId, mode: 'local' } })
      if (!gis(sample.name)) assert.equal(extraction.state, 'done')
      const file = await rpc('zerowallFiles/inspectOriginalMetadata', { input: { sessionId, attachmentId } })
      assert.equal(file.sha256, sha256)
      if (mode === 'no-workspace') {
        const range = await rpc('zerowallFiles/readOriginalRange', { input: { sessionId, attachmentId, offset: 0, length: 1024 } })
        assert.ok(range.data.length)
        if (!gis(sample.name)) {
          const content = await rpc('zerowallFiles/inspect', { input: { sessionId, attachmentId, view: 'parsed' } })
          assert.ok(content.content?.length)
        }
      }
      await page.getByRole('button', { name: '预览文件 ' + sample.name, exact: true }).first().click({ timeout: 30000 })
      const preview = await verifyPreview(sample, mode)
      console.log(mode, sample.name, preview.renderer, 'rendered')
      if (!gis(sample.name)) {
        const metadata = await rpc('zerowallFiles/inspect', { input: { sessionId, attachmentId, view: 'parsed' } })
        assert.ok(metadata.content?.length)
      }
      results.push({ mode, name: sample.name, attachmentId, sha256, parser: extraction.parser, state: extraction.state, counts: { slides: extraction.slideCount, sheets: extraction.sheetCount, cells: extraction.cellCount }, opened: true, preview })
      if (sample.name === 'offline-worker.pdf') {
        const canvas = page.locator('.ofv-pdf-viewer:visible canvas.ofv-pdf-page:visible').first()
        const before = await pdfMetrics()
        assert.ok(before, 'PDF zoom requires a rendered page')
        await page.locator('.ofv-toolbar:visible').last().getByRole('button', { name: /^(放大|Zoom in)$/u }).click()
        await page.waitForFunction(width => Array.from(document.querySelectorAll('.ofv-pdf-viewer canvas.ofv-pdf-page')).some(canvas => canvas.getBoundingClientRect().width > width * 1.05), before.width, { timeout: 30000 })
        const after = await pdfMetrics()
        assert.ok(after, 'PDF zoom lost its rendered page')
        assert.ok(after.width > before.width * 1.05, 'PDF zoom did not resize the rendered page')
        results.push({ mode, name: sample.name, pdfZoom: true, beforeWidth: before.width, afterWidth: after.width })
      }
      if (sample.name.endsWith('.xlsx')) {
        const excel = nativeContainer(sample.name).locator('[data-excel-preview]')
        await excel.waitFor({ timeout: 30000 })
        if (process.env.ZEROWALL_ROUTE_EXCEL_OVERRIDE) assert.ok(excelOverrideHits > 0, 'Excel adapter override was not requested')
        const diagnostics = JSON.parse(await excel.getAttribute('data-excel-diagnostics'))
        assert.ok(diagnostics.some(sheet => sheet.name === 'Sheet3' && sheet.cells === 173), 'Native Excel did not show the expected worksheet')
        for (const viewport of [{ width: 1320, height: 920 }, { width: 1680, height: 1080 }, { width: 1440, height: 1000 }]) {
          await page.setViewportSize(viewport)
          await excel.waitFor({ timeout: 10000 })
          await page.waitForFunction(() => !document.body.innerText.includes('Excel preview failed'), undefined, { timeout: 10000 })
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
          assert.ok(!(await page.locator('body').innerText()).includes('Excel preview failed'), 'Native Excel failed while resizing the pane')
        }
        await page.screenshot({ path: join(output, mode + '-native-excel-resized.png'), fullPage: true })
        results.push({ mode, nativeExcel: true, diagnostics })
      }
      if (['sample.pptx', 'sample.docx', 'sample.xlsx'].includes(sample.name)) {
        const materialized = await rpc('zerowallFiles/materializeOriginal', { input: { sessionId, attachmentId } })
        for (const [method, args] of [
          ['zerowallFiles/renderWorkspaceOffice', { input: { sessionId, path: materialized.path } }],
          ['zerowallFiles/renderOfficeAttachment', { input: { sessionId, attachmentId } }],
        ]) {
          const pdf = await rpc(method, args)
          const buffer = Buffer.from(pdf.data, 'base64')
          assert.equal(buffer.subarray(0, 5).toString(), '%PDF-')
          assert.ok(buffer.length > 1000)
          await writeFile(join(output, mode + '-' + sample.name + '-' + method.split('/')[1] + '.pdf'), buffer)
          results.push({ mode, name: sample.name, officeRpc: method, pdfBytes: buffer.length, missingFonts: pdf.missingFonts })
        }
        await assert.rejects(() => rpc('zerowallFiles/renderWorkspaceOffice', { input: { sessionId: 'unknown-session', path: materialized.path } }), /lookup|not.found|resolve|session/iu)
        assert.equal((await rpc('zerowallFiles/inspectOriginalMetadata', { input: { sessionId, attachmentId } })).sha256, sha256)
        if (mode === 'workspace' && sample.name === 'sample.xlsx') {
          const address = `dsh-resource://file/session/${encodeURIComponent(sessionId)}/${materialized.path.replaceAll('\\', '/').split('/').map(encodeURIComponent).join('/')}`
          await page.evaluate(address => window.dispatchEvent(new CustomEvent('zerowall:viewer-switch', { detail: { address, mode: 'universal' } })), address)
          await page.getByRole('button', { name: 'Office→PDF', exact: true }).last().click({ timeout: 30000 })
          results.push({ mode, name: sample.name, officePdfButton: true, preview: await verifyPreview({ name: 'conversion.pdf' }, 'office-pdf-button') })
        }
      }
    }
    // Re-open the same session after a renderer reload to exercise durable history.
    if (mode === 'workspace') {
      await page.getByRole('button', { name: '新标签页', exact: true }).first().click()
      await page.getByText('文件', { exact: true }).first().click({ timeout: 30000 })
      for (const sample of samples.filter(sample => nativeOffice(sample.name) || gis(sample.name) || /\.pdf$/iu.test(sample.name))) {
        // Reuse the file tree, as a user opening successive files would. New
        // empty tabs can push the native tab bar's add button out of view.
        await page.getByText('文件', { exact: true }).first().click({ timeout: 30000 })
        await page.locator(`div[role="button"][title$="${sample.name}"]`).first().click({ timeout: 30000 })
        results.push({ mode, name: sample.name, fileTree: true, preview: await verifyPreview(sample, 'file-tree') })
        console.log('file-tree', sample.name, 'rendered')
      }
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 }); await page.getByText('workspace', { exact: true }).first().click({ timeout: 120000 })
      await page.getByText('预览验收 ' + mode, { exact: true }).first().click({ timeout: 30000 })
      for (const sample of samples.filter(sample => nativeOffice(sample.name) || gis(sample.name) || /\.pdf$/iu.test(sample.name))) {
        await page.getByRole('button', { name: '预览文件 ' + sample.name, exact: true }).first().click({ timeout: 30000 })
        results.push({ mode, name: sample.name, historyReload: true, preview: await verifyPreview(sample, 'history') })
        console.log('history', sample.name, 'rendered')
      }
    } else {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.getByRole('button', { name: '搜索会话', exact: true }).click({ timeout: 120000 })
      await page.getByPlaceholder('搜索会话名称').fill('预览验收 no-workspace')
      await page.getByRole('treeitem').filter({ hasText: '预览验收 no-workspace' }).first().click({ timeout: 30000 })
      for (const sample of samples.filter(sample => nativeOffice(sample.name) || gis(sample.name) || /\.pdf$/iu.test(sample.name))) {
        await page.getByRole('button', { name: '预览文件 ' + sample.name, exact: true }).first().click({ timeout: 30000 })
        results.push({ mode, name: sample.name, historyReload: true, preview: await verifyPreview(sample, 'no-workspace-history') })
        console.log('no-workspace-history', sample.name, 'rendered')
      }
    }
  }
  assert.equal(events.filter(event => event.type === 'pageerror').length, 0)
  await writeFile(join(output, 'results.json'), JSON.stringify({ executable, clientOverride: !!process.env.ZEROWALL_ROUTE_CLIENT_OVERRIDE, excelOverride: !!process.env.ZEROWALL_ROUTE_EXCEL_OVERRIDE, results, events }, null, 2))
  console.log('Packaged attachment routes passed:', results.length)
} catch (error) {
  await page?.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {})
  await writeFile(join(output, 'failure.json'), JSON.stringify({ error: String(error), body: (await page?.locator('body').innerText().catch(() => '') ?? '').slice(-10000), events, consoleErrors, results }, null, 2))
  throw error
} finally {
  await Promise.race([browser?.close().catch(() => {}), new Promise(ok => setTimeout(ok, 2000))])
  if (child.exitCode === null) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
}
