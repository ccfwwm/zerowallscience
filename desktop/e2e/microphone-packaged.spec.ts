/** Packaged product click path using an isolated profile and a verified local voice cache. */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import { locatePackagedApp } from '../scripts/packaged-app.mjs'

const desktopRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

it.skipIf(process.platform !== 'win32')('records from the packaged ZeroWall microphone button', async () => {
  const sourceCache = process.env.ZEROWALL_VOICE_TEST_CACHE
    ?? join(process.env.APPDATA ?? '', 'zerowall-science', 'harness', 'speech-to-text', 'sensevoice')
  if (!existsSync(join(sourceCache, 'models', 'sensevoice-onnx', 'model.int8.onnx'))) {
    throw new Error('A verified local SenseVoice cache is required for the packaged voice button test.')
  }
  const scratch = mkdtempSync(join(tmpdir(), 'zerowall-packaged-voice-'))
  const target = resolve(scratch)
  if (!target.startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error(`Unsafe temporary directory: ${target}`)
  const userData = join(scratch, 'user-data')
  for (const folder of ['appdata', 'localappdata', 'user-data/harness']) mkdirSync(join(scratch, folder), { recursive: true })
  cpSync(sourceCache, join(userData, 'harness', 'speech-to-text', 'sensevoice'), { recursive: true })
  const packaged = await locatePackagedApp(desktopRoot)
  const application = await electron.launch({
    executablePath: packaged.executablePath,
    cwd: packaged.root,
    args: ['--use-fake-device-for-media-stream', '--remote-debugging-port=0', `--user-data-dir=${join(scratch, 'chromium')}`],
    env: {
      ...process.env,
      APPDATA: join(scratch, 'appdata'), LOCALAPPDATA: join(scratch, 'localappdata'), USERPROFILE: scratch,
      ZEROWALL_USER_DATA_DIR: userData,
    },
    timeout: 150_000,
  })
  try {
    const page = await application.firstWindow()
    const clientErrors: string[] = []
    page.on('pageerror', error => clientErrors.push(error.message))
    await expect.poll(async () => {
      const status = await page.evaluate(() => (window as unknown as {
        zerowallDesktop?: { getStartupStatus(): Promise<{ phase: string }> }
      }).zerowallDesktop?.getStartupStatus()).catch(() => undefined)
      return status?.phase
    }, { timeout: 180_000 }).toBe('ready')
    await page.getByRole('button', { name: '插件', exact: true }).click()
    const bundle = page.locator('[data-plugin-package="@deepseek-ai/dsh-experimental-voice-input-bundle"]')
    await bundle.waitFor({ timeout: 60_000 })
    const toggle = bundle.getByRole('switch')
    await toggle.waitFor()
    if (await toggle.getAttribute('aria-checked') !== 'true') await toggle.click()
    await expect.poll(() => toggle.getAttribute('aria-checked'), { timeout: 30_000 }).toBe('true')
    const setup = page.getByRole('dialog', { name: /语音输入|Voice input/u })
    if (await setup.count() > 0) {
      const later = setup.getByRole('button', { name: /稍后|Later/u })
      if (await later.count() > 0) await later.click()
    }
    const conversation = page.getByRole('button', { name: /^(新建会话|New session)$/u }).first()
    if (await conversation.count() > 0) await conversation.click()
    const mic = page.getByRole('button', { name: /^(开始录音|Start recording)$/u }).first()
    await mic.waitFor({ state: 'visible', timeout: 12_000 })
    const before = await page.evaluate(async () => ({
      state: (await navigator.permissions.query({ name: 'microphone' as PermissionName })).state,
      secureContext: window.isSecureContext,
    }))
    await mic.click()
    const recording = page.locator('[data-voice-activity="recording"]')
    try {
      await recording.waitFor({ state: 'visible', timeout: 15_000 })
    } catch (error) {
      const activity = await page.locator('[data-voice-activity]').evaluateAll(nodes => nodes.map(node => ({ phase: node.getAttribute('data-voice-activity'), text: node.textContent })))
      const logPath = join(userData, 'logs', 'harness.log')
      const hostTail = existsSync(logPath) ? readFileSync(logPath, 'utf8').slice(-2000) : '(no host log)'
      throw new Error(`Voice button did not record: ${JSON.stringify({ before, activity, clientErrors, hostTail })}; ${String(error)}`)
    }
    console.info('Packaged voice button:', JSON.stringify({ before, phase: await recording.getAttribute('data-voice-activity'), clientErrors }))
    await recording.getByRole('button', { name: /^(取消|Cancel)$/u }).click()
    await recording.waitFor({ state: 'hidden' })
    expect(clientErrors).toEqual([])
  } finally {
    await application.close()
    rmSync(target, { recursive: true, force: true })
  }
}, 240_000)
