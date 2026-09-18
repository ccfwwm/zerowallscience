import { spawn, spawnSync, execFileSync, type ChildProcess } from 'node:child_process'
import { cp, mkdir, readFile, writeFile, link, access } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { createServer, type Server } from 'node:http'
import { createReadStream } from 'node:fs'

const work = resolve('../.build/python-updater/packaged-smoke')
const packageRoot = resolve(process.env.ZEROWALL_PACKAGED_OUTPUT ?? '../.build/python-updater/package')
const executable = join(packageRoot, 'win-unpacked/ZeroWallScience.exe')
let application: ChildProcess | undefined; let browser: Browser | undefined
let manifestServer: Server | undefined
async function inspect(url: string, expression: string): Promise<any> {
  return new Promise((accept, reject) => {
    const socket = new WebSocket(url)
    const timer = setTimeout(() => { socket.close(); reject(new Error('Main inspector timed out')) }, 10_000)
    socket.onopen = () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }))
    socket.onerror = () => { clearTimeout(timer); socket.close(); reject(new Error('Main inspector unavailable')) }
    socket.onmessage = event => {
      const message = JSON.parse(String(event.data))
      if (message.id !== 1) return
      clearTimeout(timer); socket.close()
      if (message.error || message.result?.exceptionDetails) reject(new Error(JSON.stringify(message.error ?? message.result.exceptionDetails)))
      else accept(message.result?.result?.value)
    }
  })
}
function workerPeakMiB(): number {
  const executableLiteral = executable.replaceAll("'", "''")
  const command = `Get-CimInstance Win32_Process -Filter "Name = 'ZeroWallScience.exe'" | Where-Object { $_.CommandLine -like '*python-updater-worker.js*' -and $_.ExecutablePath -eq '${executableLiteral}' } | ForEach-Object { (Get-Process -Id $_.ProcessId).PeakWorkingSet64 / 1MB } | ConvertTo-Json`
  const result = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', windowsHide: true }).trim() || '0')
  return Math.max(...(Array.isArray(result) ? result : [result]))
}
afterAll(async () => { if (application?.pid) spawnSync('taskkill', ['/pid', String(application.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' }); await browser?.close(); manifestServer?.close() })
it('keeps the packaged UI responsive while installing the real archive and refreshes all dependencies', async () => {
  await mkdir(work, { recursive: true })
  const profile = join(work, 'profile'); const root = join(profile, 'zerowall-python')
  await mkdir(join(root, 'downloads'), { recursive: true })
  const previous = JSON.parse(await readFile(resolve('../.build/python-1.4.0/client-pointer-rollback/current.json'), 'utf8'))
  const manifest = JSON.parse(await readFile(resolve('../.build/python-1.4.0/dist/latest.json'), 'utf8'))
  manifestServer = createServer((_request, response) => { response.setHeader('content-type', 'application/json'); createReadStream(resolve('../.build/python-1.4.0/dist/latest.json')).pipe(response) })
  await new Promise<void>(accept => manifestServer!.listen(0, '127.0.0.1', accept))
  const manifestUrl = `http://127.0.0.1:${(manifestServer.address() as { port: number }).port}/latest.json`
  await writeFile(join(root, 'current.json'), JSON.stringify(previous))
  await cp(join(process.env.APPDATA!, 'zerowall-science/zerowall-python/python-overlay'), join(root, 'python-overlay'), { recursive: true })
  await link(resolve('../.build/python-1.4.0/dist/zerowall-python-windows-x64-1.4.0.zip'), join(root, 'downloads', `${manifest.archiveSha256}.part`)).catch(error => { if (error.code !== 'EEXIST') throw error })
  // Verify the dedicated worker cannot silently borrow dependencies from the
  // repository enclosing this test package.
  for (const entry of ['package.json', 'out/main/python-updater-worker.js', 'node_modules/yauzl/index.js', 'node_modules/pend/index.js']) await access(join(packageRoot, 'win-unpacked/resources/app.asar.unpacked', entry))
  const errors: string[] = []
  let inspectorUrl = ''
  const loopP95: number[] = []; const workerPeaks: number[] = []
  const launch = async () => {
  let output = ''
  application = spawn(executable, ['--inspect=0', '--remote-debugging-port=0', `--user-data-dir=${join(work, 'chromium')}`], { windowsHide: true, stdio: 'pipe', env: { ...process.env, ZEROWALL_USER_DATA_DIR: profile, ZEROWALL_DISABLE_DEFAULT_MCP: '1', ZEROWALL_PYTHON_MANIFEST: manifestUrl } })
  const endpoint = await new Promise<string>((accept, reject) => {
    const timer = setTimeout(() => reject(new Error(output)), 150_000)
    const capture = (data: Buffer) => { output = (output + data).slice(-20_000); inspectorUrl = output.match(/Debugger listening on (ws:\/\/\S+)/u)?.[1] ?? inspectorUrl; const url = output.match(/DevTools listening on (ws:\/\/\S+)/u)?.[1]; if (url) { clearTimeout(timer); accept(url) } }
    application!.stdout!.on('data', capture); application!.stderr!.on('data', capture)
    application!.once('error', error => { clearTimeout(timer); reject(error) })
  })
  browser = await chromium.connectOverCDP(endpoint)
  await expect.poll(() => browser!.contexts()[0]?.pages().some(page => /^http:\/\/127\.0\.0\.1/u.test(page.url())), { timeout: 150_000 }).toBe(true)
  const page = browser.contexts()[0]!.pages().find(page => /^http:\/\/127\.0\.0\.1/u.test(page.url()))!
  page.on('pageerror', error => errors.push(String(error)))
  const notice = page.getByRole('dialog', { name: '内测声明' })
  try { await notice.waitFor({ state: 'visible', timeout: 15_000 }); await notice.getByRole('button', { name: '继续' }).click(); await notice.waitFor({ state: 'hidden' }) } catch { /* already onboarded */ }
  const credential = page.getByRole('dialog', { name: '添加一个 API Key 开始使用' })
  try { await credential.waitFor({ timeout: 15_000 }); await credential.getByRole('button', { name: '稍后配置' }).click() } catch { /* already onboarded */ }
  const account = page.getByRole('dialog', { name: '登录或注册' })
  if (await account.isVisible().catch(() => false)) {
    const close = account.getByRole('button', { name: /关闭|Close/ })
    if (await close.count()) await close.first().click(); else await page.keyboard.press('Escape')
  }
  await page.getByRole('button', { name: '设置', exact: true }).click().catch(async error => { await page.screenshot({ path: join(work, 'startup-failure.png') }); console.log((await page.locator('body').innerText()).slice(-5000)); throw error })
  const settings = page.getByRole('dialog', { name: /^(设置|Settings)$/ })
  await settings.getByText('Python 环境', { exact: true }).first().click()
  await page.getByLabel('搜索依赖', { exact: true }).waitFor({ timeout: 30_000 })
  expect(await page.getByRole('list', { name: '依赖列表' }).evaluate(element => getComputedStyle(element).overflowY)).toBe('auto')
  await inspect(inspectorUrl, "globalThis.__pythonUpdateLoop = process.getBuiltinModule('node:perf_hooks').monitorEventLoopDelay({resolution:20}); globalThis.__pythonUpdateLoop.enable(); true")
  return page
  }
  let page = await launch()
  const samples: number[] = []; const ipcSamples: number[] = []; const seen = new Set<string>(); let final: any
  let restarted = false
  let navigated = false
  const started = Date.now()
  while (Date.now() - started < 15 * 60_000) {
    const ipcStart = performance.now()
    const state = await page.evaluate(() => (window as any).zerowallDesktop.getMcpEnvironmentStatus())
    ipcSamples.push(performance.now() - ipcStart)
    seen.add(state.phase)
    if (!restarted && state.phase === 'installing' && state.updateJob?.completedFiles > 1024) {
      const previousTask = state.updateJob.taskId
      workerPeaks.push(workerPeakMiB())
      loopP95.push(await inspect(inspectorUrl, 'globalThis.__pythonUpdateLoop.percentile(95)/1e6'))
      await writeFile(join(work, 'performance-progress.json'), JSON.stringify({ workerPeaks, loopP95 }, null, 2))
      await page.evaluate(() => (window as any).zerowallDesktop.pauseMcpEnvironment())
      await expect.poll(async () => (await page.evaluate(() => (window as any).zerowallDesktop.getMcpEnvironmentStatus())).phase).toBe('paused')
      spawnSync('taskkill', ['/pid', String(application!.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
      await browser!.close()
      page = await launch()
      await expect.poll(async () => (await page.evaluate(() => (window as any).zerowallDesktop.getMcpEnvironmentStatus())).updateJob?.taskId, { timeout: 60_000 }).toBe(previousTask)
      restarted = true
      continue
    }
    if (restarted && !navigated && state.phase === 'installing' && state.updateJob?.completedFiles > 5000) {
      const settings = page.getByRole('dialog', { name: /^(设置|Settings)$/ })
      await settings.getByRole('button', { name: '关闭', exact: true }).click()
      await settings.waitFor({ state: 'hidden' })
      await page.getByRole('button', { name: '设置', exact: true }).click()
      await settings.getByText('Python 环境', { exact: true }).first().click()
      await page.getByLabel('搜索依赖', { exact: true }).waitFor()
      navigated = true
    }
    const before = performance.now()
    await page.getByLabel('搜索依赖', { exact: true }).fill(samples.length % 2 ? 'numpy' : 'pyzotero')
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())))
    samples.push(performance.now() - before)
    if (state.phase === 'ready' && state.activeEnvironment?.environmentVersion === '1.4.0') { final = state; break }
    if (state.lastUpdateError || state.phase === 'failed') throw new Error(JSON.stringify(state))
    await new Promise(resolve => setTimeout(resolve, 1500))
  }
  expect(final?.activeEnvironment.environmentVersion).toBe('1.4.0')
  workerPeaks.push(workerPeakMiB())
  loopP95.push(await inspect(inspectorUrl, 'globalThis.__pythonUpdateLoop.percentile(95)/1e6'))
  const info = await page.evaluate(() => (window as any).zerowallDesktop.getMcpPythonInfo())
  expect(info.packageCount).toBe(387); expect(info.overlayPackageCount).toBe(6)
  await page.getByLabel('搜索依赖', { exact: true }).fill('')
  await expect.poll(() => page.getByText('387', { exact: true }).count()).toBe(1)
  expect(await page.getByRole('listitem').count()).toBeLessThan(40)
  for (const width of [1280, 720]) { await page.setViewportSize({ width, height: 1000 }); await page.screenshot({ path: join(work, `python-panel-${width}.png`) }) }
  const p95 = samples.sort((a, b) => a - b)[Math.floor(samples.length * .95)]!
  const ipcP95 = ipcSamples.sort((a, b) => a - b)[Math.floor(ipcSamples.length * .95)]!
  const workerPeakRssMiB = Math.max(...workerPeaks)
  const mainEventLoopP95Ms = Math.max(...loopP95)
  await writeFile(join(work, 'verification.json'), JSON.stringify({ ok: errors.length === 0 && p95 <= 200 && restarted && navigated && workerPeakRssMiB <= 256, p95Ms: p95, mainEventLoopP95Ms, workerPeakRssMiB, mainProcessIpcRoundTripP95Ms: ipcP95, sampleCount: samples.length, pauseAndRestartResumedSameJob: restarted, navigationDuringUpdate: navigated, phases: [...seen], packageCount: info.packageCount, python: info.version, errors }, null, 2))
  expect(workerPeakRssMiB).toBeLessThanOrEqual(256)
  expect(restarted).toBe(true)
  expect(navigated).toBe(true)
  expect(errors).toEqual([]); expect(p95).toBeLessThanOrEqual(200)
}, 20 * 60_000)
