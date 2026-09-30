import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let application: ChildProcessWithoutNullStreams
let browser: Browser
let root: string
let page: Page
let applicationOutput = ''

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'zerowall-electron-source-e2e-'))
  mkdirSync(join(root, 'appdata'), { recursive: true })
  mkdirSync(join(root, 'localappdata'), { recursive: true })
  const executable = join(desktopRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
  application = spawn(executable, ['--remote-debugging-port=0', '--use-fake-device-for-media-stream', `--user-data-dir=${join(root, 'chromium')}`, desktopRoot], {
    cwd: desktopRoot,
    env: {
      ...process.env,
      APPDATA: join(root, 'appdata'),
      LOCALAPPDATA: join(root, 'localappdata'),
      USERPROFILE: root,
      HOME: root,
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
    if (candidate) {
      page = candidate
      await completeFirstRunOnboarding(page)
      return
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100))
  }
  throw new Error('Source Electron did not expose the main Renderer.')
})

afterAll(async () => {
  await browser?.close().catch(() => undefined)
  if (application?.pid && application.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(application.pid), '/t', '/f'], { stdio: 'ignore' })
    else application.kill('SIGTERM')
    await waitForExit(application)
  }
  if (root) {
    const target = resolve(root)
    if (!target.startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error(`Refusing to remove non-temporary E2E data: ${target}`)
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        rmSync(target, { recursive: true, force: true })
        break
      } catch (error) {
        if (attempt === 19 || !['EPERM', 'EBUSY', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
        await new Promise(resolveDelay => setTimeout(resolveDelay, 500))
      }
    }
  }
})

afterEach(async context => {
  if (context.task.result?.state !== 'fail') return
  console.log('Source visible dialogs:', await page.locator('[role="dialog"]:visible').allTextContents().catch(() => []))
})

describe('ZeroWall Science source Electron', () => {
  it('allows audio capture from the authenticated product renderer', async () => {
    await waitForHostBoot(page)
    const result = await page.evaluate(async () => {
      const state = (await navigator.permissions.query({ name: 'microphone' as PermissionName })).state
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
        const kinds = stream.getTracks().map(track => track.kind)
        stream.getTracks().forEach(track => track.stop())
        return { secureContext: window.isSecureContext, state, audio: kinds.includes('audio'), error: '' }
      } catch (error) {
        return { secureContext: window.isSecureContext, state, audio: false, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }
      }
    })
    console.info('ZeroWall renderer microphone permission:', JSON.stringify(result))
    expect(result, JSON.stringify({ result, applicationOutput })).toMatchObject({ secureContext: true, state: 'granted', audio: true, error: '' })
    const start = page.getByRole('button', { name: /^(开始录音|Start recording)$/u })
    const startCount = await start.count()
    console.info('ZeroWall renderer voice button:', JSON.stringify({ startCount, setupCount: await page.getByRole('button', { name: /^(打开语音输入引导|Open voice input setup)$/u }).count() }))
    if (startCount > 0) {
      await start.click()
      await page.locator('[data-voice-activity="recording"]').waitFor({ timeout: 15_000 })
      await page.locator('[data-voice-activity="recording"]').getByRole('button', { name: /^(取消|Cancel)$/u }).click()
    }
  })

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

  it('drags from title blanks without covering controls and toggles maximize', async () => {
    await waitForHostBoot(page)
    expect(await page.locator('#zerowall-window-drag').count()).toBe(0)
    const drag = page.locator('header[data-window-drag]:visible').first()
    await drag.waitFor({ state: 'visible', timeout: 60_000 })
    expect((await drag.boundingBox())?.height).toBeGreaterThan(20)
    expect(await drag.evaluate(element => getComputedStyle(element).getPropertyValue('-webkit-app-region'))).toBe('drag')
    expect(await page.locator('#zerowall-window-controls button').evaluateAll(buttons =>
      buttons.map(button => getComputedStyle(button).getPropertyValue('-webkit-app-region')),
    )).toEqual(['no-drag', 'no-drag', 'no-drag'])

    const toggle = page.locator('#zerowall-window-controls [data-action="toggle-maximize"]')
    await expect.poll(async () => await toggle.getAttribute('aria-label')).toBe('最大化')
    await toggle.click()
    await expect.poll(async () => await toggle.getAttribute('aria-label')).toBe('还原窗口')
    await toggle.click()
    await expect.poll(async () => await toggle.getAttribute('aria-label')).toBe('最大化')
  })

  it('bridges native copies through the trusted desktop API', async () => {
    await waitForHostBoot(page)
    expect(await page.getByRole('dialog', { name: '添加一个 API Key 开始使用' }).count()).toBe(0)
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
      stage: 'written',
      written: expect.stringMatching(/^(true|false)$/),
    })
    expect(JSON.parse(diagnostic.result ?? '{}')).toEqual({ written: diagnostic.written === 'true' })
    expect(await button.getAttribute('data-error')).toBeNull()
    await button.evaluate(element => element.remove())
  })
})

async function waitForHostBoot(target: Page): Promise<void> {
  await target.waitForFunction(() => Array.isArray((window as unknown as {
    __DSH_BOOT__?: { entries?: unknown[] }
  }).__DSH_BOOT__?.entries), undefined, { timeout: 120_000 })
}

async function completeFirstRunOnboarding(target: Page): Promise<void> {
  await target.waitForLoadState('domcontentloaded', { timeout: 120_000 })
  await waitForHostBoot(target)
  await target.getByRole('button', { name: '设置', exact: true }).waitFor({ state: 'visible', timeout: 60_000 })
  await target.waitForTimeout(500)
  expect(await target.getByRole('dialog', { name: '内测声明' }).count()).toBe(0)
  expect(await target.getByRole('dialog', { name: '添加一个 API Key 开始使用' }).count()).toBe(0)
}

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
