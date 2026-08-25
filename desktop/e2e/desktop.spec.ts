import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const executable = join(desktopRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
const roots: string[] = []
let application: ChildProcessWithoutNullStreams
let browser: Browser
let page: Page
let root: string
let applicationOutput = ''
const rendererOutput: string[] = []

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'zerowall-electron-e2e-')); roots.push(root)
  const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
  application = spawn(executable, ['--remote-debugging-port=0', `--user-data-dir=${join(root, 'chromium')}`, desktopRoot], {
    cwd: desktopRoot,
    env: {
      ...environment,
      APPDATA: join(root, 'appdata'),
      LOCALAPPDATA: join(root, 'localappdata'),
      ZEROWALL_USER_DATA_DIR: join(root, 'zerowall-user-data'),
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'false',
    },
    stdio: 'pipe',
  })
  const captureApplicationOutput = (chunk: Buffer): void => {
    applicationOutput = `${applicationOutput}${chunk.toString()}`.slice(-40_000)
  }
  application.stdout.on('data', captureApplicationOutput)
  application.stderr.on('data', captureApplicationOutput)
  const endpoint = await waitForDevToolsEndpoint(application, 150_000)
  browser = await chromium.connectOverCDP(endpoint)
  const context = browser.contexts()[0]
  if (!context) throw new Error('Electron did not expose a browser context')
  page = await waitForMainPage(context, application, 150_000)
  page.on('console', message => rendererOutput.push(`[console:${message.type()}] ${message.text()}`))
  page.on('pageerror', error => rendererOutput.push(`[pageerror] ${error.stack ?? error.message}`))
  try {
    await page.getByText('ZeroWall Science', { exact: true }).first().waitFor({ state: 'visible', timeout: 150_000 })
  } catch (error) {
    const body = await page.locator('body').innerText().catch(() => '(body unavailable)')
    throw new Error([
      error instanceof Error ? error.message : String(error),
      `Renderer URL: ${page.url()}`,
      `Renderer body:\n${body.slice(0, 20_000)}`,
      `Renderer diagnostics:\n${rendererOutput.slice(-100).join('\n')}`,
      `Electron diagnostics:\n${applicationOutput}`,
    ].join('\n\n'))
  }
  await expect.poll(() => page.getByRole('dialog', { name: '登录或注册' }).count()).toBe(0)
})

