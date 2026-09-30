import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { PDFDocument } from 'pdf-lib'
import { locatePackagedApp } from '../scripts/packaged-app.mjs'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const title = '附件预览回归'
const textBytes = Buffer.from('ZeroWall attachment preview and clipboard\n', 'utf8')
let application: ElectronApplication
let page: Page
let root: string
let userData: string
let sessionPath: string
let otherSessionPath: string
let pdfBytes: Buffer
let modelServer: Server
let modelRequests = 0

function mockModelResponse(text: string): string {
  const events: object[] = [
    { type: 'message_start', message: { id: 'zerowall-repair-response', model: 'mock-model', usage: { input_tokens: 3, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
    { type: 'message_stop' },
  ]
  return events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'zerowall-740-repair-e2e-'))
  userData = join(root, 'user-data')
  for (const folder of ['appdata', 'localappdata', 'user-data/harness']) mkdirSync(join(root, folder), { recursive: true })
  const document = await PDFDocument.create()
  const sheet = document.addPage([300, 300])
  sheet.drawText('ZeroWall PDF preview', { x: 20, y: 250 })
  pdfBytes = Buffer.from(await document.save())

  modelServer = createServer((request, response) => {
    if (request.method !== 'POST' || !request.url?.endsWith('/messages')) {
      response.writeHead(404).end()
      return
    }
    request.resume()
    request.once('end', () => {
      modelRequests += 1
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end(mockModelResponse('Attachment regression complete'))
    })
  })
  await new Promise<void>(resolveListen => modelServer.listen(0, '127.0.0.1', resolveListen))
  const address = modelServer.address()
  if (address === null || typeof address === 'string') throw new Error('Mock model did not bind a local port')

  const packaged = await locatePackagedApp(desktopRoot)
  application = await electron.launch({
    executablePath: packaged.executablePath,
    cwd: packaged.root,
    args: ['--remote-debugging-port=0', `--user-data-dir=${join(root, 'chromium')}`],
    env: {
      ...process.env,
      APPDATA: join(root, 'appdata'),
      LOCALAPPDATA: join(root, 'localappdata'),
      USERPROFILE: root,
      ZEROWALL_USER_DATA_DIR: userData,
      DEEPSEEK_API_KEY: 'zerowall-local-repair-test',
      DEEPSEEK_BASE_URL: `http://127.0.0.1:${address.port}`,
    },
    timeout: 150_000,
  })
  page = await application.firstWindow()
  const rendererLogs: string[] = []
  const requestLogs: string[] = []
  page.on('console', message => rendererLogs.push(`[${message.type()}] ${message.text()}`))
  page.on('pageerror', error => rendererLogs.push(`[pageerror] ${error.stack ?? error.message}`))
  page.on('request', request => {
    if (request.url().includes('/api/session/') && request.method() === 'POST') requestLogs.push(`${request.url()} ${request.postData()?.slice(0, 1400)}`)
  })
  await ready(page)
  await page.getByRole('button', { name: '设置', exact: true }).waitFor({ state: 'visible', timeout: 60_000 })
  expect(await page.getByRole('dialog', { name: '内测声明' }).count()).toBe(0)
  expect(await page.getByRole('dialog', { name: '添加一个 API Key 开始使用' }).count()).toBe(0)

  const workspacePath = join(root, 'repair-workspace')
  mkdirSync(workspacePath, { recursive: true })
  const workspaceId = await page.evaluate(async ({ workspacePath }) => {
    const rpc = async (method: string, request: unknown) => {
      const response = await fetch(`/api/${method}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { request } } }),
      })
      const envelope = await response.json()
      if (!response.ok || !envelope.result?.ok) throw new Error(`${method}: ${JSON.stringify(envelope)}`)
      return envelope.result.value
    }
    const workspace = await rpc('workspace/create', { path: workspacePath })
    return workspace.workspace.workspaceId as string
  }, { workspacePath })
  await page.reload()
  await ready(page)
  await page.getByText('repair-workspace', { exact: true }).first().click()
  // The row's hover action animates away after workspace selection. Dispatch
  // the same button action directly for fixture setup; interaction behavior is
  // tested separately below.
  await page.getByRole('button', { name: '在“repair-workspace”中新建会话', exact: true }).dispatchEvent('click')
  await page.getByRole('button', { name: /选择模型，当前/ }).first().waitFor({ timeout: 60_000 })
  await page.locator('input[type="file"]').setInputFiles([
    { name: 'report.txt', mimeType: 'text/plain', buffer: textBytes },
    { name: 'paper.pdf', mimeType: 'application/pdf', buffer: pdfBytes },
  ])
  const pending = page.getByRole('group', { name: '待发送附件' })
  await pending.getByText('report.txt').waitFor({ state: 'visible', timeout: 30_000 })
  await pending.getByText('paper.pdf').waitFor({ state: 'visible', timeout: 30_000 })
  // The Hero and the active Session can briefly coexist during a workspace
  // switch. Target the composer that owns the uploaded files so text and file
  // receipts are admitted to the same Session.
  const composer = page.locator('[data-composer-card]').filter({ has: pending }).first()
  console.log('COMPOSERS BEFORE FILL', await page.locator('[data-composer-card]').evaluateAll(cards => cards.map(card => ({ text: card.textContent?.slice(0, 200), labels: [...card.querySelectorAll('[aria-label]')].map(node => node.getAttribute('aria-label')).slice(0, 12) }))))
  await composer.getByRole('textbox').fill(title)
  console.log('COMPOSERS AFTER FILL', await page.locator('[data-composer-card]').evaluateAll(cards => cards.map(card => ({ text: card.textContent?.slice(0, 200), labels: [...card.querySelectorAll('[aria-label]')].map(node => node.getAttribute('aria-label')).slice(0, 12) }))))
  await composer.getByRole('button', { name: '发送消息', exact: true }).click()
  await page.getByRole('button', { name: '预览文件 report.txt' }).waitFor({ state: 'visible', timeout: 8_000 }).catch(async error => {
    const hostLog = join(userData, 'logs', 'harness.log')
    const hostOutput = existsSync(hostLog) ? readFileSync(hostLog, 'utf8').slice(-8_000) : '(missing)'
    const journals: string[] = []
    const inspect = (directory: string) => {
      if (!existsSync(directory)) return
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) inspect(path)
        else if (/^session\.v\d+\.jsonl$/u.test(entry.name)) {
          for (const line of readFileSync(path, 'utf8').split('\n')) {
            if (line.includes('user/message')) journals.push(line.slice(0, 4000))
          }
        }
      }
    }
    inspect(join(userData, 'harness', 'sessions'))
    const titled = await page.locator('[title]').evaluateAll(elements => elements.map(element => element.getAttribute('title')).filter(Boolean))
    throw new Error(`${String(error)}\nUI:\n${(await page.locator('body').innerText()).slice(-8_000)}\nTitles: ${JSON.stringify(titled.slice(-100))}\nJournals: ${JSON.stringify(journals.filter(line => line.includes('附件预览回归')))}\nRPC: ${requestLogs.slice(-15).join('\n')}\nRenderer:\n${rendererLogs.slice(-60).join('\n')}\nHost:\n${hostOutput}\nMock model requests: ${modelRequests}`)
  })
  await page.getByRole('button', { name: '预览文件 paper.pdf' }).waitFor({ state: 'visible', timeout: 30_000 })
  expect(modelRequests).toBeGreaterThan(0)
  const stop = page.getByRole('button', { name: '停止生成', exact: true })
  if (await stop.isVisible()) await stop.click()
  const created = await page.evaluate(async ({ workspacePath, workspaceId }) => {
    const rpc = async (method: string, request: unknown) => {
      const response = await fetch(`/api/${method}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { request } } }),
      })
      const envelope = await response.json()
      if (!response.ok || !envelope.result?.ok) throw new Error(`${method}: ${JSON.stringify(envelope)}`)
      return envelope.result.value
    }
    const listed = await fetch('/api/session/list', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'session/list', payload: { args: { _request: {} } } }),
    }).then(response => response.json())
    const selected = listed.result.value.find((session: { cwd?: string; blank?: boolean }) => session.cwd === workspacePath && !session.blank)
    if (selected === undefined) throw new Error(`UI-created session not found: ${JSON.stringify(listed)}`)
    const other = await rpc('session/create', { workspaceId })
    return { selectedId: selected.sessionId, otherId: other.sessionId }
  }, { workspacePath, workspaceId })
  const locateSessionFile = (directory: string, sessionId: string): string | undefined => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const candidate = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === sessionId) {
          const file = readdirSync(candidate).find(name => /^session\.v\d+\.jsonl$/u.test(name))
          if (file !== undefined) return join(candidate, file)
        }
        const nested = locateSessionFile(candidate, sessionId)
        if (nested !== undefined) return nested
      }
    }
    return undefined
  }
  const sessionsRoot = join(userData, 'harness', 'sessions')
  sessionPath = locateSessionFile(sessionsRoot, created.selectedId) ?? ''
  otherSessionPath = locateSessionFile(sessionsRoot, created.otherId) ?? ''
  if (sessionPath === '' || otherSessionPath === '') throw new Error('Session journal files were not created')
}, 180_000)

