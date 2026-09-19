import assert from 'node:assert/strict'
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { locatePackagedApp } from './packaged-app.mjs'

const packaged = await locatePackagedApp(resolve(import.meta.dirname, '..'))
const root = await mkdtemp(resolve(tmpdir(), 'zerowall-startup-cover-'))
const evidence = resolve(import.meta.dirname, '../dist/verification-6.5.0')
await mkdir(evidence, { recursive: true })
let releaseBundle
let reachedBundle
const blocked = new Promise(resolveBlocked => { reachedBundle = resolveBlocked })
const gate = new Promise(resolveGate => { releaseBundle = resolveGate })
const application = await electron.launch({ executablePath: packaged.executablePath, cwd: packaged.root,
  env: { ...process.env, APPDATA: resolve(root, 'appdata'), LOCALAPPDATA: resolve(root, 'localappdata'),
    ZEROWALL_USER_DATA_DIR: resolve(root, 'user-data'), USERPROFILE: root, HOME: root }, timeout: 120_000,
})
let deadline
try {
  const page = await application.firstWindow()
  await page.route(/http:\/\/127\.0\.0\.1:\d+\/.*\.js(?:\?|$)/u, async route => {
    reachedBundle()
    await gate
    await route.continue().catch(() => {})
  })
  await Promise.race([blocked, new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('No client bundle reached the startup barrier')), 90_000) })])
  clearTimeout(deadline)
  const before = await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    return { visible: window.isVisible(), covers: window.contentView.children.filter(view => view.webContents && view.webContents.id !== window.webContents.id && view.webContents.getURL().includes('splash.html')).length }
  })
  assert.deepEqual(before, { visible: true, covers: 1 })
  const screenshot = await application.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'))
  await writeFile(resolve(evidence, 'startup-plugin-loading.png'), Buffer.from(screenshot, 'base64'))
  releaseBundle()
  await page.waitForFunction(() => document.documentElement.dataset.zerowallBoot === 'ready', undefined, { timeout: 90_000 })
  await page.waitForFunction(async () => (await window.zerowallDesktop.getStartupStatus()).phase === 'ready', undefined, { timeout: 90_000 })
  const after = await application.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    const deadline = Date.now() + 5000
    while (Date.now() < deadline && window.contentView.children.some(view => view.webContents && view.webContents.id !== window.webContents.id)) {
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    return { visible: window.isVisible(), covers: window.contentView.children.filter(view => view.webContents && view.webContents.id !== window.webContents.id).length }
  })
  if (after.covers !== 0) console.log(await application.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { main: w.webContents.id, children: w.contentView.children.map(v => ({ id: v.webContents?.id, url: v.webContents?.getURL().split('?')[0] })) } }))
  assert.deepEqual(after, { visible: true, covers: 0 })
  await writeFile(resolve(evidence, 'startup-cover.json'), JSON.stringify({ before, after, passed: true }, null, 2))
  console.log('Packaged startup retains one branded cover during blocked plugin loading, then reveals the ready workbench exactly once.')
} finally {
  clearTimeout(deadline)
  releaseBundle()
  await application.close().catch(() => {})
}
