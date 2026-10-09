import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createConnection } from 'node:net'
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { root, verificationRoot } from '../build/paths.mjs'
import { locatePackagedApp } from '../../desktop/scripts/packaged-app.mjs'
import { initializeProfile } from '../commands/profile.mjs'
import { prepareOfflineCandidate } from '../commands/offline-profile.mjs'

const require = createRequire(join(root, 'desktop/package.json'))
const { chromium } = require('playwright')
const yaml = require('yaml')
const args = process.argv.slice(2)
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const count = Number(option('--runs', '5'))
const mode = option('--mode', 'fresh')
if (!Number.isInteger(count) || count < 1 || count > 5 || !['fresh', 'daily', 'upgrade806', 'upgrade808'].includes(mode)) throw new Error('Use --mode fresh|daily|upgrade806|upgrade808 --runs 1..5')
const packaged = await locatePackagedApp(join(root, 'desktop'))
const executableOverride = option('--executable')
if (executableOverride) packaged.executablePath = resolve(executableOverride)
const evidence = resolve(verificationRoot, 'startup', option('--label', mode + '-' + Date.now()))
await mkdir(evidence, { recursive: true })
// Electron's native ASAR reader on Windows rejects archive paths beyond
// MAX_PATH. Keep test user data outside the long source worktree, as in an
// installed application, and retain that location in the evidence receipt.
const fixtures = await mkdtemp(join(tmpdir(), 'zws-start-'))
const report = { schema: 1, mode, executable: packaged.executablePath, limitMs: 20_000, timing: 'process spawn to visible editable input and authenticated local Host health', runs: [] }

async function management(userData, operation) {
  const endpoint = JSON.parse(await readFile(join(userData, 'command-endpoint.json'), 'utf8'))
  return new Promise((accept, reject) => {
    const socket = createConnection(endpoint.address)
    let input = ''
    socket.setTimeout(5000, () => socket.destroy(new Error('Host management timeout')))
    socket.on('error', reject)
    socket.on('connect', () => socket.write(JSON.stringify({ token: endpoint.token, operation, args: [] }) + '\n'))
    socket.on('data', bytes => { input += bytes; if (input.includes('\n')) { const row = JSON.parse(input.split('\n')[0]); socket.end(); row.ok ? accept(row.result) : reject(new Error('Host management not ready')) } })
  })
}

async function seed808(directory) {
  const source = option('--baseline808')
  if (!source) throw new Error('upgrade808 requires --baseline808 <verified 8.0.8 offline-profile>')
  const document = JSON.parse(await readFile(join(source, 'receipt.json'), 'utf8'))
  const defaults = document.plugins.map(row => row.id)
  const home = join(directory, 'user-data/harness')
  await initializeProfile(home, defaults, document.plugins)
  const result = await prepareOfflineCandidate({ home, source, keys: JSON.parse(await readFile(join(root, 'config/catalogs/trusted-keys.json'), 'utf8')), target: { desktopVersion: '8.0.8', dshVersion: document.dshRange.min, dshCommit: document.dshCommit, platform: process.platform, architecture: process.arch }, defaults, yaml, staging: args.includes('--baseline-staging') })
  if (result.blocked.length) throw new Error('Baseline profile blocked')
  await rename(join(home, 'profiles/web'), join(home, 'profiles/baseline-empty'))
  await rename(result.candidate, join(home, 'profiles/web'))
  return { applicationVersion: document.applicationVersion, schema: document.schema, generation: result.digest }
}