afterAll(async () => {
  await application?.close().catch(() => undefined)
  if (modelServer) await new Promise<void>(resolveClose => modelServer.close(() => resolveClose()))
  if (root) rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 })
})

afterEach(async context => {
  if (context.task.result?.state !== 'fail') return
  console.log('Repair E2E page:', page.url())
  console.log('Repair E2E body:', (await page.locator('body').innerText().catch(() => '')).slice(0, 8_000))
  const log = join(userData, 'logs', 'harness.log')
  if (existsSync(log)) console.log('Repair E2E Host log:', readFileSync(log, 'utf8').slice(-4_000))
})

describe('ZeroWall Science 7.4.0 packaged repairs', () => {
  it('keeps the right sidebar controls clickable before and after maximize', async () => {
    expect(await page.locator('#zerowall-window-drag').count()).toBe(0)
    await expect.poll(() => page.evaluate(() => ({
      skin: localStorage.getItem('dsh-dream-skin:skin'),
      wallpaper: localStorage.getItem('dsh-dream-skin:wallpaper'),
      imageLayer: [...document.body.children].some(element => (element as HTMLElement).style.backgroundImage.includes('url(')),
    }))).toEqual({ skin: 'ivory', wallpaper: '', imageLayer: false })
    await page.getByText(title, { exact: true }).first().click()
    await page.getByRole('button', { name: '预览文件 report.txt' }).click()
    const toggle = page.locator('#zerowall-window-controls [data-action="toggle-maximize"]')
    const expand = page.locator('[data-sidebar-right-expand]:visible').first()
    if (await expand.count()) await expand.click()
    const right = page.locator('[data-sidebar-right-panel]:visible').first()
    await right.waitFor()
    const check = async () => {
      for (const selector of ['[data-dockkit-tab]', '[data-dockkit-add-tab]', '[data-dockkit-split-button]', '[data-sidebar-right-mode]', '[data-sidebar-right-toggle]']) {
        const button = right.locator(`${selector}:visible`).first()
        if (!await button.count() || await button.isDisabled()) continue
        expect(await button.evaluate(element => getComputedStyle(element).getPropertyValue('-webkit-app-region'))).toBe('no-drag')
        await button.click({ trial: true })
      }
    }
    await check()
    await toggle.click()
    await expect.poll(() => toggle.getAttribute('aria-label')).toBe('还原窗口')
    await check()
    await toggle.click()
    await expect.poll(() => toggle.getAttribute('aria-label')).toBe('最大化')
  })

  it('opens Free Search, File Review and file-viewer settings and localizes Appearance', async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click()
    let settings = page.getByRole('dialog', { name: '设置' })
    await settings.getByRole('button', { name: '外观', exact: true }).waitFor()
    await settings.getByRole('button', { name: '插件配置', exact: true }).click()
    await settings.getByRole('button', { name: /Free Search 搜索引擎/ }).click()
    const freeSearch = page.locator('.dshfs-card')
    await freeSearch.waitFor({ state: 'visible' })
    await freeSearch.locator('.dshfs-header').click()
    const ttl = freeSearch.locator('input.dshfs-ttl')
    await ttl.waitFor({ state: 'visible' })
    await ttl.fill('4')
    await freeSearch.locator('button.dshfs-save').click()
    await expect.poll(() => freeSearch.locator('button.dshfs-save').isDisabled()).toBe(true)
    await page.getByRole('button', { name: '设置', exact: true }).click()
    settings = page.getByRole('dialog', { name: '设置' })
    await settings.getByRole('button', { name: '插件配置', exact: true }).click()
    await settings.getByRole('button', { name: /File Review 文件审查/ }).click()
    const reviewHeader = page.getByRole('button', { name: /展开: 文件审查/ })
    await reviewHeader.waitFor({ state: 'visible' })
    await reviewHeader.click()
    const layout = page.getByRole('combobox', { name: '差异显示' })
    await layout.selectOption('unified')
    await expect.poll(() => layout.inputValue()).toBe('unified')
    await page.getByRole('button', { name: '设置', exact: true }).click()
    settings = page.getByRole('dialog', { name: '设置' })
    await settings.getByRole('button', { name: '插件配置', exact: true }).click()
    await settings.getByRole('button', { name: /侧边栏文件预览/ }).click()
    const viewers = settings.getByText('文件预览', { exact: true }).first().locator('xpath=../..')
    const viewerToggle = viewers.locator('button[aria-pressed]').first()
    await viewerToggle.waitFor({ state: 'visible' })
    const wasEnabled = await viewerToggle.getAttribute('aria-pressed')
    await viewerToggle.click()
    await expect.poll(() => viewerToggle.getAttribute('aria-pressed')).toBe(wasEnabled === 'true' ? 'false' : 'true')
    await viewerToggle.click()
    await expect.poll(() => viewerToggle.getAttribute('aria-pressed')).toBe(wasEnabled)

    await settings.getByRole('button', { name: /中文/ }).click()
    await page.getByRole('menuitem', { name: 'English' }).click()
    const english = page.getByRole('dialog', { name: 'Settings' })
    await english.getByRole('button', { name: 'Appearance', exact: true }).waitFor()
    expect(await english.getByRole('button', { name: '外观', exact: true }).count()).toBe(0)
    await english.getByRole('button', { name: 'General', exact: true }).click()
    await english.getByRole('button', { name: /English/ }).click()
    await page.getByRole('menuitem', { name: '中文' }).click()
    await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click()
  }, 120_000)

  it('previews, copies and re-adds current-session text and PDF file cards', async () => {
    await page.getByText(title, { exact: true }).first().click()
    const textCard = page.locator('[title="report.txt"]').filter({ has: page.getByRole('button', { name: '预览文件 report.txt' }) }).first()
    await textCard.getByRole('button', { name: '预览文件 report.txt' }).click()
    const right = page.locator('[data-sidebar-right-panel]:visible').first()
    await expect.poll(() => right.getByText('ZeroWall attachment preview and clipboard').count()).toBeGreaterThan(0)

    await textCard.getByRole('button', { name: '复制文件' }).click()
    await textCard.getByText('文件已复制', { exact: true }).waitFor({ state: 'visible' })
    await textCard.getByRole('button', { name: '重新添加到对话' }).click()
    await page.getByRole('group', { name: '待发送附件' }).getByText('report.txt').waitFor()
    await page.getByRole('button', { name: '预览文件 paper.pdf' }).click()
    await expect.poll(() => right.locator('[data-dockkit-tab]:visible').filter({ hasText: 'paper.pdf' }).count()).toBeGreaterThan(0)
    await expect.poll(() => right.locator('iframe[title="paper.pdf"]').count()).toBeGreaterThan(0)

    const pdfCard = page.locator('[title="paper.pdf"]').filter({ has: page.getByRole('button', { name: '预览文件 paper.pdf' }) }).first()
    await pdfCard.dragTo(page.locator('[data-composer-card]').first())
    await page.getByRole('group', { name: '待发送附件' }).getByText('paper.pdf').waitFor()
  }, 120_000)

  it('deletes the selected conversation through its menu and keeps the Host and other session', async () => {
    await application.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
    })
    const row = page.getByRole('treeitem').filter({ hasText: title }).first()
    await row.hover()
    await row.locator('button[aria-label^="会话"][aria-label$="的操作"]').click()
    await page.getByRole('menuitem', { name: '删除会话', exact: true }).click()
    await expect.poll(() => existsSync(sessionPath), { timeout: 60_000 }).toBe(false)
    await ready(page)
    await expect.poll(() => page.getByText(title, { exact: true }).count()).toBe(0)
    expect(existsSync(otherSessionPath)).toBe(true)
    const response = await page.evaluate(async () => await fetch('/api/session/list', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'session/list', payload: { args: { _request: {} } } }),
    }).then(result => result.json()))
    expect(response.result.ok).toBe(true)
  }, 120_000)
})

async function ready(target: Page): Promise<void> {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const status = await target.evaluate(() => (window as unknown as { zerowallDesktop?: { getStartupStatus(): { phase: string } } }).zerowallDesktop?.getStartupStatus()).catch(() => undefined)
    if (status?.phase === 'ready' && /^http:\/\/127\.0\.0\.1:\d+\/$/u.test(target.url())) return
    if (status?.phase === 'failed') throw new Error('Packaged Host reported startup failure.')
    await target.waitForTimeout(200)
  }
  throw new Error(`Packaged workbench did not become ready: ${target.url()}`)
}
