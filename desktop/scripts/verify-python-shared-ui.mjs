import assert from 'node:assert/strict'
import { access, lstat, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron } from 'playwright'
import { locatePackagedApp } from './packaged-app.mjs'

// Exercise the real packaged component and preload with an isolated profile.
// First launch automatically installs the bundled base into this disposable
// profile; it never changes the user's environment. The explicit
// ZEROWALL_VERIFY_PYTHON_INSTALL=1 option also runs a source-only package install.
const desktop = resolve(import.meta.dirname, '..')
const version = JSON.parse(await readFile(resolve(desktop, 'package.json'), 'utf8')).version
const packaged = await locatePackagedApp(desktop)
const output = resolve(process.env.ZEROWALL_PACKAGED_OUTPUT ?? resolve(desktop, `../.build/python-ui-${version}/packaged`))
const profile = await mkdtemp(join(tmpdir(), `zerowall-python-${version.replaceAll('.', '')}-visual-`))
await mkdir(output, { recursive: true })
const env = { ...process.env, ZEROWALL_USER_DATA_DIR: join(profile, 'userdata'), ZEROWALL_DISABLE_DEFAULT_MCP: '1', APPDATA: join(profile, 'appdata'), LOCALAPPDATA: join(profile, 'localappdata') }
delete env.ELECTRON_RUN_AS_NODE
await Promise.all(['appdata', 'localappdata', 'userdata'].map(name => mkdir(join(profile, name), { recursive: true })))
const evidence = { executable: packaged.executablePath, profile, screenshots: [], pageErrors: [], layouts: [], startup: null, startupProgress: [], version: null, baseInstall: null, final: null, jobs: [] }
const electron = await _electron.launch({ executablePath: packaged.executablePath, args: [`--user-data-dir=${join(profile, 'chromium')}`], env, timeout: 120_000 })
let page
try {
  page = await electron.firstWindow({ timeout: 60_000 })
  page.on('pageerror', error => evidence.pageErrors.push(error.message))
  await page.waitForURL(url => /^https?:/u.test(url.protocol), { timeout: 180_000 })
  await page.getByRole('button', { name: /^(设置|Settings)$/ }).first().waitFor({ timeout: 60_000 })
  for (const [name, action] of [['内测声明', '继续'], ['添加一个 API Key 开始使用', '稍后配置']]) {
    const dialog = page.getByRole('dialog', { name, exact: true })
    await dialog.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button', { name: action, exact: true }).click()
  }
  const login = page.getByRole('dialog', { name: '登录或注册', exact: true })
  if (await login.isVisible().catch(() => false)) await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^(设置|Settings)$/ }).first().click({ timeout: 60_000 })
  const settings = page.getByRole('dialog', { name: /^(设置|Settings)$/ })
  await settings.getByRole('button', { name: /^(Python 环境|Python environment)$/ }).click()
  const panel = settings.getByRole('region', { name: /^(Python 环境|Python environment)$/ })
  await panel.getByRole('heading', { name: /^(Python 环境|Python environment)$/ }).waitFor()
  await page.waitForFunction(() => Boolean(window.zerowallDesktop?.pythonEnvironment))
  evidence.version = await page.evaluate(() => window.zerowallDesktop.info())
  assert.equal(evidence.version.version, version)
  evidence.startup = await page.evaluate(() => window.zerowallDesktop.pythonEnvironment({ action: 'status', requestId: crypto.randomUUID() }))
  const pending = panel.getByText(/^(正在刷新当前环境依赖清单…|Refreshing the active environment inventory…)$/)
  await pending.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {})
  for (const [width, height] of [[1440, 900], [1920, 1080], [760, 900]]) {
    await page.setViewportSize({ width, height })
    await panel.evaluate(element => { element.scrollTop = 0 })
    const layout = await panel.evaluate(element => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflowY: getComputedStyle(element).overflowY, fontSize: getComputedStyle(element).fontSize, background: getComputedStyle(element).backgroundColor }))
    assert(layout.scrollWidth <= layout.clientWidth + 1, `Python panel has horizontal overflow at ${width}px`)
    assert.equal(layout.overflowY, 'auto')
    const screenshot = join(output, `python-${width}x${height}.png`)
    await page.screenshot({ path: screenshot, fullPage: true }); evidence.screenshots.push(screenshot)
    await panel.evaluate(element => { element.scrollTop = element.scrollHeight })
    const bottom = join(output, `python-${width}x${height}-bottom.png`)
    await page.screenshot({ path: bottom, fullPage: true }); evidence.screenshots.push(bottom)
    evidence.layouts.push({ width, height, ...layout })
  }
  const jobsRoot = join(profile, 'userdata', 'zerowall-python', 'jobs')
  const waitForBaseInstall = async () => {
    const deadline = Date.now() + 20 * 60_000
    let previous
    while (Date.now() < deadline) {
      const status = await page.evaluate(() => window.zerowallDesktop.getMcpEnvironmentStatus())
      const stage = status.updateJob?.stage
      const marker = `${status.phase}:${stage ?? ''}:${status.progress ?? ''}`
      if (marker !== previous) { evidence.startupProgress.push({ phase: status.phase, stage, progress: status.progress, message: status.message }); console.log(`Automatic base runtime: ${stage ?? status.phase}`); previous = marker }
      if (stage === 'failed') throw new Error(status.lastUpdateError ?? status.message ?? 'Automatic base runtime installation failed')
      if (stage === 'ready' && status.phase === 'ready') return status
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    throw new Error('Automatic base runtime installation timed out')
  }
  evidence.baseInstall = await waitForBaseInstall()
  assert(evidence.startupProgress.some(item => item.stage === 'installing' || item.stage === 'downloading'), 'Automatic base installation did not report visible progress')
  const stablePython = join(profile, 'userdata', 'Python')
  await access(join(stablePython, 'python.exe'))
  assert.equal((await lstat(stablePython)).isSymbolicLink(), false, 'Shared Python must be a real stable directory')
  evidence.final = await page.evaluate(() => window.zerowallDesktop.pythonEnvironment({ action: 'status', requestId: crypto.randomUUID() }))
  const installed = await page.evaluate(() => window.zerowallDesktop.pythonEnvironment({ action: 'list_packages', requestId: crypto.randomUUID() }))
  assert.equal(installed.inventory.version, '3.12.10')
  assert(installed.inventory.packageCount > 0)
  evidence.jobs = await Promise.all((await readdir(jobsRoot).catch(() => [])).filter(name => name.endsWith('.json')).map(async name => JSON.parse(await readFile(join(jobsRoot, name), 'utf8'))))
  assert(evidence.jobs.some(job => job.method === 'initialize' && job.state === 'complete'), 'First launch must finish the base runtime installation')
  assert.equal(evidence.pageErrors.length, 0, 'Packaged renderer raised JavaScript errors')
  // Optional source-only package install still runs solely in the disposable
  // profile and validates that the newly installed base can be extended.
  if (process.env.ZEROWALL_VERIFY_PYTHON_INSTALL === '1') {
    const waitForTask = async (taskId, label) => {
      const deadline = Date.now() + 20 * 60_000
      let previous
      while (Date.now() < deadline) {
        const status = await page.evaluate(() => window.zerowallDesktop.getMcpEnvironmentStatus())
        const stage = status.updateJob?.stage
        if (stage !== previous) { console.log(`${label}: ${stage ?? status.phase}`); previous = stage }
        if ((!taskId || status.updateJob?.taskId === taskId) && stage === 'failed') throw new Error(status.lastUpdateError ?? status.message ?? `${label} failed`)
        if ((!taskId || status.updateJob?.taskId === taskId) && stage === 'ready' && status.phase === 'ready') return status
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
      throw new Error(`${label} timed out`)
    }
    const before = await page.evaluate(() => window.zerowallDesktop.pythonEnvironment({ action: 'list_packages', requestId: crypto.randomUUID() }))
    assert.equal(before.inventory.version, '3.12.10')
    assert(!before.inventory.packages.some(pkg => pkg.name.toLowerCase() === 'docopt'))
    console.log('Previewing a source-only package through packaged IPC')
    evidence.sourcePlan = await page.evaluate(() => window.zerowallDesktop.previewMcpPythonPackages(['docopt>=0.6.1,<0.7']))
    assert(!evidence.sourcePlan.error, evidence.sourcePlan.error)
    assert(evidence.sourcePlan.wheels.some(pkg => pkg.name === 'docopt' && pkg.sourceArchiveSha256 && pkg.hash && new URL(pkg.url).protocol === 'file:'), 'The source-only package plan must contain a verified wheel built from the pinned sdist')
    evidence.sourceJob = await page.evaluate(planId => window.zerowallDesktop.applyMcpPythonPackagePlan(planId), evidence.sourcePlan.planId)
    evidence.sourceInstall = await waitForTask(evidence.sourceJob.taskId, 'Source installation')
    assert.equal(evidence.sourceInstall.packageInventory.verification?.failedPackages?.length, 0, 'A partial package install is not a successful source-install smoke')
    evidence.installedInventory = await page.evaluate(() => window.zerowallDesktop.pythonEnvironment({ action: 'list_packages', requestId: crypto.randomUUID() }))
    assert(evidence.installedInventory.inventory.packages.some(pkg => pkg.name === 'docopt' && pkg.version === '0.6.2'))
    evidence.repeatPlan = await page.evaluate(() => window.zerowallDesktop.previewMcpPythonPackages(['docopt==0.6.2']))
    assert(!evidence.repeatPlan.error, evidence.repeatPlan.error)
    assert(!evidence.repeatPlan.changes.some(change => change.name.toLowerCase() === 'docopt'), 'An installed version must not be offered again after a fresh scan')
    evidence.final = await page.evaluate(() => window.zerowallDesktop.pythonEnvironment({ action: 'status', requestId: crypto.randomUUID() }))
    evidence.jobs = await Promise.all((await readdir(jobsRoot)).filter(name => name.endsWith('.json')).map(async name => JSON.parse(await readFile(join(jobsRoot, name), 'utf8'))))
    assert(evidence.jobs.every(job => job.state === 'complete'))
    assert.equal(evidence.pageErrors.length, 0)
  }
  await writeFile(join(output, 'verification.json'), JSON.stringify({ ok: true, ...evidence }, null, 2))
  console.log(`Packaged shared-Python UI verified: ${output}`)
} catch (error) {
  if (page) { await page.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {}); await writeFile(join(output, 'failure.txt'), await page.locator('body').innerText().catch(() => '')) }
  await writeFile(join(output, 'verification.json'), JSON.stringify({ ok: false, error: String(error), ...evidence }, null, 2))
  throw error
} finally { await electron.close() }
