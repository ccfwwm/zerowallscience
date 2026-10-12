import assert from 'node:assert/strict'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'

const installation = resolve(process.argv[2])
const output = resolve(process.argv[3])
await mkdir(output, { recursive: true })
for (const name of ['appdata', 'localappdata', 'user-data']) await mkdir(join(output, name), { recursive: true })
const executable = join(installation, 'ZeroWallScience.exe')
const runtime = join(installation, 'Python')
const child = spawn(executable, ['--remote-debugging-port=0', `--user-data-dir=${join(output, 'chromium')}`], {
  cwd: installation, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, APPDATA: join(output, 'appdata'), LOCALAPPDATA: join(output, 'localappdata'), ZEROWALL_USER_DATA_DIR: join(output, 'user-data'), USERPROFILE: output },
})
let diagnostic = ''
const endpoint = new Promise((accept, reject) => {
  const timer = setTimeout(() => reject(new Error('Electron DevTools timeout')), 120000)
  const data = chunk => {
    diagnostic = (diagnostic + chunk.toString()).slice(-30000)
    const address = diagnostic.match(/DevTools listening on (ws:\/\/\S+)/u)?.[1]
    if (address) { clearTimeout(timer); accept(address) }
  }
  child.stdout.on('data', data); child.stderr.on('data', data)
  child.once('exit', code => { clearTimeout(timer); reject(new Error(`Electron exited: ${code}`)) })
})
let browser
const receipt = { installation, expectedExecutable: join(runtime, 'python.exe'), checks: [] }
try {
  browser = await chromium.connectOverCDP(await endpoint)
  const context = browser.contexts()[0]
  let page
  const deadline = Date.now() + 180000
  while (Date.now() < deadline) {
    page = context.pages().find(p => p.url().startsWith('http://127.0.0.1:'))
    if (page && await page.evaluate(() => !!window.zerowallDesktop?.pythonEnvironment).catch(() => false)) break
    for (const splash of context.pages().filter(p => p.url().startsWith('file:'))) {
      const startup = await splash.evaluate(() => window.zerowallDesktop?.getStartupStatus?.()).catch(() => undefined)
      if (startup?.phase === 'failed') throw new Error('Installed Electron startup failed: ' + startup.message)
    }
    await new Promise(r => setTimeout(r, 250))
  }
  assert.ok(page, 'Installed Electron must reach its Host')
  const request = args => page.evaluate(args => window.zerowallDesktop.pythonEnvironment(args), { requestId: randomUUID(), ...args })
  const scan = async (allowMissing = false) => {
    await request({ action: 'scan_local' })
    const until = Date.now() + 46000
    let state
    do {
      state = await request({ action: 'status' })
      if (state.scan?.state === 'complete') return state.scan.inventory
      if (state.scan?.state === 'failed') {
        if (allowMissing && state.scan.inventory?.ready === false && /^PYTHON_ENVIRONMENT_UNAVAILABLE:/u.test(state.scan.error ?? '')) return state.scan.inventory
        throw new Error(state.scan.error)
      }
      await new Promise(r => setTimeout(r, 200))
    } while (Date.now() < until)
    throw new Error('Actual inventory scan did not finish within 46 seconds')
  }
  const before = await scan(true)
  if (!before.ready) assert.equal(await access(join(runtime, 'python.exe')).then(() => true, () => false), false, 'Read-only scan must not initialize Python')
  assert.equal((await request({ action: 'status' })).runtimeRoot.toLowerCase(), runtime.toLowerCase())
  receipt.checks.push({ name: 'read-only fixed-root detection', ready: before.ready })
  const mirror = await request({ action: 'configure' })
  assert.equal(mirror.defaultMirrorUrl, 'https://mirrors.ustc.edu.cn/pypi/simple')
  assert.equal(mirror.mirrorUrl, mirror.defaultMirrorUrl)
  receipt.checks.push({ name: 'installed Python plugin default mirror', mirrorUrl: mirror.mirrorUrl })
  const started = await request({ action: 'install_runtime', confirm: true })
  assert.ok(started.taskId)
  let task
  const until = Date.now() + 180000
  do {
    task = (await request({ action: 'task_status', taskId: started.taskId })).task
    if (['completed', 'succeeded', 'failed', 'cancelled'].includes(task.state)) break
    await new Promise(r => setTimeout(r, 500))
  } while (Date.now() < until)
  assert.ok(['completed', 'succeeded'].includes(task.state), JSON.stringify(task))
  const installed = await scan()
  assert.equal(installed.ready, true); assert.equal(installed.pipReady, true)
  assert.equal(installed.executable.toLowerCase(), join(runtime, 'python.exe').toLowerCase())
  assert.equal(installed.version, '3.12.10')
  receipt.checks.push({ name: 'online bootstrap and actual pip', taskId: started.taskId, executable: installed.executable, version: installed.version })
  // A package installed outside the application must appear on the next scan.
  let pipInstalled = false
  for (let attempt = 1; attempt <= 3; attempt++) {
    const pip = spawnSync(installed.executable, ['-I', '-X', 'utf8', '-m', 'pip', 'install', '--disable-pip-version-check', '--index-url', mirror.mirrorUrl, 'pandas==2.2.3'], { windowsHide: true, encoding: 'utf8', timeout: 300000 })
    if (pip.status === 0) { pipInstalled = true; break }
    console.log(`Manual pip acceptance attempt ${attempt} failed: ${pip.error?.code ?? pip.status}`)
  }
  assert.equal(pipInstalled, true, 'Actual manual pip installation must succeed')
  const inventory = await scan()
  assert.equal(inventory.packages.find(p => p.name === 'pandas')?.version, '2.2.3')
  assert.ok(!inventory.missingCorePackages.includes('pandas'))
  receipt.checks.push({ name: 'manual pip and version-independent readiness', pandas: '2.2.3', missingCorePackages: inventory.missingCorePackages })
  await mkdir(join(runtime, '.zerowall'), { recursive: true })
  const record = JSON.parse(await readFile(join(runtime, '.zerowall/current.json'), 'utf8'))
  assert.equal(resolve(record.runtimeRoot ?? record.root).toLowerCase(), runtime.toLowerCase())
  assert.ok(!JSON.stringify(record).match(/\.zerowall[\\/]slots/iu))
  const actual = execFileSync(installed.executable, ['-I', '-X', 'utf8', '-c', 'import sys; print(sys.executable)'], { windowsHide: true, encoding: 'utf8' }).trim()
  assert.equal(actual.toLowerCase(), installed.executable.toLowerCase())
  receipt.checks.push({ name: 'active record and sys.executable', executable: actual })
  const cli = execFileSync(executable, [join(installation,'resources/commands/zws.mjs'), 'python', 'status', '--user-data', join(output,'user-data')], {
    windowsHide: true, encoding: 'utf8', timeout: 60000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  const cliState = JSON.parse(cli)
  assert.equal((cliState.executable ?? cliState.runtimeExecutable).toLowerCase(), actual.toLowerCase())
  receipt.checks.push({ name: 'installed zws Python status', executable: cliState.executable ?? cliState.runtimeExecutable })
  const { buildPowerShellPythonCommand } = await import(pathToFileURL(join(installation, 'resources/commands/python-shell.mjs')))
  const terminal = execFileSync('powershell.exe', ['-NoProfile', '-Command', buildPowerShellPythonCommand(runtime, actual) + "; python -I -c 'import sys,json; print(json.dumps(sys.executable))'"], { windowsHide: true, encoding: 'utf8', timeout: 30000 })
  const terminalExecutable = JSON.parse(terminal.trim().split(/\r?\n/u).at(-1))
  assert.equal(terminalExecutable.toLowerCase(), actual.toLowerCase())
  receipt.checks.push({ name: 'installed Python terminal command', executable: terminalExecutable })
  await page.screenshot({ path: join(output, 'installed-electron.png') })
  receipt.complete = true
} catch (error) {
  receipt.complete = false; receipt.error = error.message
  throw error
} finally {
  await writeFile(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2))
  await writeFile(join(output, 'electron.log'), diagnostic.replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]'))
  if (child.pid && child.exitCode === null) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  await browser?.close().catch(() => {})
}
