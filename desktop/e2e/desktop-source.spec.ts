import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let application: ChildProcessWithoutNullStreams
let browser: Browser
let root: string
let page: Page

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'zerowall-electron-source-e2e-'))
  const executable = join(desktopRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
  application = spawn(executable, ['--remote-debugging-port=0', `--user-data-dir=${join(root, 'chromium')}`, desktopRoot], {
    cwd: desktopRoot,
    env: { ...process.env, ZEROWALL_USER_DATA_DIR: join(root, 'user-data') },
    stdio: 'pipe',
    windowsHide: true,
  })
  const endpoint = await waitEndpoint(application)
  browser = await chromium.connectOverCDP(endpoint)
  const context = browser.contexts()[0]
  if (!context) throw new Error('Source Electron did not expose a browser context.')
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const candidate = context.pages().find(candidate => candidate.url().startsWith('http://127.0.0.1:'))
    if (candidate) { page = candidate; return }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100))
  }
  throw new Error('Source Electron did not expose the main Renderer.')
})

afterAll(async () => {
  await browser?.close().catch(() => undefined)
  if (application?.pid && application.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(application.pid), '/t', '/f'], { stdio: 'ignore' })
    else application.kill('SIGTERM')
  }
  if (root) rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

describe('ZeroWall Science source Electron', () => {
  it('loads the sandboxed ZeroWall Renderer from the source runtime', async () => {
    await page.waitForLoadState('domcontentloaded', { timeout: 120_000 })
    expect(page.url()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
    expect(await page.locator('iframe').count()).toBe(0)
    await page.locator('body').waitFor({ state: 'attached', timeout: 30_000 })
    const renderer = await page.evaluate(() => ({
      process: typeof process,
      require: typeof (globalThis as { require?: unknown }).require,
      desktop: typeof (window as unknown as { zerowallDesktop?: unknown }).zerowallDesktop,
    }))
    expect(renderer).toEqual({ process: 'undefined', require: 'undefined', desktop: 'object' })
  })
})

async function waitEndpoint(child: ChildProcessWithoutNullStreams): Promise<string> {
  return await new Promise((resolveEndpoint, rejectEndpoint) => {
    let output = ''
    const timeout = setTimeout(() => rejectEndpoint(new Error(`Source Electron DevTools endpoint timed out.\n${output}`)), 120_000)
    const onData = (chunk: Buffer): void => {
      output = `${output}${chunk.toString()}`.slice(-20_000)
      const endpoint = /DevTools listening on (ws:\/\/[^\s]+)/u.exec(output)?.[1]
      if (!endpoint) return
      clearTimeout(timeout)
      resolveEndpoint(endpoint)
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.once('exit', code => { clearTimeout(timeout); rejectEndpoint(new Error(`Source Electron exited before DevTools was ready (${String(code)}).\n${output}`)) })
  })
}
