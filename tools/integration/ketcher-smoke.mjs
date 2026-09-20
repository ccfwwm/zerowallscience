import { Client } from '../../tools/ketcher/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'
import { StdioClientTransport } from '../../tools/ketcher/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js'
import { chromium } from '../../desktop/node_modules/playwright/index.mjs'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
const root = resolve(import.meta.dirname, '../..')
const output = resolve(root, 'test-results/skills-mcp/ketcher'); await mkdir(output, { recursive: true })
const client = new Client({ name: 'zerowall-ketcher-smoke', version: '1' })
let browser
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(root, 'resources/mcp/ketcher-chemistry/server.js')], stderr: 'pipe' }))
  const call = async (name, args, cwd = output) => {
    const value = await client.callTool({ name, arguments: args, _meta: { 'zerowall/workspace': cwd } })
    assert.ok(!value.isError, JSON.stringify(value)); return value
  }
  const resource = await client.readResource({ uri: 'ui://ketcher/editor' })
  const resourceBytes = Buffer.byteLength(JSON.stringify(resource)); assert.ok(resourceBytes < 1024)
  const opened = await call('open_sketcher', { smiles: 'N[C@@H](C)C(=O)O' })
  const artifact = opened.structuredContent.artifact_id
  const url = opened._meta['zerowall/editor'].url
  assert.equal((await call('editor_status', { artifact_id: artifact })).structuredContent.status, 'awaiting_mount')
  browser = await chromium.launch({ headless: true, channel: 'msedge' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } })
  const errors = []; page.on('pageerror', error => { errors.push(String(error.stack)); void writeFile(resolve(output, 'browser-errors.json'), JSON.stringify(errors,null,2)) }); page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text().slice(0,500)) })
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`) })
  page.on('worker', worker => { worker.on('close', () => errors.push(`worker closed ${worker.url()}`)) })
  await page.goto(url)
  await page.waitForFunction(() => Boolean(window.ketcher), null, { timeout: 60000 }).catch(async error => { await writeFile(resolve(output, 'browser-errors.json'), JSON.stringify(errors,null,2)); await page.screenshot({path:resolve(output,'failure.png')}); throw error })
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) { if ((await call('editor_status', { artifact_id: artifact })).structuredContent.status === 'ready') break; const status = await page.locator('#status').textContent(); if (status) throw new Error(status); await new Promise(r => setTimeout(r, 500)) }
  await writeFile(resolve(output, 'browser-errors.json'), JSON.stringify(errors, null, 2))
  await writeFile(resolve(output, 'page-status.txt'), await page.locator('body').innerText())
  assert.equal((await call('editor_status', { artifact_id: artifact })).structuredContent.status, 'ready', JSON.stringify(errors))
  const initial = (await call('get_structure', { artifact_id: artifact, format: 'smiles' })).structuredContent.structure
  assert.match(initial, /@/u)
  await call('set_structure', { artifact_id: artifact, structure: 'c1ccccc1O' })
  await call('highlight_atoms', { artifact_id: artifact, atoms: [0, 1], color: '#ff8800' })
  await page.evaluate(async () => window.ketcher.setMolecule('CC(=O)Oc1ccccc1C(=O)O'))
  const edited = (await call('get_structure', { artifact_id: artifact, format: 'smiles' })).structuredContent.structure
  assert.ok(edited.includes('=O'))
  const exported = (await call('export_structure', { artifact_id: artifact, format: 'mol', filename: 'edited.mol' })).structuredContent
  assert.ok((await readFile(exported.path, 'utf8')).includes('V3000'))
  const rejected = await client.callTool({ name: 'get_structure', arguments: { artifact_id: artifact }, _meta: { 'zerowall/workspace': root } }); assert.equal(rejected.isError, true)
  await page.screenshot({ path: resolve(output, 'editor.png'), fullPage: true })
  await call('close_sketcher', { artifact_id: artifact })
  assert.equal((await call('editor_status', { artifact_id: artifact })).structuredContent.status, 'closed')
  const reopened = await call('open_sketcher', { artifact_id: artifact })
  await page.goto(reopened._meta['zerowall/editor'].url)
  await page.reload()
  await page.waitForFunction(() => Boolean(window.ketcher), null, { timeout: 60000 })
  const again = Date.now() + 30000
  while (Date.now() < again) { if ((await call('editor_status', { artifact_id: artifact })).structuredContent.status === 'ready') break; await new Promise(r => setTimeout(r, 500)) }
  assert.equal((await call('get_structure', { artifact_id: artifact, format: 'smiles' })).structuredContent.structure, edited)
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ ok: true, resourceBytes, tools: (await client.listTools()).tools.map(t => t.name), stereo: initial, edited, exported, browserErrors: errors }, null, 2))
  console.log(JSON.stringify({ ok: true, resourceBytes, output }))
} finally { await browser?.close(); await client.close() }
