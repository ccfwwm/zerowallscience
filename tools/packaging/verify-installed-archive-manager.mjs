import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join, resolve, delimiter } from 'node:path'
import { pathToFileURL } from 'node:url'

// Always use a new verification directory: never point this at user data.
const installation = resolve(process.argv[2]), output = resolve(process.argv[3]), source = process.argv[4]
const id = '@michengai/dsh-archive-manager', version = '1.0.17-zws.1'
const commands = join(installation, 'resources/commands'), executable = join(installation, 'ZeroWallScience.exe'), asar = join(installation, 'resources/app.asar')
const core = createRequire(join(asar, 'package.json')), json = async path => JSON.parse(await readFile(path, 'utf8'))
const { initializeProfile } = await import(pathToFileURL(join(commands, 'profile.mjs')))
const { prepareOfflineCandidate } = await import(pathToFileURL(join(commands, 'offline-profile.mjs')))
const { createResourceManager } = await import(pathToFileURL(join(commands, 'resource-manager.mjs')))
const home = join(output, 'harness'), defaults = await json(join(commands, 'default-plugins.json')), bundled = await json(join(commands, 'bundled-plugins.json')), keys = await json(join(commands, 'trusted-keys.json'))
const pin = await json(join(installation, 'resources/licenses/deepseek-harness.version.json'))
const target = { desktopVersion: '8.1.3', dshVersion: pin.version, dshCommit: pin.commit, platform: process.platform, architecture: process.arch }
await mkdir(output, { recursive: false })
await initializeProfile(home, defaults, bundled)
const prepared = await prepareOfflineCandidate({ home, source: join(installation, 'resources/offline-profile'), keys, target, defaults, bundledPlugins: bundled, yaml: core('yaml') })
assert.equal(prepared.blocked.length, 0)
await rename(join(home, 'profiles/web'), join(home, 'profiles/initial'))
await rename(prepared.candidate, join(home, 'profiles/web'))
// Preseed only already verified, content-addressed payloads. The installed
// resource manager still checks their signed size and hash before using them.
if (process.argv[5]) await cp(resolve(process.argv[5]), join(home, 'resources/downloads'), { recursive: true })
let child, starts = 0, stops = 0, failHealth = false, origin, cookie, browser
const receipt = { complete: false, target, plugin: { id, version }, checks: [] }
const wait = ms => new Promise(r => setTimeout(r, ms))
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_HOME: home, ZEROWALL_USER_DATA_DIR: output, NODE_PATH: [join(asar, 'node_modules'), join(home, 'profiles/web/node_modules')].join(delimiter), ZEROWALL_RUNTIME_ANCHOR: pathToFileURL(join(asar, 'package.json')).href, ZEROWALL_PROFILE_ANCHOR: pathToFileURL(join(home, 'profiles/web/package.json')).href, ZEROWALL_DEFER_DEFAULT_MCP: '1', DSH_TELEMETRY_DISABLED: '1', NO_COLOR: '1' }
async function rpc(method, args = {}) {
  const response = await fetch(`${origin}/api/${method}`, { method: 'POST', headers: { 'content-type': 'application/json', Cookie: cookie, Origin: origin }, body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args } }), signal: AbortSignal.timeout(15000) })
  assert(response.ok, `${method}: HTTP ${response.status}`)
  const envelope = await response.json()
  assert.equal(envelope.result?.ok, true, `${method}: ${JSON.stringify(envelope.result)}`)
  return envelope.result.value
}
async function stopHost() {
  if (child?.pid && child.exitCode === null) {
    stops++
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    await wait(200)
  }
}
async function startHost() {
  starts++
  const socket = createServer()
  await new Promise(r => socket.listen(0, '127.0.0.1', r))
  const port = socket.address().port
  await new Promise(r => socket.close(r))
  origin = `http://127.0.0.1:${port}`; cookie = ''
  const manifest = await json(join(home, 'profiles/web/package.json'))
  const expectedActive = manifest.dsh.profile.bundles.includes(id)
  let diagnostic = '', last = ''
  child = spawn(executable, ['--import', pathToFileURL(join(asar, 'runtime/runtime-esm-register.mjs')).href, '--expose-internals', join(asar, 'runtime/harness-node-entry.mjs'), join(asar, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), 'web', '--patch', join(installation, 'resources/zerowall.patch.yml'), '--host', '127.0.0.1', '--port', String(port), '--no-open'], { env, cwd: output, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  child.stdout.on('data', x => diagnostic = (diagnostic + x).slice(-80000))
  child.stderr.on('data', x => diagnostic = (diagnostic + x).slice(-80000))
  child.on('message', message => { if (message?.kind === 'zerowall-secret-request') child.send({ kind: 'zerowall-secret-response', requestId: message.requestId, ok: message.operation === 'get' }) })
  const until = Date.now() + 120000
  while (Date.now() < until && child.exitCode === null) {
    const token = /https?:\/\/127\.0\.0\.1:\d+\/?\?token=([A-Za-z0-9_-]+)/u.exec(diagnostic)?.[1]
    if (token) try {
      if (!cookie) {
        const exchange = await fetch(`${origin}/?token=${token}`, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
        cookie = exchange.headers.getSetCookie().map(value => value.split(';')[0]).filter(value => value.startsWith('dsh-auth-')).join('; ')
      }
      const value = await rpc('pluginInventory/list'), entries = value.entries ?? value
      if (Array.isArray(entries) && entries.length && entries.some(e => e.moduleName === id && e.fiberPhase === 'active') === expectedActive) {
        if (failHealth && expectedActive) { failHealth = false; throw new Error('Injected health failure after actual Host activation') }
        return
      }
    } catch (error) { if (error.message.startsWith('Injected')) throw error; last = error.message }
    await wait(300)
  }
  throw new Error('Installed Host health failed: ' + last + '\n' + diagnostic.replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]'))
}
const manager = createResourceManager({ home, keys, target, defaultPlugins: defaults, bundledPlugins: bundled, runtimeModules: join(asar, 'node_modules'), yaml: core('yaml'), stopHost, startHost, callHost: async () => {},
  runPlugin: async (args, profile) => {
    const result = spawnSync(executable, ['--expose-internals', join(commands, 'dsh.mjs'), 'plugin', '--profile', profile, ...args], { env, cwd: output, windowsHide: true, encoding: 'utf8', timeout: 300000, maxBuffer: 4 * 1024 ** 2 })
    if (result.status !== 0) throw new Error('Installed pnpm failed: ' + result.stderr + '\n' + result.stdout)
  },
})
try {
  console.log('Starting isolated installed 8.1.3 Host')
  await startHost()
  const before = await readFile(join(home, 'profiles/web/package.json'), 'utf8'), initialStarts = starts, initialStops = stops
  const installed = await manager.plugin(id, source)
  assert.equal(installed.updated, 1)
  assert.equal(starts - initialStarts, 1); assert.equal(stops - initialStops, 1)
  assert.equal((await json(join(home, 'profiles/web/node_modules', id, 'package.json'))).version, version)
  receipt.checks.push({ name: 'installed 8.1.3 signed optional-plugin install with real pnpm and one Host restart', complete: true })
  console.log('Signed install and actual Host activation passed')
  const synthetic = join(output, 'synthetic-project')
  await mkdir(synthetic)
  const sessionId = randomUUID()
  assert.equal((await rpc('session/create', { request: { cwd: synthetic, sessionId } })).sessionId, sessionId)
  assert((await rpc('workspace/archiveSession', { request: { sessionId } })).archivedSessionIds.includes(sessionId))
  assert((await rpc('workspaceRegistry/archivedSessionMetadata')).items.some(item => item.sessionId === sessionId))
  assert(!(await rpc('workspaceRegistry/unarchiveSession', { sessionId })).archivedSessionIds.includes(sessionId))
  assert((await rpc('workspace/archiveSession', { request: { sessionId } })).archivedSessionIds.includes(sessionId))
  const playwright = createRequire(resolve('desktop/package.json'))('playwright')
  browser = await playwright.chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addCookies(cookie.split('; ').map(item => { const split = item.indexOf('='); return { name: item.slice(0, split), value: item.slice(split + 1), url: origin } }))
  const page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin, { waitUntil: 'domcontentloaded' })
  const continueButton = page.getByRole('button', { name: /^(继续|Continue)$/u })
  await continueButton.waitFor({ timeout: 20000 })
  await continueButton.click()
  await continueButton.waitFor({ state: 'hidden' })
  const laterButton = page.getByRole('button', { name: /^(稍后配置|Set up later|Configure later)$/u })
  await laterButton.waitFor({ timeout: 20000 })
  await laterButton.click()
  await laterButton.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.querySelector('[data-plugin="@michengai/dsh-archive-manager"]'), { timeout: 45000 })
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('zerowall:open-settings', { detail: 'archived-sessions' })))
  await page.locator('.dsham_settings').waitFor({ timeout: 20000 })
  await page.screenshot({ path: join(output, 'archive-settings-loading.png'), fullPage: true })
  receipt.archivePageText = await page.locator('.dsham_settings').innerText()
  await page.locator('.dsham_settingsRow').first().waitFor({ timeout: 15000 })
  await page.screenshot({ path: join(output, 'archive-settings.png'), fullPage: true })
  await page.locator('[data-zerowall-archive-update]').click()
  await page.waitForFunction(() => !document.querySelector('.dsham_settings') && document.body.textContent.match(/扩展中心|Extension Center|Extension center/u))
  await page.screenshot({ path: join(output, 'extension-center.png'), fullPage: true })
  assert.deepEqual(errors, [], 'Client must render without unhandled errors')
  receipt.checks.push({ name: 'real browser loads client, renders synthetic archived session, opens extension center', complete: true })
  await browser.close(); browser = undefined
  assert.equal((await rpc('workspaceRegistry/deleteSession', { sessionId })).deleted, true)
  assert(!(await rpc('workspaceRegistry/archivedSessionMetadata')).items.some(item => item.sessionId === sessionId))
  receipt.checks.push({ name: 'synthetic session archive, metadata, restore, rearchive and permanent deletion', complete: true })
  await manager.setPluginEnabled(id, false)
  await manager.setPluginEnabled(id, true)
  receipt.checks.push({ name: 'signed-profile disable and enable with actual Host health checks', complete: true })
  await assert.rejects(manager.rollbackPlugin(id), /No previous generation/u)
  receipt.checks.push({ name: 'first release has no older per-plugin version and refuses invalid rollback', complete: true })
  // Restore the baseline after enable/disable transactions before failure injection.
  await manager.mutate(['remove', id])
  assert(!(await json(join(home, 'profiles/web/package.json'))).dsh.profile.bundles.includes(id))
  const withoutPlugin = await readFile(join(home, 'profiles/web/package.json'), 'utf8')
  failHealth = true
  await assert.rejects(manager.plugin(id, source), /Injected health failure/u)
  assert.equal(await readFile(join(home, 'profiles/web/package.json'), 'utf8'), withoutPlugin)
  receipt.checks.push({ name: 'health failure after actual activation restores previous profile and live Host', complete: true })
  await manager.plugin(id, source)
  await manager.rollback()
  assert.equal(await readFile(join(home, 'profiles/web/package.json'), 'utf8'), withoutPlugin)
  receipt.checks.push({ name: 'complete-profile rollback removes first installation and preserves other packages', complete: true })
  receipt.baselinePackageBytes = before.length
  receipt.complete = true
  console.log('Archive/restore/delete, browser, enable/disable and rollback checks passed')
} catch (error) { receipt.error = error.stack ?? String(error); throw error }
finally {
  if (browser) await browser.close()
  await stopHost()
  receipt.starts = starts; receipt.stops = stops
  await writeFile(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n')
}