async function run(directory, iteration, measured = true, executable = packaged.executablePath) {
  for (const name of ['appdata', 'localappdata', 'user-data', 'chromium']) await mkdir(join(directory, name), { recursive: true })
  const userData = join(directory, 'user-data')
  const before = performance.now()
  const child = spawn(executable, ['--remote-debugging-port=0', `--user-data-dir=${join(directory, 'chromium')}`], { cwd: dirname(executable), env: { ...process.env, APPDATA: join(directory, 'appdata'), LOCALAPPDATA: join(directory, 'localappdata'), ZEROWALL_USER_DATA_DIR: userData, USERPROFILE: directory, HOME: directory }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let browser, output = '', phase = 'devtools'
  const row = { iteration, fixture: directory, measured }
  try {
    const endpoint = await new Promise((accept, reject) => {
      const timer = setTimeout(() => reject(new Error('DevTools timeout')), 60_000)
      const capture = bytes => { output = (output + bytes).slice(-20_000); const match = /DevTools listening on (ws:\/\/[^\s]+)/u.exec(output); if (match) { clearTimeout(timer); accept(match[1]) } }
      child.stdout.on('data', capture); child.stderr.on('data', capture)
      child.once('exit', code => { clearTimeout(timer); reject(new Error('Desktop exited: ' + code)) })
    })
    browser = await chromium.connectOverCDP(endpoint)
    phase = 'host-and-input'
    const context = browser.contexts()[0], deadline = performance.now() + 150_000
    let health, page, status
    while (performance.now() < deadline) {
      page = context.pages().find(candidate => candidate.url().startsWith('http://127.0.0.1:'))
      if (page) {
        await page.evaluate(() => {
          for (const button of document.querySelectorAll('[role=dialog] button')) if (['继续', '稍后配置'].includes(button.textContent?.trim())) button.click()
        }).catch(() => {})
        status = await page.evaluate(() => window.zerowallDesktop?.getStartupStatus()).catch(() => undefined)
        const editable = page.locator('[contenteditable="true"]:visible').first()
        if (status?.phase === 'ready' && await editable.count()) {
          health = await management(userData, 'host.health').catch(() => undefined)
          if (health?.ready) {
            await editable.fill('startup probe')
            if (!await editable.innerText().then(text => text.includes('startup probe'))) throw new Error('Workbench is not writable')
            await editable.fill('')
            row.durationMs = Math.round(performance.now() - before)
            row.applicationElapsedMs = Date.now() - status.startedAt
            row.hostReady = true; row.inputReady = true
            row.passed = row.durationMs <= report.limitMs
            break
          }
        }
        if (status?.phase === 'failed') throw new Error('Startup failed: ' + status.message)
      }
      await new Promise(accept => setTimeout(accept, 100))
    }
    if (!row.durationMs) throw new Error('Host and input readiness timeout')
  } catch (error) {
    row.passed = false; row.failedPhase = phase; row.error = error.message.replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]')
    row.elapsedMs = Math.round(performance.now() - before)
    await writeFile(join(directory, 'process-redacted.log'), output.replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]'))
  } finally {
    await browser?.close().catch(() => {})
    if (child.pid && child.exitCode === null) spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
    await new Promise(accept => child.exitCode !== null ? accept() : child.once('exit', accept))
    // Retain only isolated fixtures and safe metrics. Never read the real
    // installed application's settings, command tokens or startup logs.
    const logs = join(userData, 'logs/startup.log')
    const lines = await readFile(logs, 'utf8').catch(() => '')
    row.segments = lines.split(/\r?\n/u).filter(Boolean).map(line => { try { const entry = JSON.parse(line); return { elapsedMs: entry.elapsedMs, segment: entry.segment, durationMs: entry.durationMs, phase: entry.phase } } catch { return {} } })
  }
  return row
}

for (let iteration = 1; iteration <= count; iteration++) {
  const directory = join(fixtures, 'run-' + iteration)
  await mkdir(directory, { recursive: true })
  let baseline
  if (mode === 'upgrade808') baseline = await seed808(directory)
  if (mode === 'upgrade806') {
    const executable = option('--baseline-executable')
    if (!executable) throw new Error('upgrade806 requires --baseline-executable <8.0.6 ZeroWallScience.exe>')
    const warmup = await run(directory, iteration, false, resolve(executable))
    if (!warmup.hostReady) throw new Error('8.0.6 baseline did not become usable: ' + warmup.error)
    baseline = { applicationVersion: '8.0.6', executable, hostReady: true, inputReady: true }
  }
  if (mode === 'daily') {
    const warmup = await run(directory, iteration, false)
    if (!warmup.hostReady) { report.runs.push(warmup); break }
  }
  const row = await run(directory, iteration)
  if (baseline) row.baseline = baseline
  report.runs.push(row)
  report.passed = report.runs.length === count && report.runs.every(row => row.passed)
  await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ mode, iteration, durationMs: row.durationMs, passed: row.passed, error: row.error, evidence }))
  if (!row.hostReady) break
}
if (!report.passed) process.exitCode = 1
