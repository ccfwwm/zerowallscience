import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { locatePackagedApp } from './packaged-app.mjs'

// Isolated regression: a genuinely invalid saved SSH record must surface a
// recoverable startup error. Correcting it and restarting must open the UI.
const packaged = await locatePackagedApp(resolve(import.meta.dirname, '..'))
const root = await mkdtemp(resolve(tmpdir(), 'zerowall-startup-recovery-'))
const userData = resolve(root, 'user-data')
const profilePath = resolve(userData, 'harness/storages/ssh_ops_profiles.json')
await mkdir(resolve(userData, 'harness/storages'), { recursive: true })
await mkdir(resolve(root, 'appdata'), { recursive: true })
await mkdir(resolve(root, 'localappdata'), { recursive: true })
const storage = { unit: { name: 'ssh_ops_profiles', version: 1 }, global: null, tables: { profiles: {
  '00000000-0000-4000-8000-000000000001': {
    name: 'Regression resource', host: '192.0.2.1', port: 'invalid-port', username: 'test', authKind: 'key', groupId: null,
    defaultProjectPath: null, createdAt: '2026-09-17T00:00:00Z', updatedAt: '2026-09-17T00:00:00Z',
  },
}, groups: {} } }
await writeFile(profilePath, JSON.stringify(storage))
const application = await electron.launch({ executablePath: packaged.executablePath, cwd: packaged.root,
  env: { ...process.env, APPDATA: resolve(root, 'appdata'), LOCALAPPDATA: resolve(root, 'localappdata'),
    ZEROWALL_USER_DATA_DIR: userData, USERPROFILE: root, HOME: root }, timeout: 120_000,
})
try {
  const page = await application.firstWindow()
  await page.locator('.track').waitFor()
  if (!await page.locator('body').evaluate(el => el.classList.contains('failed'))
    && await page.locator('.actions').isVisible()) throw new Error('Startup recovery actions must stay hidden until failure')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const before = await page.locator('.track').evaluate(el => getComputedStyle(el, '::after').transform)
  await page.waitForTimeout(350)
  const after = await page.locator('.track').evaluate(el => getComputedStyle(el, '::after').transform)
  if (before === after) throw new Error('Startup animation did not advance between stage updates')
  await page.screenshot({ path: resolve(root, 'startup-progress.png') })
  await waitForStartup(page, 'failed')
  await page.locator('#error').waitFor({ state: 'visible' })
  const error = await page.locator('#error').innerText()
  if (!error.includes('ssh_ops_profiles')) throw new Error(`Startup did not show the saved-profile failure: ${error}; evidence: ${root}`)
  for (const name of ['重新启动', '打开日志', '退出']) await page.getByRole('button', { name, exact: true }).waitFor({ state: 'visible' })
  await page.screenshot({ path: resolve(root, 'startup-failed.png') })
  // Intercept only the OS relaunch primitive: the real restart IPC and quit
  // path must stop its Host first, and then ask Electron to relaunch.
  await application.evaluate(({ app }) => {
    app.relaunch = () => { process.stdout.write('RESTART_AFTER_HOST_STOP\n') }
  })
  let output = ''
  application.process().stdout.on('data', chunk => { output += chunk })
  const exited = new Promise(resolveExit => application.process().once('exit', resolveExit))
  await page.evaluate(() => window.zerowallDesktop.restart()).catch(() => {})
  await exited
  if (!output.includes('RESTART_AFTER_HOST_STOP')) throw new Error('Restart did not invoke relaunch after shutdown')
  storage.tables.profiles['00000000-0000-4000-8000-000000000001'].port = 22
  await writeFile(profilePath, JSON.stringify(storage))
  console.log(`Failure UI and restart shutdown verified. Evidence: ${root}`)
} finally { await application.close().catch(() => {}) }
const recovered = await electron.launch({ executablePath: packaged.executablePath, cwd: packaged.root,
  env: { ...process.env, APPDATA: resolve(root, 'appdata'), LOCALAPPDATA: resolve(root, 'localappdata'),
    ZEROWALL_USER_DATA_DIR: userData, USERPROFILE: root, HOME: root }, timeout: 120_000,
})
try {
  const page = await recovered.firstWindow()
  await waitForStartup(page, 'ready')
  await page.screenshot({ path: resolve(root, 'startup-recovered.png') })
  const status = await page.evaluate(() => window.zerowallDesktop.getStartupStatus())
  console.log(`Recovered workbench ready in ${Date.now() - status.startedAt} ms with null project folder. ${root}`)
  const rows = (await readFile(resolve(userData, 'logs/startup.log'), 'utf8')).trim().split(/\r?\n/u).map(JSON.parse)
  if (!rows.some(row => row.phase === 'failed') || !rows.some(row => row.phase === 'ready')) throw new Error('Startup diagnostics missed state transitions')
  const endpoint = new URL(page.url()).origin
  await recovered.evaluate(({ app }) => {
    app.relaunch = () => { process.stdout.write('READY_RESTART_AFTER_HOST_STOP\n') }
  })
  let output = ''
  recovered.process().stdout.on('data', chunk => { output += chunk })
  const exited = new Promise(resolveExit => recovered.process().once('exit', resolveExit))
  await page.evaluate(() => window.zerowallDesktop.restart()).catch(() => {})
  await exited
  if (!output.includes('READY_RESTART_AFTER_HOST_STOP')) throw new Error('Ready application did not request relaunch')
  const stillListening = await fetch(endpoint, { signal: AbortSignal.timeout(2_000) }).then(() => true, () => false)
  if (stillListening) throw new Error('Old Host remains listening after restart shutdown')
  console.log('Ready-state restart stopped the old Host endpoint before relaunch.')
} finally { await recovered.close().catch(() => {}) }

async function waitForStartup(page, phase) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.zerowallDesktop?.getStartupStatus()).catch(() => undefined)
    if (state?.phase === phase) return
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(`Startup did not reach ${phase}. Evidence: ${root}`)
}
