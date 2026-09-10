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
let applicationOutput = ''

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'zerowall-electron-source-e2e-'))
  const executable = join(desktopRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
  application = spawn(executable, ['--remote-debugging-port=0', `--user-data-dir=${join(root, 'chromium')}`, desktopRoot], {
    cwd: desktopRoot,
    env: {
      ...process.env,
      ZEROWALL_USER_DATA_DIR: join(root, 'user-data'),
    },
    stdio: 'pipe',
    windowsHide: true,
  })
  const captureApplicationOutput = (chunk: Buffer): void => {
    applicationOutput = `${applicationOutput}${chunk.toString()}`.slice(-20_000)
  }
  application.stdout.on('data', captureApplicationOutput)
  application.stderr.on('data', captureApplicationOutput)
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
  if (application?.pid && application.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(application.pid), '/t', '/f'], { stdio: 'ignore' })
    else application.kill('SIGTERM')
    await waitForExit(application)
  }
  await browser?.close().catch(() => undefined)
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

  it('bridges native copies through the trusted desktop API', async () => {
    await page.waitForLoadState('domcontentloaded', { timeout: 120_000 })
    await page.locator('body').waitFor({ state: 'attached', timeout: 30_000 })
    const probe = `ZeroWall clipboard ${Date.now()}`
    await page.evaluate((text) => {
      const button = document.createElement('button')
      button.id = 'zerowall-source-clipboard-probe'
      button.textContent = 'clipboard probe'
      button.addEventListener('click', () => {
        button.dataset.stage = 'clicked'
        void (async () => {
          const desktop = (window as unknown as {
            zerowallDesktop?: { copyText?: (value: string) => Promise<boolean> }
          }).zerowallDesktop
          const written = await desktop?.copyText?.(text)
          button.dataset.written = String(written)
          button.dataset.result = JSON.stringify({ written })
          button.dataset.stage = 'written'
        })().catch((error: unknown) => {
          button.dataset.error = error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error)
          button.dataset.stage = 'error'
        })
      })
      document.body.appendChild(button)
    }, probe)

    const button = page.locator('#zerowall-source-clipboard-probe')
    await button.click()
    await expect.poll(async () => await button.evaluate(element => ({
      error: element.getAttribute('data-error'),
      result: element.getAttribute('data-result'),
    })), { timeout: 5_000 }).not.toEqual({ error: null, result: null })
    const diagnostic = await button.evaluate(element => ({
      error: element.getAttribute('data-error'),
      result: element.getAttribute('data-result'),
      stage: element.getAttribute('data-stage'),
      written: element.getAttribute('data-written'),
    }))
    expect(diagnostic, JSON.stringify({ diagnostic, applicationOutput }, null, 2)).toMatchObject({
      error: null,
      result: JSON.stringify({ written: true }),
      stage: 'written',
      written: 'true',
    })
    expect(await button.getAttribute('data-error')).toBeNull()
    await button.evaluate(element => element.remove())
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

async function waitForExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return
  await Promise.race([
    new Promise<void>(resolveExit => child.once('exit', () => resolveExit())),
    new Promise<void>(resolveTimeout => setTimeout(resolveTimeout, 5_000)),
  ])
}
