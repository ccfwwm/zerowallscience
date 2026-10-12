import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

// A fresh, isolated Electron profile proves installation in an already open
// workbench. Do not use a real user's directory as the verification output.
const installation = resolve(process.argv[2]), output = resolve(process.argv[3])
const id = '@michengai/dsh-archive-manager'
const { chromium } = createRequire(resolve('desktop/package.json'))('playwright')
await mkdir(output, { recursive: false })
for (const directory of ['appdata', 'localappdata', 'user-data', 'chromium']) await mkdir(join(output, directory))
const executable = join(installation, 'ZeroWallScience.exe')
const child = spawn(executable, ['--remote-debugging-port=0', `--user-data-dir=${join(output, 'chromium')}`], {
  cwd: dirname(executable), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, APPDATA: join(output, 'appdata'), LOCALAPPDATA: join(output, 'localappdata'), ZEROWALL_USER_DATA_DIR: join(output, 'user-data') },
})
const receipt = { complete: false, desktopVersion: '8.1.3', plugin: id, checks: [] }
let browser, page, log = ''
const errors = []
const consoleErrors = []
const redact = value => String(value).replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]')
async function captureSettings(label) {
  receipt[label] = await page.evaluate(() => ({
    language: document.documentElement.lang,
    viewport: { width: innerWidth, height: innerHeight },
    archivePanel: Boolean(document.querySelector('.dsham_settings')),
    navigation: [...document.querySelectorAll('[data-shortcut-modal=settings] nav button')].map(button => ({
      text: button.textContent, current: button.getAttribute('aria-current'),
      ancestors: [button, button.parentElement, button.closest('nav')].map(node => ({
        className: node.className, display: getComputedStyle(node).display,
        visibility: getComputedStyle(node).visibility, rectangle: node.getBoundingClientRect().toJSON(),
      })),
    })),
  }))
  await page.screenshot({ path: join(output, `${label}.png`) })
}
try {
  const endpoint = await new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(new Error('DevTools endpoint timeout')), 60000)
    const capture = bytes => {
      log = (log + bytes).slice(-30000)
      const match = /DevTools listening on (ws:\/\/[^\s]+)/u.exec(log)
      if (match) { clearTimeout(timer); accept(match[1]) }
    }
    child.stdout.on('data', capture); child.stderr.on('data', capture)
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Electron exited: ${code}`)) })
  })
  browser = await chromium.connectOverCDP(endpoint)
  const context = browser.contexts()[0]
  const until = Date.now() + 150000
  while (Date.now() < until) {
    page = context.pages().find(candidate => candidate.url().startsWith('http://127.0.0.1:'))
    if (page) {
      await page.evaluate(() => {
        for (const button of document.querySelectorAll('[role=dialog] button')) {
          if (['继续', 'Continue', '稍后配置', 'Set up later', 'Configure later'].includes(button.textContent?.trim())) button.click()
        }
      }).catch(() => {})
      const status = await page.evaluate(() => window.zerowallDesktop?.getStartupStatus()).catch(() => undefined)
      if (status?.phase === 'failed') throw new Error(status.message)
      if (status?.phase === 'ready' && await page.locator('[contenteditable=true]:visible').count()) break
    }
    await new Promise(accept => setTimeout(accept, 250))
  }
  assert(page && await page.locator('[contenteditable=true]:visible').count(), 'Initial Electron workbench must be ready')
  assert.equal(await page.evaluate(id => window.__DSH_BOOT__.entries.some(row => row.id === id), id), false)
  const initialDocument = await page.evaluate(() => performance.timeOrigin)
  receipt.checks.push({ name: 'existing Electron workbench starts without optional archive plugin', complete: true })
  page.on('pageerror', error => errors.push(redact(error.message)))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(redact(message.text())) })
  const started = await page.evaluate(id => window.zerowallDesktop.resources.startJob('plugin', 'install', id), id)
  console.log('Archive installation submitted from running Electron')
  let job
  const installUntil = Date.now() + 240000
  while (Date.now() < installUntil) {
    job = await page.evaluate(taskId => window.zerowallDesktop.resources.getJob(taskId), started.taskId).catch(() => undefined)
    if (job && !['queued', 'running'].includes(job.status)) break
    await new Promise(accept => setTimeout(accept, 500))
  }
  assert.equal(job?.status, 'succeeded', redact(job?.error ?? 'Installation timed out'))
  receipt.job = { status: job.status, phase: job.phase, oldVersion: job.oldVersion, newVersion: job.newVersion }
  // Host activation completes before Electron's asynchronous navigation. A
  // transient HMR view of the old document is not the new workbench.
  await page.waitForFunction(async ({ id, initialDocument }) =>
    performance.timeOrigin > initialDocument
    && (await window.zerowallDesktop?.getStartupStatus())?.phase === 'ready'
    && !document.querySelector('[data-dsh-boot]')
    && document.querySelector(`[data-plugin="${id}"]`)
    && [...document.querySelectorAll('[contenteditable=true]')].some(node => node.getBoundingClientRect().width > 0),
  { id, initialDocument }, { timeout: 60000 })
  receipt.renderer = { initialDocument, activatedDocument: await page.evaluate(() => performance.timeOrigin) }
  // Use the user's route through Settings, after dismissing fixture onboarding
  // and the read-only update notice. Both can arrive asynchronously on reload.
  const settingsDeadline = Date.now() + 30000
  const archiveNavigation = page.getByRole('button', { name: '归档会话', exact: true })
  while (Date.now() < settingsDeadline && !await archiveNavigation.isVisible()) {
    await page.evaluate(() => {
      for (const button of document.querySelectorAll('[role=dialog] button')) {
        if (['继续', 'Continue', '稍后配置', 'Set up later', 'Configure later', '关闭'].includes(button.textContent?.trim())) button.click()
      }
    })
    await page.getByRole('button', { name: '设置', exact: true }).click({ timeout: 1000 }).catch(() => {})
    await new Promise(accept => setTimeout(accept, 250))
  }
  await archiveNavigation.waitFor({ timeout: 1000 })
  await archiveNavigation.click()
  await page.locator('.dsham_settings').waitFor({ timeout: 30000 })
  await captureSettings('after-install')
  receipt.settingsVisible = await page.getByRole('button', { name: '归档会话', exact: true }).isVisible()
  assert.equal(receipt.settingsVisible, true)
  assert.equal(await page.evaluate(() => window.zerowallDesktop.info()).then(info => info.version), '8.1.3')
  await page.screenshot({ path: join(output, 'archive-settings-after-install.png') })
  receipt.checks.push({ name: 'signed installation refreshes the already open Electron workbench and renders archive settings without desktop upgrade or manual relaunch', complete: true })
  receipt.errors = errors
  assert.deepEqual(errors, [])
  receipt.complete = true
  console.log('Live Electron installation and archive settings passed')
} catch (error) {
  receipt.error = redact(error.stack ?? error)
  if (page && !page.isClosed()) await captureSettings('failure').catch(() => {})
  throw error
}
finally {
  receipt.errors = errors
  receipt.consoleErrors = consoleErrors
  await browser?.close().catch(() => {})
  if (child.pid && child.exitCode === null) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  await writeFile(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n')
  await writeFile(join(output, 'process-redacted.log'), redact(log))
}
