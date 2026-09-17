import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { locatePackagedApp } from './packaged-app.mjs'

const packaged = await locatePackagedApp(resolve(import.meta.dirname, '..'))
const root = await mkdtemp(resolve(tmpdir(), 'zerowall-actions-'))
for (const dir of ['appdata', 'localappdata']) await mkdir(resolve(root, dir))
const rows = (await readFile(process.env.ZEROWALL_ZOTERO_REPLAY_LOG ?? 'C:/Users/ccf/Downloads/session.v3.jsonl', 'utf8')).trim().split(/\r?\n/u).map(JSON.parse)
rows[0].cwd = root
const project = `--${root.replace(/[:\\/]+/gu, '-')}--`
const dir = resolve(root, 'user-data/harness/sessions', project, rows[0].id)
await mkdir(dir, { recursive: true })
await writeFile(resolve(dir, 'session.v3.jsonl'), rows.map(JSON.stringify).join('\n') + '\n')
const application = await electron.launch({ executablePath: packaged.executablePath, cwd: packaged.root,
  env: { ...process.env, APPDATA: resolve(root, 'appdata'), LOCALAPPDATA: resolve(root, 'localappdata'),
    ZEROWALL_USER_DATA_DIR: resolve(root, 'user-data'), USERPROFILE: root }, timeout: 120000 })
let page
try {
  page = await application.firstWindow()
  page.on('pageerror', error => console.log('PAGEERROR:', error.message))
  await page.waitForFunction(() => !!window.__DSH_BOOT__, undefined, { timeout: 120000 })
  const notice = page.getByRole('dialog', { name: '内测声明' })
  await notice.waitFor({ timeout: 120000 }); await notice.getByRole('button', { name: '继续' }).click()
  const credential = page.getByRole('dialog', { name: '添加一个 API Key 开始使用' })
  if (await credential.waitFor({ timeout: 5000 }).then(() => true, () => false)) await credential.getByRole('button', { name: '稍后配置' }).click()
  await page.getByText(root.split(/[\\/]/u).at(-1), { exact: true }).first().click()
  await page.getByText(root.split(/[\\/]/u).at(-1), { exact: true }).nth(1).click({ timeout: 30000 })
  const tabs = page.locator('[data-conversation-view]')
  await tabs.locator('[data-conversation-tab="chat"]').click()
  const prior = await application.evaluate(async ({ clipboard }) => await clipboard.readText())
  try {
    const bridge = await page.evaluate(() => window.zerowallDesktop.copyText('ZeroWall native clipboard 中文 regression'))
    const written = await application.evaluate(async ({ clipboard }) => await clipboard.readText())
    console.log('Bridge clipboard:', bridge, 'native match:', written === 'ZeroWall native clipboard 中文 regression')
    assert.equal(written, 'ZeroWall native clipboard 中文 regression')
    const copies = page.getByRole('button', { name: /^(复制|Copy)$/ })
    console.log('Chat copy controls:', await copies.count())
    await copies.first().click()
    await page.waitForTimeout(500)
    const chatText = await application.evaluate(async ({ clipboard }) => await clipboard.readText())
    assert.notEqual(chatText, written, 'Chat button left the clipboard unchanged')
    assert.ok(chatText.length > 0)
    console.log('Chat copy wrote', chatText.length, 'characters')
    await application.evaluate(async ({ clipboard }) => { await clipboard.writeText('assistant sentinel') })
    await copies.last().click()
    await page.waitForTimeout(250)
    assert.notEqual(await application.evaluate(async ({ clipboard }) => await clipboard.readText()), 'assistant sentinel')
    if (process.env.ZEROWALL_PROBE_COPY_ONLY === '1') process.exitCode = 0
    else {
      await tabs.locator('[data-conversation-tab="zotero"]').click()
      const entries = page.locator('[role="option"][data-provenance]')
      await entries.nth(1).click()
      const metadata = page.locator('[data-zotero-metadata]')
      await metadata.waitFor({ timeout: 30000 })
      console.log('Live Zotero metadata rendered:', (await metadata.innerText()).length, 'characters')
      await application.evaluate(({ shell }) => {
        globalThis.__zoteroOpened = []
        shell.openExternal = async url => { globalThis.__zoteroOpened.push(url) }
      })
      await page.getByRole('link', { name: /在 Zotero 中打开|Open in Zotero/ }).click()
      assert.match((await application.evaluate(() => globalThis.__zoteroOpened))[0], /^zotero:\/\/select\//)
      await page.getByRole('button', { name: /问这篇|Ask about this/ }).click()
      await page.waitForFunction(() => document.querySelector('[data-conversation-view]')?.getAttribute('data-conversation-view') === 'chat')
      assert.match(await page.locator('[data-composer-seat] [contenteditable]').innerText(), /zotero:\/\//)
      await tabs.locator('[data-conversation-tab="zotero"]').click()
      await page.getByRole('button', { name: /^(导出引用|Export citation)$/ }).click()
      const exported = page.locator('[data-zotero-export="bibtex"]')
      await exported.waitFor({ timeout: 30000 })
      const citation = await exported.locator('pre').innerText()
      assert.match(citation, /@\w+\s*\{/)
      await exported.getByRole('button', { name: /复制引用|Copy citation/ }).click()
      await page.waitForTimeout(250)
      assert.equal(await application.evaluate(async ({ clipboard }) => await clipboard.readText()), citation)
      const destination = resolve(root, 'citation.bib')
      await application.evaluate(({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath })
      }, destination)
      await exported.getByRole('button', { name: /下载引用|Download citation/ }).click()
      await page.getByRole('status').filter({ hasText: /引用已保存|Citation saved/ }).waitFor()
      assert.equal(await readFile(destination, 'utf8'), citation)
      await page.screenshot({ path: resolve(root, 'zotero-actions.png') })
      console.log('Zotero details, open protocol, chat navigation, citation generation/copy/download passed.')
    }
  } finally { await application.evaluate(async ({ clipboard }, value) => { await clipboard.writeText(value) }, prior) }
} catch (error) {
  await page?.screenshot({ path: resolve(root, 'failure.png') }).catch(() => {})
  await writeFile(resolve(root, 'failure.txt'), await page?.locator('body').innerText().catch(() => '') ?? '')
  throw error
} finally { console.log('Evidence:', root); await application.close() }
