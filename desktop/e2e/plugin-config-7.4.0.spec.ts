import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { locatePackagedApp } from '../scripts/packaged-app.mjs'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let application: ElectronApplication
let page: Page
let root: string

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'zerowall-plugin-config-740-'))
  for (const folder of ['appdata', 'localappdata']) mkdirSync(join(root, folder), { recursive: true })
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
      ZEROWALL_USER_DATA_DIR: join(root, 'user-data'),
    },
    timeout: 180_000,
  })
  page = await application.firstWindow()
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const startup = await page.evaluate(() => (window as unknown as {
      zerowallDesktop?: { getStartupStatus(): { phase: string } }
    }).zerowallDesktop?.getStartupStatus()).catch(() => undefined)
    if (startup?.phase === 'ready' && /^http:\/\/127\.0\.0\.1:\d+\/$/u.test(page.url())) break
    if (startup?.phase === 'failed') throw new Error(`Packaged Harness failed to start: ${JSON.stringify(startup)}`)
    await page.waitForTimeout(200)
  }
  if (Date.now() >= deadline) throw new Error(`Packaged workbench did not become ready: ${page.url()}`)
  await page.getByRole('button', { name: '插件', exact: true }).waitFor({ state: 'visible', timeout: 60_000 })
}, 180_000)

afterAll(async () => {
  await application?.close().catch(() => undefined)
  if (root) {
    const target = resolve(root)
    if (!target.startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error(`Refusing to remove non-temporary test data: ${target}`)
    rmSync(target, { recursive: true, force: true })
  }
})

it('shows one File Review row and saves its configuration', async () => {
  await page.getByRole('button', { name: '插件', exact: true }).click()
  await page.locator('[data-plugin-panel]').waitFor({ state: 'visible', timeout: 60_000 })
  await expect.poll(() => page.locator('[data-plugin-panel]').getAttribute('aria-busy'), { timeout: 60_000 }).toBe('false')
  const fileReview = page.locator('[data-plugin-item="row:dsh-file-review#file-review"]')
  await expect.poll(() => fileReview.count(), { timeout: 60_000 }).toBe(1)
  expect(await page.locator('[data-plugin-item*="dsh-file-review"]:not([data-plugin-item="row:dsh-file-review#file-review"])').count()).toBe(0)
  await fileReview.locator('button').first().click()
  const fileReviewDetail = page.locator('[data-plugin-item-detail="row:dsh-file-review#file-review"]')
  await fileReviewDetail.waitFor({ state: 'visible' })
  const wrap = fileReviewDetail.getByRole('switch')
  await wrap.waitFor({ state: 'visible', timeout: 30_000 })
  const previous = await wrap.getAttribute('aria-checked')
  await wrap.click()
  const expected = previous !== 'true'
  await expect.poll(() => wrap.getAttribute('aria-checked'), { timeout: 30_000 }).toBe(String(expected))
  const profilePatch = join(root, 'user-data', 'harness', 'profiles', 'web', 'cordis.patch.yml')
  await expect.poll(() => existsSync(profilePatch) ? readFileSync(profilePatch, 'utf8') : '', { timeout: 30_000 })
    .toContain(`wordWrap: ${String(expected)}`)
  expect(await fileReviewDetail.getByRole('alert').count()).toBe(0)
})

it('allows the packaged product renderer to capture microphone audio', async () => {
  const result = await page.evaluate(async () => {
    const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    const tracks = stream.getAudioTracks()
    const active = tracks.some(track => track.readyState === 'live')
    stream.getTracks().forEach(track => track.stop())
    return { secureContext: window.isSecureContext, permission: permission.state, audioTracks: tracks.length, active }
  })
  expect(result).toMatchObject({ secureContext: true, permission: 'granted', active: true })
  expect(result.audioTracks).toBeGreaterThan(0)
})