afterAll(async () => {
  await browser?.close().catch(() => undefined)
  stopProcessTree(application)
  for (const target of roots.splice(0)) rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

afterEach(async () => {
  await page.setViewportSize({ width: 1280, height: 900 })
  for (let depth = 0; depth < 4; depth += 1) {
    const visibleDialogs = page.locator('[role="dialog"]:visible')
    if (await visibleDialogs.count() === 0) break
    await page.keyboard.press('Escape')
    await page.waitForTimeout(50)
  }
})

describe('ZeroWall Science Electron', () => {
  it('loads a direct, sandboxed, fully ZeroWall-branded Renderer', async () => {
    expect(page.url()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
    expect(await page.locator('iframe').count()).toBe(0)
    expect(await page.getByText('ZeroWall Science', { exact: true }).count()).toBeGreaterThanOrEqual(2)
    expect(await page.getByText(/DeepSeek Harness/i).count()).toBe(0)
    const renderer = await page.evaluate(() => ({ process: typeof process, require: typeof (globalThis as { require?: unknown }).require, desktop: typeof (window as unknown as { zerowallDesktop?: unknown }).zerowallDesktop }))
    expect(renderer).toEqual({ process: 'undefined', require: 'undefined', desktop: 'object' })
    expect(await page.getByRole('button', { name: '科研项目' }).count()).toBe(0)
    expect(await page.getByRole('button', { name: '科研工作台' }).count()).toBe(0)
    expect(await page.getByRole('button', { name: 'MCP 连接' }).count()).toBe(0)
  })

  it('defaults to Chinese and switches between Chinese and English in Settings', async () => {
    await page.getByRole('button', { name: '设置' }).click()
    const settings = page.getByRole('dialog', { name: '设置' })
    await settings.waitFor({ state: 'visible' })
    await settings.getByRole('button', { name: /中文/ }).click()
    await page.getByRole('menuitem', { name: 'English' }).click()
    await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'visible' })
    await page.getByText('Language', { exact: true }).waitFor({ state: 'visible' })

    await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: /English/ }).click()
    await page.getByRole('menuitem', { name: '中文' }).click()
    await page.getByRole('dialog', { name: '设置' }).waitFor({ state: 'visible' })
    await page.keyboard.press('Escape')
    await expect.poll(() => page.getByRole('dialog', { name: '设置' }).count()).toBe(0)
  })

  it('integrates plugins, Skills, and MCP under Settings capabilities', async () => {
    await page.getByRole('button', { name: '设置' }).click()
    const settings = page.getByRole('dialog', { name: '设置' })
    await settings.getByRole('button', { name: '能力与扩展' }).click()
    await settings.getByText(/Skill 用于描述科研流程/).waitFor({ state: 'visible' })
    expect(await settings.getByRole('tab', { name: '插件配置' }).count()).toBe(1)
    await settings.getByRole('tab', { name: 'Skills' }).click()
    await settings.getByText(/科研 Skills/).waitFor({ state: 'visible' })
    await settings.getByRole('button', { name: '添加 Skill' }).waitFor({ state: 'visible' })
    await settings.getByRole('button', { name: '导入文件夹' }).waitFor({ state: 'visible' })
    await settings.getByPlaceholder('搜索名称、描述或使用场景').fill('literature')
    await expect.poll(
      () => settings.getByText('literature-review', { exact: true }).count(),
      { timeout: 30_000 },
    ).toBeGreaterThan(0)
    await settings.getByRole('tab', { name: 'MCP' }).click()
    await settings.getByRole('heading', { name: 'MCP 连接', exact: true }).waitFor({ state: 'visible' })
    await settings.getByText('新建连接', { exact: true }).waitFor({ state: 'visible' })
    await settings.getByRole('button', { name: '导入' }).waitFor({ state: 'visible' })
    await settings.getByRole('button', { name: '导出' }).waitFor({ state: 'visible' })
    await settings.getByRole('tab', { name: '插件列表' }).click()
    const optionalPlugin = settings.locator('[data-plugin-control="user-toggleable"]').first()
    await optionalPlugin.waitFor({ state: 'visible' })
    await optionalPlugin.getByRole('button', { name: /启用插件|停用插件/ }).waitFor({ state: 'visible' })
    expect(await settings.getByText('随 Agent 启用', { exact: true }).count()).toBeGreaterThan(0)
    await settings.getByRole('button', { name: '关闭' }).click()
    await expect.poll(() => page.getByRole('dialog', { name: '设置' }).count()).toBe(0)
  })

  it('opens the account surface without exposing credentials to the Renderer', async () => {
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'ZeroWall 云账户' }).click()
    const account = page.getByRole('dialog', { name: '登录或注册' })
    await account.waitFor({ state: 'visible' })
    expect(await page.getByLabel('密码').getAttribute('type')).toBe('password')
    const source = await page.evaluate(() => JSON.stringify((window as unknown as { zerowallDesktop: unknown }).zerowallDesktop))
    expect(source).not.toMatch(/credential|secret|token|password/i)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await account.evaluate((dialog) => [...dialog.querySelectorAll<HTMLElement>('*')]
      .filter(element => getComputedStyle(element).overflowX === 'visible' && element.scrollWidth > element.clientWidth + 1)
      .map(element => element.textContent?.trim().slice(0, 80) ?? element.tagName))).toEqual([])
  })
})

async function waitForDevToolsEndpoint(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<string> {
  return await new Promise<string>((resolveEndpoint, rejectEndpoint) => {
    let output = ''
    const timeout = setTimeout(() => rejectEndpoint(new Error(`Electron DevTools endpoint timed out.\n${output}`)), timeoutMs)
    const onData = (chunk: Buffer): void => {
      output = `${output}${chunk.toString()}`.slice(-20_000)
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (!match?.[1]) return
      clearTimeout(timeout)
      resolveEndpoint(match[1])
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.once('exit', (code) => {
      clearTimeout(timeout)
      rejectEndpoint(new Error(`Electron exited before exposing DevTools (code ${code ?? 'unknown'}).\n${output}`))
    })
  })
}

async function waitForMainPage(
  context: BrowserContext,
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const main = context.pages().find(candidate => /^http:\/\/127\.0\.0\.1:\d+\/$/.test(candidate.url()))
    if (main) return main
    if (child.exitCode !== null) {
      throw new Error(`Electron exited before the main page loaded (code ${String(child.exitCode)})`)
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  const urls = context.pages().map(candidate => candidate.url()).join(', ')
  throw new Error(`Electron did not expose the main Renderer page; observed: ${urls || '(none)'}`)
}

function stopProcessTree(child: ChildProcessWithoutNullStreams | undefined): void {
  if (!child?.pid || child.exitCode !== null) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
    return
  }
  child.kill('SIGTERM')
}
