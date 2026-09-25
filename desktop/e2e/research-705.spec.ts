import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { locatePackagedApp } from '../scripts/packaged-app.mjs'

const desktopRoot = resolve(import.meta.dirname, '..')
let root: string
let application: ChildProcessWithoutNullStreams
let browser: Browser
let page: Page

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'zerowall-705-ui-'))
  const packaged = await locatePackagedApp(desktopRoot)
  const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
  application = spawn(packaged.executablePath, ['--remote-debugging-port=0', `--user-data-dir=${join(root, 'chromium')}`], {
    cwd: packaged.root,
    env: {
      ...environment,
      APPDATA: join(root, 'appdata'),
      LOCALAPPDATA: join(root, 'localappdata'),
      ZEROWALL_USER_DATA_DIR: join(root, 'zerowall-user-data'),
      USERPROFILE: root,
      HOME: root,
    },
    stdio: 'pipe',
    windowsHide: true,
  })
  const endpoint = await new Promise<string>((resolveEndpoint, rejectEndpoint) => {
    let output = ''
    const timer = setTimeout(() => rejectEndpoint(new Error(`DevTools did not start: ${output}`)), 150_000)
    const capture = (chunk: Buffer): void => {
      output = `${output}${chunk.toString()}`.slice(-20_000)
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/u)
      if (match?.[1]) { clearTimeout(timer); resolveEndpoint(match[1]) }
    }
    application.stdout.on('data', capture)
    application.stderr.on('data', capture)
    application.once('exit', code => { clearTimeout(timer); rejectEndpoint(new Error(`Electron exited: ${code}\n${output}`)) })
  })
  browser = await chromium.connectOverCDP(endpoint)
  const context = browser.contexts()[0]
  if (!context) throw new Error('Packaged Electron exposed no browser context')
  const deadline = Date.now() + 150_000
  while (Date.now() < deadline) {
    const candidate = context.pages().find(item => /^http:\/\/127\.0\.0\.1:\d+\/$/u.test(item.url()))
    if (candidate) { page = candidate; break }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100))
  }
  if (!page) throw new Error('Packaged Electron exposed no main page')
  await page.getByText('ZeroWall Science', { exact: true }).first().waitFor({ state: 'visible', timeout: 150_000 })
  const notice = page.getByRole('dialog', { name: '内测声明' })
  await notice.waitFor({ state: 'visible', timeout: 30_000 })
  await notice.getByRole('button', { name: '继续' }).click()
  const credential = page.getByRole('dialog', { name: '添加一个 API Key 开始使用' })
  if (await credential.waitFor({ state: 'visible', timeout: 30_000 }).then(() => true, () => false)) {
    await credential.getByRole('button', { name: '稍后配置' }).click()
  }
}, 180_000)

afterAll(async () => {
  if (application?.pid && application.exitCode === null) spawnSync('taskkill', ['/pid', String(application.pid), '/t', '/f'], { stdio: 'ignore' })
  await browser?.close().catch(() => undefined)
  if (root) rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

it('loads nine research cards and their images at desktop and narrow widths', async () => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const output = join(desktopRoot, 'dist', 'verification-7.0.5')
  mkdirSync(output, { recursive: true })
  const workspacePath = join(root, 'research-705-workspace')
  mkdirSync(workspacePath)
  await page.evaluate(async path => {
    const rpc = async (method: string, request: unknown) => {
      const response = await fetch(`/api/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { request } } }) })
      const envelope = await response.json()
      if (!response.ok || !envelope.result?.ok) throw new Error(`${method}: ${JSON.stringify(envelope)}`)
      return envelope.result.value
    }
    const workspace = await rpc('workspace/create', { path })
    const session = await rpc('session/create', { workspaceId: workspace.workspace.workspaceId })
    await rpc('session/rename', { sessionId: session.sessionId, title: '科研工作台查看测试' })
  }, workspacePath)
  await page.reload()
  const reopenedCredential = page.getByRole('dialog', { name: '添加一个 API Key 开始使用' })
  if (await reopenedCredential.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false)) {
    await reopenedCredential.getByRole('button', { name: '稍后配置' }).click()
    await reopenedCredential.waitFor({ state: 'hidden' })
  }
  await page.getByText('research-705-workspace', { exact: true }).first().click()
  await page.getByText('research-705-workspace', { exact: true }).first().hover()
  await page.getByRole('button', { name: '在“research-705-workspace”中新建会话', exact: true }).click()
  await page.getByRole('textbox', { name: /^描述你想要构建/u }).fill('科研工作台查看测试')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  const stop = page.getByRole('button', { name: '停止生成', exact: true })
  if (await stop.isVisible().catch(() => false)) await stop.click()
  await page.screenshot({ path: join(output, 'research-before-navigation.png') })
  const pane = page.locator('[data-sidebar-right-panel]')
  const expand = page.locator('[data-sidebar-right-expand]').first()
  if (await expand.isVisible().catch(() => false)) await expand.click()
  const newTab = pane.getByRole('button', { name: '新标签页', exact: true })
  if (await newTab.isVisible().catch(() => false)) await newTab.click()
  await pane.locator('[data-sidebar-right-guide-entry$="science-workbench"]').click()
  const home = pane.getByRole('region', { name: '科研工具' })
  await home.waitFor({ state: 'visible', timeout: 30_000 })
  expect(await home.getByRole('button').count()).toBe(9)
  expect(await home.locator('img').count()).toBe(9)
  expect(await home.locator('img').evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: join(output, 'research-desktop.png') })
  await page.setViewportSize({ width: 390, height: 800 })
  await page.screenshot({ path: join(output, 'research-mobile.png') })
  const geometry = await home.getByRole('button').evaluateAll(buttons => buttons.map(button => {
    const box = button.getBoundingClientRect()
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
  }))
  expect(geometry.every(box => box.right <= 390 && box.left >= 0)).toBe(true)
  expect(geometry.every((box, index) => index === 0 || box.top >= geometry[index - 1]!.bottom)).toBe(true)
}, 60_000)
