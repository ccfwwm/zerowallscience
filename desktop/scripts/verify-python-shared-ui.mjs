import { contract } from '../../tools/build/paths.mjs'
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { access, lstat, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { _electron } from 'playwright'
import { locatePackagedApp } from './packaged-app.mjs'

// Exercise the real packaged component and preload with an isolated profile.
// Thin packages leave Python absent until installation is requested. Optional
// offline packages prepare their bundled base in this disposable profile. The explicit
// ZEROWALL_VERIFY_PYTHON_INSTALL=1 option also runs a source-only package install.
const desktop = resolve(import.meta.dirname, '..')
const version = JSON.parse(await readFile(resolve(desktop, 'package.json'), 'utf8')).version
const packaged = await locatePackagedApp(desktop)
const output = resolve(process.env.ZEROWALL_PYTHON_UI_OUTPUT ?? join(contract.verification, 'python-ui/packaged'))
const profile = await mkdtemp(join(tmpdir(), `zerowall-python-${version.replaceAll('.', '')}-visual-`))
await mkdir(output, { recursive: true })
const env = { ...process.env, ZEROWALL_USER_DATA_DIR: join(profile, 'userdata'), ZEROWALL_DISABLE_DEFAULT_MCP: '1', APPDATA: join(profile, 'appdata'), LOCALAPPDATA: join(profile, 'localappdata') }
delete env.ELECTRON_RUN_AS_NODE
await Promise.all(['appdata', 'localappdata', 'userdata'].map(name => mkdir(join(profile, name), { recursive: true })))
// Exercise the production default location using disposable LocalAppData.
// Do not seed an old location pointer or assume that a generation's physical
// executable is stored directly in the stable user-visible runtime root.
const isolatedRuntimeRoot = join(env.LOCALAPPDATA, 'ZeroWall Science', 'Python')
const evidence = { executable: packaged.executablePath, profile, screenshots: [], pageErrors: [], layouts: [], startup: null, startupProgress: [], version: null, baseInstall: null, final: null, jobs: [] }
const execFileAsync = promisify(execFile)
async function discoverManagedTools(command, args, cwd, expectedCount) {
  const child = spawn(command, args, { cwd, windowsHide: true, env: { ...env, ELECTRON_RUN_AS_NODE: '1', PYTHONNOUSERSITE: '1', PYTHONPATH: '' }, stdio: 'pipe' })
  const closed = new Promise(accept => child.once('close', accept))
  let buffer = '', errors = '', initialized = false
  try {
    return await new Promise((accept, reject) => {
      const timer = setTimeout(() => reject(new Error(`Packaged MCP discovery timed out: ${cwd}`)), 60_000)
      const finish = (error, tools) => { clearTimeout(timer); error ? reject(error) : accept(tools.map(tool => tool.name)) }
      child.once('error', error => finish(error))
      child.once('exit', code => finish(new Error(`Packaged MCP exited before discovery (${code}): ${errors}`)))
      child.stderr.on('data', chunk => { errors = (errors + String(chunk)).slice(-2000) })
      child.stdout.on('data', chunk => {
        buffer += String(chunk)
        const lines = buffer.split(/\r?\n/u); buffer = lines.pop() ?? ''
        for (const line of lines) {
          let response
          try { response = JSON.parse(line) } catch { continue }
          if (response.id === 1) {
            if (response.error || !response.result) return finish(new Error('Packaged MCP initialize failed'))
            initialized = true
            child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`)
          }
          if (response.id === 2) {
            if (!initialized || response.error || !Array.isArray(response.result?.tools)) return finish(new Error('Packaged MCP tools/list failed'))
            if (response.result.tools.length !== expectedCount) return finish(new Error(`Packaged MCP returned ${response.result.tools.length} tools; expected ${expectedCount}`))
            return finish(undefined, response.result.tools)
          }
        }
      })
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'zerowall-packaged-verification', version } } })}\n`)
    })
  } finally {
    child.kill()
    await closed
  }
}
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
    if (layout.scrollWidth > layout.clientWidth + 1) {
      const overflow = await panel.evaluate(element => {
        const edge = element.getBoundingClientRect().right
        return [...element.querySelectorAll('*')].map(node => ({
          tag: node.tagName.toLowerCase(), className: typeof node.className === 'string' ? node.className : '',
          right: Math.round(node.getBoundingClientRect().right), scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
        })).filter(item => item.right > edge + 1 || item.scrollWidth > item.clientWidth + 1).slice(0, 20)
      })
      console.error(`Python panel overflow at ${width}px: ${JSON.stringify({ layout, overflow })}`)
    }
    assert(layout.scrollWidth <= layout.clientWidth + 1, `Python panel has horizontal overflow at ${width}px`)
    assert.equal(layout.overflowY, 'auto')
    const screenshot = join(output, `python-${width}x${height}.png`)
    await page.screenshot({ path: screenshot, fullPage: true }); evidence.screenshots.push(screenshot)
    await panel.evaluate(element => { element.scrollTop = element.scrollHeight })
    const bottom = join(output, `python-${width}x${height}-bottom.png`)
    await page.screenshot({ path: bottom, fullPage: true }); evidence.screenshots.push(bottom)
    evidence.layouts.push({ width, height, ...layout })
  }
  const offlineBootstrap = await access(join(packaged.root, 'resources/python/base-runtime.zip')).then(() => true, () => false)
  if (!offlineBootstrap) {
    evidence.mode = 'thin-on-demand'
    const install = panel.getByRole('button', { name: /^(安装 Python|Install Python)$/ })
    await install.waitFor({ state: 'visible', timeout: 60_000 })
    assert(await install.isEnabled(), 'The missing-runtime installation action must be usable')
    await install.click()
    const confirmation = page.getByRole('dialog', { name: /^(安装共享 Python 运行时|Install the shared Python runtime)$/ })
    await confirmation.waitFor({ state: 'visible' })
    await confirmation.getByRole('button', { name: /^(关闭|Close)$/ }).click()
    await confirmation.waitFor({ state: 'hidden' })
    evidence.installConfirmation = 'opened-and-dismissed-without-download'
    evidence.final = await page.evaluate(() => window.zerowallDesktop.pythonEnvironment({ action: 'status', requestId: crypto.randomUUID() }))
    assert.equal(evidence.final.runtime, undefined, 'A thin package must not silently install a Python archive')
    assert.notEqual(evidence.final.status.phase, 'ready')
    assert.notEqual(evidence.final.status.phase, 'manual')
    assert(!['checking', 'downloading', 'installing', 'verifying'].includes(evidence.final.status.phase), 'A completed check must leave the install action available until Python is requested')
    assert.equal(evidence.final.status.updateJob, undefined, 'Startup must not schedule a runtime download')
    evidence.jobs = await readdir(join(dirname(isolatedRuntimeRoot), 'zerowall-python', 'jobs')).catch(error => { if (error.code === 'ENOENT') return []; throw error })
    assert.deepEqual(evidence.jobs, [], 'Startup must not persist an installation job')
    await access(join(isolatedRuntimeRoot, 'python.exe')).then(() => { throw new Error('Thin package unexpectedly installed Python') }, error => { if (error.code !== 'ENOENT') throw error })
    assert.equal(evidence.pageErrors.length, 0)
    await writeFile(join(output, 'verification.json'), JSON.stringify({ ok: true, mode: 'thin-on-demand', ...evidence }, null, 2))
    console.log(`Packaged thin-Python UI verified: ${output}`)
    process.exitCode = 0
  } else {
  // Offline first-run bootstrap uses the packaged signed archive and activates
  // a verified generation under the fixed LocalAppData manager.
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
  // Installation can finish before the UI opens. In that case its durable
  // completed job is the progress evidence, checked below.
  const stablePython = evidence.final?.runtimeRoot ?? await page.evaluate(() => window.zerowallDesktop.pythonEnvironment({ action: 'status', requestId: crypto.randomUUID() })).then(result => result.runtimeRoot)
  assert.equal(stablePython, isolatedRuntimeRoot, 'Packaged first-run test escaped its disposable Python runtime directory')
  evidence.final = await page.evaluate(() => window.zerowallDesktop.pythonEnvironment({ action: 'status', requestId: crypto.randomUUID() }))
  const installed = await page.evaluate(() => window.zerowallDesktop.pythonEnvironment({ action: 'list_packages', requestId: crypto.randomUUID() }))
  evidence.inventory = installed.inventory
  assert.equal(installed.inventory.version, '3.12.10')
  assert.equal(evidence.final.coreReady, true)
  assert.deepEqual(evidence.final.missingCorePackages, [])
  assert.equal(evidence.final.layers.bootstrap, 'ready')
  assert.equal(evidence.final.layers.core, 'ready')
  assert.equal(evidence.final.layers.science, 'not-installed', 'Startup must not install the science layer')
  assert.equal(installed.inventory.coreReady, true)
  const baseManifest = JSON.parse(await readFile(join(packaged.resourcesRoot, 'python/base-manifest.json'), 'utf8'))
  const corePackages = baseManifest.dependencies.corePackages
  assert.equal(installed.inventory.officialPackageCount, corePackages.length)
  assert.equal(installed.inventory.packageCount, corePackages.length, 'First launch must contain only the verified core closure')
  const normalize = name => name.toLowerCase().replace(/[-_.]+/gu, '-')
  const versions = new Map(installed.inventory.packages.map(pkg => [normalize(pkg.name), pkg.version]))
  for (const pkg of corePackages) assert.equal(versions.get(normalize(pkg.name)), pkg.requiredVersion, `Core package mismatch: ${pkg.name}`)
  const executable = installed.inventory.executable
  await access(executable)
  assert.equal((await lstat(dirname(executable))).isSymbolicLink(), false, 'The active generation must be a real directory')
  const jobsRoot = join(dirname(stablePython), 'zerowall-python', 'jobs')
  const current = JSON.parse(await readFile(join(dirname(jobsRoot), 'current.json'), 'utf8'))
  assert.equal(current.generation, true)
  assert.equal(resolve(current.root), resolve(installed.inventory.snapshotId))
  assert.equal(resolve(executable), resolve(current.root, 'Python/python.exe'))
  assert(!relative(join(dirname(jobsRoot), 'slots'), current.root).startsWith('..'), 'The active generation escaped the disposable manager')
  evidence.activeGeneration = current
  evidence.jobs = await Promise.all((await readdir(jobsRoot).catch(() => [])).filter(name => name.endsWith('.json')).map(async name => JSON.parse(await readFile(join(jobsRoot, name), 'utf8'))))
  assert(evidence.jobs.some(job => job.method === 'initialize' && job.state === 'complete'), 'First launch must finish the base runtime installation')
  assert(evidence.jobs.every(job => job.method === 'initialize'), 'Startup must not schedule a science download or synchronization')
  const pipCheck = await execFileAsync(executable, ['-s', '-B', '-m', 'pip', 'check'], { windowsHide: true, env: { ...env, PYTHONNOUSERSITE: '1', PYTHONPATH: '' } })
  evidence.pipCheck = pipCheck.stdout.trim()
  evidence.managedMcpTools = {
    bio: await discoverManagedTools(executable, ['-s', '-B', 'run_server.py', 'mcp_bio'], join(packaged.resourcesRoot, 'bio-tools'), 8),
    ketcher: await discoverManagedTools(packaged.executablePath, ['server.js'], join(packaged.resourcesRoot, 'ketcher-chemistry'), 7),
    sci: await discoverManagedTools(packaged.executablePath, ['dist/mcp.cjs'], join(packaged.resourcesRoot, 'sci'), 1),
  }
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
  }
  await writeFile(join(output, 'verification.json'), JSON.stringify({ ok: true, ...evidence }, null, 2))
  console.log(`Packaged shared-Python UI verified: ${output}`)
} catch (error) {
  if (page) { await page.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {}); await writeFile(join(output, 'failure.txt'), await page.locator('body').innerText().catch(() => '')) }
  await writeFile(join(output, 'verification.json'), JSON.stringify({ ok: false, error: String(error), ...evidence }, null, 2))
  throw error
} finally { await electron.close() }
