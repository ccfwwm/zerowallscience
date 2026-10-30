import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createConnection } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { handleResourceUpdateNotices } from '../../desktop/scripts/update-notice-handler.mjs'

// All data, credentials, browser storage and automatic Python tasks are kept
// in marked synthetic fixtures. Never import a real user's vault or sessions.
const options = new Map()
for (let i = 2; i < process.argv.length; i += 2) {
  assert(['--mode', '--app', '--output', '--version', '--scenarios', '--resume'].includes(process.argv[i]) && process.argv[i + 1], 'Expected --mode prepare-811|prepare-812|verify --app <exe> --output <fixture root> --version <version>')
  options.set(process.argv[i], process.argv[i + 1])
}
const mode = options.get('--mode') ?? 'verify'
assert(['prepare-811', 'prepare-812', 'seed-811', 'damage-812', 'verify'].includes(mode))
const executable = resolve(options.get('--app'))
const output = resolve(options.get('--output'))
const expectedVersion = options.get('--version')
const { _electron } = createRequire(resolve('desktop/package.json'))('playwright')
const coreIds = ['base', 'secrets', 'environment'].map(name => '@zerowallscience/plugin-' + name)
const wait = ms => new Promise(accept => setTimeout(accept, ms))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
await mkdir(output, { recursive: true })

async function fixture(name, create = false) {
  const data = join(output, name, 'data'), marker = join(data, '.zerowall-customization-verification.json')
  if (create) {
    await mkdir(data, { recursive: true })
    assert.deepEqual(await readdir(data), [], 'Refusing to change a non-empty unmarked fixture')
    await writeFile(marker, JSON.stringify({ purpose: 'isolated customization upgrade verification', createdAt: new Date().toISOString() }), { flag: 'wx' })
  }
  assert.equal(JSON.parse(await readFile(marker)).purpose, 'isolated customization upgrade verification')
  const environment = join(data, '_environment')
  for (const directory of ['appdata', 'localappdata/ZeroWall Science']) await mkdir(join(environment, directory), { recursive: true })
  await writeFile(join(environment, 'localappdata/ZeroWall Science/python-location.json'), JSON.stringify({ runtimeRoot: join(environment, 'Python'), source: 'user-selected' }))
  const env = { ...process.env, APPDATA: join(environment, 'appdata'), LOCALAPPDATA: join(environment, 'localappdata'),
    USERPROFILE: environment, HOME: environment, ZEROWALL_USER_DATA_DIR: data, ZEROWALL_PYTHON_RUNTIME_ROOT: join(environment, 'Python') }
  delete env.ELECTRON_RUN_AS_NODE
  return { name, data, env, browserData: join(environment, 'chromium'), profile: join(data, 'harness/profiles/web/package.json') }
}

async function stop(application) {
  if (!application) return
  const pid = application.process().pid
  let timeout
  try {
    await Promise.race([application.close(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Test app close timeout')), 8000) })])
  } catch {
    if (application.process().exitCode === null) await new Promise(accept => {
      const child = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      child.once('close', accept)
    })
  } finally { clearTimeout(timeout) }
}

async function rpc(page, method, args = {}) {
  return page.evaluate(async ({ method, args }) => {
    const response = await fetch('/api/' + method, { method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(10000),
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args } }) })
    if (!response.ok) throw new Error(method + ' HTTP ' + response.status)
    const envelope = await response.json()
    if (!envelope.result?.ok) throw new Error(method + ': ' + String(envelope.result?.error?.code ?? 'invalid response'))
    return envelope.result.value
  }, { method, args })
}

async function health(f) {
  const endpoint = JSON.parse(await readFile(join(f.data, 'command-endpoint.json')))
  return new Promise((accept, reject) => {
    const socket = createConnection(endpoint.address)
    let input = ''
    socket.setTimeout(5000, () => socket.destroy(new Error('Host health timeout')))
    socket.on('error', reject)
    socket.on('connect', () => socket.write(JSON.stringify({ token: endpoint.token, operation: 'host.health', args: [] }) + '\n'))
    socket.on('data', bytes => {
      input += bytes
      if (input.includes('\n')) {
        const row = JSON.parse(input.split('\n')[0]); socket.end()
        row.ok ? accept(row.result) : reject(new Error('Host health failed: ' + String(row.error)))
      }
    })
  })
}

async function historyFixture(f) {
  const record = join(output, f.name, 'history-fixture.json')
  const membership = async history => {
    const file = join(f.data, 'harness/storages/workspace.json')
    const domain = JSON.parse(await readFile(file))
    const workspace = Object.values(domain.tables.workspaces).find(item => resolve(item.path).toLowerCase() === resolve(join(f.data, 'workspace')).toLowerCase())
    assert(workspace, 'Baseline default Workspace is missing')
    workspace.sessionIds = [...new Set([...workspace.sessionIds, history.id])]
    await writeFile(file, JSON.stringify(domain))
    return history
  }
  try { return await membership(JSON.parse(await readFile(record))) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const cwd = join(f.data, 'workspace'), id = 'session-' + randomUUID(), now = Date.now()
  let readable = '', separator = false
  for (let i = 0; i < cwd.length; i++) {
    const character = cwd[i]
    if ('/\\:'.includes(character)) { if (!separator) readable += '-'; separator = true }
    else { readable += character !== '~' && /^[A-Za-z0-9._-]$/u.test(character) ? character : '~' + cwd.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0'); separator = false }
  }
  const key = '--' + readable.replace(/^-+/u, '').slice(0, 251) + '--'
  const header = { type: 'session', version: 3, id, createdAt: now, cwd, isSeeded: false, delegationDepth: 0, agentPreset: 'standard' }
  const title = '升级前的隔离历史会话', message = '这是一条已完成的合成历史消息，用于核对升级后读取和权限。'
  const events = [
    { type: 'turn/start', data: { turn: 1 } }, { type: 'step/start', data: { turn: 1, step: 1 } },
    { type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: message }], source: { kind: 'user' }, id: randomUUID() }, surfaceOp: 'append' },
    { type: 'step/end', data: { turn: 1, step: 1 } }, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    { type: 'session/title', data: { title, messageSeqs: [], source: { kind: 'user' } } },
  ].map((event, seq) => ({ ...event, seq, time: now + seq }))
  const file = join(f.data, 'harness/sessions', key, id, 'session.v3.jsonl')
  const bytes = Buffer.from([header, ...events].map(row => JSON.stringify(row)).join('\n') + '\n')
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, bytes, { flag: 'wx' })
  const result = { id, title, message, file, sha256: digest(bytes) }
  await writeFile(record, JSON.stringify(result, null, 2))
  return membership(result)
}

async function customization(page, f, attempt) {
  const body = await page.locator('body').innerText()
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN', 'Default language is not Chinese')
  assert(!/account\.[A-Za-z]|research\.engine|mcp\.pythonEnvironment|DSH 本地构建|无法读取会话权限/u.test(body), 'Untranslated dictionary or missing core service')
  const footer = page.locator('[data-sidebar-footer]')
  for (const name of ['设置', '登录AI平台']) await footer.getByRole('button', { name, exact: true }).waitFor({ state: 'visible', timeout: 10000 })
  const update = footer.locator('button[data-update]')
  await update.waitFor({ state: 'visible', timeout: 10000 })
  assert(/更新/u.test(await update.getAttribute('aria-label')), 'Update action has no Chinese dictionary')
  const modules = await page.evaluate(() => {
    const system = window.__dshSidebarModuleSystem__
    return { failures: system.entries.state.getSnapshot().failures,
      entries: [...system.entries.loader.entries()].map(entry => ({ name: entry.options.name, state: entry.fiber?.state })) }
  })
  assert.deepEqual(modules.failures, [], 'Client module activation failed')
  for (const entry of modules.entries.filter(entry => entry.name?.startsWith('@zerowallscience/plugin-'))) assert.equal(entry.state, 2, 'Inactive client: ' + entry.name)
  const host = await health(f)
  for (const id of [...coreIds, ...['account', 'claude-code', 'images', 'videos', 'mcp', 'skills', 'python'].map(name => '@zerowallscience/plugin-' + name)]) {
    const entries = host.entries.filter(entry => entry.name === id)
    assert(entries.length && entries.every(entry => entry.state === 2), 'Host customization is absent/inactive: ' + id)
  }
  const manifest = JSON.parse(await readFile(f.profile))
  for (const id of coreIds) {
    assert(manifest.dsh.profile.bundles.includes(id), 'Core activation missing after upgrade: ' + id)
    assert.equal(await stat(join(dirname(f.profile), 'node_modules', id)).then(() => true, () => false), false, 'Old physical core shadow survived migration')
  }
  const status = await rpc(page, 'zerowallClaudeCode/settingsStatus')
  assert.equal(status.desktop, true)
  const native = await rpc(page, 'zerowallClaudeCode/settingsGet')
  assert(native.permissionSelector && native.permissionMode, 'Claude native settings service returned no permission defaults')
  const global = await rpc(page, 'zerowallClaudeCode/settingsGlobalGet')
  assert(global && typeof global === 'object', 'Claude global settings service did not respond')
  const account = await rpc(page, 'zerowallAccount/current')
  assert.equal(account.status, 'signedOut', 'Synthetic fixture unexpectedly contains credentials')
  await page.screenshot({ path: join(output, f.name, `workbench-${attempt}.png`) })
  return { modules, host, claude: { status, native, global }, realAccountStatus: account.status }
}

async function sessionPermissions(page, f, attempt) {
  const before = await rpc(page, 'session/list', { _request: {} })
  const creation = page.waitForResponse(response => new URL(response.url()).pathname === '/api/session/create'
    && response.request().method() === 'POST', { timeout: 10000 })
  await page.getByRole('button', { name: /^(新建会话|新会话)$/u }).first().click({ timeout: 5000 })
  const response = await creation
  assert(response.ok(), 'New Session request failed')
  const envelope = await response.json()
  assert.equal(envelope.result?.ok, true, 'New Session request was rejected')
  const selectedId = envelope.result.value.sessionId
  assert.equal(typeof selectedId, 'string')
  await page.waitForFunction(id => document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') === id,
    selectedId, { timeout: 10000 })
  const list = await rpc(page, 'session/list', { _request: {} })
  const created = list.items.find(item => item.sessionId === selectedId)
  assert(created?.blank, 'Selected new Session is missing from persistence or already contains a turn')
  // DSH may reuse an existing blank. A completed historical Session must never
  // be reused, and no existing row may disappear while preparing the draft.
  const reused = before.items.find(item => item.sessionId === selectedId)
  if (reused) assert.equal(reused.blank, true, 'New Session reused nonblank history')
  for (const item of before.items) assert(list.items.some(row => row.sessionId === item.sessionId), 'New Session removed existing history')
  const hero = page.locator('[data-slot="conversation.hero.brand.mark"] img[src*="zerowall-icon.png"]')
  await hero.waitFor({ state: 'visible', timeout: 10000 })
  assert(await hero.evaluate(image => image.complete && image.naturalWidth > 0), 'New Session hero brand did not decode')
  await page.screenshot({ path: join(output, f.name, `new-session-${attempt}.png`) })
  const view = await rpc(page, 'zerowallClaudeCode/permissionView', { agentId: created.sessionId })
  assert(view.hostPreset && view.hostSandbox && view.nativeOptions?.length, 'Permission service returned no presets')
  const permission = page.getByRole('button', { name: 'ZeroWall 会话权限', exact: true })
  await permission.waitFor({ state: 'visible', timeout: 10000 })
  await page.waitForFunction(() => {
    const button = document.querySelector('button[aria-label="ZeroWall 会话权限"]')
    return button && !button.disabled && !button.textContent.includes('权限加载中')
  }, null, { timeout: 10000 })
  await permission.click()
  await page.getByRole('menu').waitFor({ state: 'visible', timeout: 5000 })
  await page.screenshot({ path: join(output, f.name, `permissions-${attempt}.png`) })
  await page.keyboard.press('Escape')
  const input = page.locator('[contenteditable="true"]').first()
  await input.fill('隔离验收：验证输入可用，不发送请求。', { timeout: 10000 })
  assert((await input.innerText()).includes('隔离验收'))
  await input.fill('')
  // Re-open an existing durable Session too; a working new-session permission
  // picker alone cannot prove the previous conversation is still usable.
  let reopened
  const retained = before.items.find(item => !item.blank)
  if (retained) {
    reopened = retained.sessionId
    const row = page.locator(`[role="treeitem"][data-row-key="session:${reopened}"]`)
    await row.click({ timeout: 10000 })
    const oldView = await rpc(page, 'zerowallClaudeCode/permissionView', { agentId: reopened })
    assert(oldView.hostPreset && oldView.nativeOptions?.length)
    await permission.waitFor({ state: 'visible', timeout: 10000 })
  }
  return { created: created.sessionId, reopened, view }
}

async function settingsAndAccount(page, f) {
  const footer = page.locator('[data-sidebar-footer]')
  await footer.getByRole('button', { name: '设置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置', exact: true })
  await settings.waitFor({ state: 'visible' })
  await settings.getByRole('button', { name: 'Claude Code', exact: true }).click()
  await settings.getByRole('heading', { name: 'Claude 全局设置', exact: true }).waitFor({ state: 'visible' })
  await settings.getByText('Claude Code 设置服务暂不可用。', { exact: true }).waitFor({ state: 'hidden', timeout: 10000 })
  const text = await settings.innerText()
  assert(!/account\.[A-Za-z]|research\.engine|mcp\.pythonEnvironment/u.test(text), 'Untranslated Settings section')
  await page.screenshot({ path: join(output, f.name, 'settings-claude-zh.png') })
  await settings.getByRole('button', { name: '关于', exact: true }).click()
  await settings.getByText(expectedVersion, { exact: true }).waitFor({ state: 'visible' })
  await page.screenshot({ path: join(output, f.name, 'settings-about-zh.png') })
  await settings.getByRole('button', { name: '关闭', exact: true }).click()
  await footer.getByRole('button', { name: '登录AI平台', exact: true }).click()
  const account = page.locator('[aria-labelledby="zerowall-account-title"]')
  await account.waitFor({ state: 'visible' })
  await page.screenshot({ path: join(output, f.name, 'account-real-signed-out.png') })
  await page.keyboard.press('Escape')

  // Layout-only signed-in fixture: real signed-out RPC was verified above.
  // No real credential is used and no external account is modified.
  await page.route('**/api/zerowallAccount/**', async route => {
    const request = route.request().postDataJSON()
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const values = {
      current: { status: 'signedIn', email: 'long-customization-verification-account@example.invalid', balance: 123456.78, currency: 'CNY', lowBalance: false, balanceFreshness: 'current', models: [], mediaModels: [], groups: [], gatewayBaseUrl: 'https://hkcode.aicodeme.xyz', rechargeUrl: 'https://hkcode.aicodeme.xyz/dashboard/wallet' },
      savedLogin: { email: 'long-customization-verification-account@example.invalid', password: 'synthetic-unused', baseUrl: 'https://hkcode.aicodeme.xyz', rememberPassword: true }, listOrders: [],
      groupCatalog: { groups: [], routes: [] }, checkoutInfo: { paymentTypes: ['alipay', 'wxpay'], minimumAmount: 10 },
    }
    if (!(name in values)) return route.continue()
    return route.fulfill({ json: { type: 'server-response', rpcId: request.rpcId, result: { ok: true, value: values[name] } } })
  })
  await page.reload()
  await page.locator('[data-sidebar-footer]').waitFor({ state: 'visible', timeout: 30000 })
  await handleResourceUpdateNotices(page)
  const layouts = []
  for (const english of [false, true]) {
    if (english) {
      await page.locator('[data-sidebar-footer]').getByRole('button', { name: '设置', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: '设置', exact: true })
      await dialog.getByRole('button', { name: '通用设置', exact: true }).click()
      await dialog.getByRole('button', { name: '中文', exact: true }).click()
      await page.getByRole('menuitem', { name: 'English', exact: true }).click()
      await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'Close', exact: true }).click()
    }
    for (const width of [1440, 800]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.locator('[data-sidebar-footer]').getByRole('button', { name: english ? 'Sign in to AI platform' : '登录AI平台', exact: true }).click()
      const card = page.locator('[class*="accountCard"]').first()
      await card.waitFor({ state: 'visible', timeout: 10000 })
      const geometry = await card.evaluate(element => {
        const boxes = [...element.children].map(child => ({ text: child.textContent, rect: child.getBoundingClientRect().toJSON(), scroll: child.scrollWidth, client: child.clientWidth }))
        const overlap = []
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].rect, b = boxes[j].rect
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlap.push([i, j])
        }
        return { boxes, overlap, overflow: element.scrollWidth > element.clientWidth + 1 }
      })
      assert.deepEqual(geometry.overlap, [], 'Account identity, balance or action bounds overlap')
      assert.equal(geometry.overflow, false, 'Account card overflows its panel')
      assert(geometry.boxes.every(box => box.scroll <= box.client + 1), 'Account text overflows into an adjacent control')
      await page.screenshot({ path: join(output, f.name, `account-synthetic-${english ? 'en' : 'zh'}-${width}.png`) })
      layouts.push({ english, width, ...geometry })
      await page.keyboard.press('Escape')
    }
  }
  return layouts
}

async function launch(f, action, { broken = false } = {}) {
  let application, page
  const network = []
  const launchId = randomUUID()
  try {
    application = await _electron.launch({ executablePath: executable, cwd: dirname(executable), args: ['--user-data-dir=' + f.browserData], env: f.env, timeout: 120000 })
    assert.equal(await application.evaluate(({ app }) => app.getVersion()), expectedVersion)
    await application.evaluate(({ app, BrowserWindow }) => {
      const isolate = window => {
        window.webContents.setBackgroundThrottling(false)
        window.setFocusable(false)
        window.setPosition(-16000, -16000)
        window.on('show', () => window.setPosition(-16000, -16000))
      }
      for (const window of BrowserWindow.getAllWindows()) isolate(window)
      app.on('browser-window-created', (_event, window) => isolate(window))
    })
    const observe = candidate => {
      candidate.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) network.push({ phase: 'request', path: new URL(request.url()).pathname, time: Date.now() }) })
      candidate.on('response', response => { if (new URL(response.url()).pathname.startsWith('/api/')) network.push({ phase: 'response', path: new URL(response.url()).pathname, status: response.status(), time: Date.now() }) })
    }
    application.context().pages().forEach(observe)
    application.context().on('page', observe)
    const deadline = Date.now() + 120000
    while (Date.now() < deadline) {
      page = application.context().pages().find(candidate => candidate.url().startsWith('http://127.0.0.1:'))
      if (page && await page.locator('[data-sidebar-footer]').isVisible().catch(() => false)
        && await page.evaluate(() => window.zerowallDesktop?.getStartupStatus()).then(status => status?.phase === 'ready').catch(() => false)) break
      await wait(200)
    }
    assert(page && await page.locator('[data-sidebar-footer]').isVisible(), 'Desktop did not render its sidebar')
    // A visible off-screen surface keeps Chromium's real frame lifecycle;
    // hidden BrowserWindows suspend screenshots even with a live DOM.
    // This is the first RPC, with a fixed deadline and no retry. A screenshot
    // alone must not conceal an unusable Session backend.
    console.log(f.name + ':first-session-rpc')
    const rpcStartedAt = Date.now()
    const [status, sessions] = await Promise.all([
      health(f).catch(error => ({ diagnosticError: error.message })),
      rpc(page, 'session/list', { _request: {} }),
    ])
    await writeFile(join(output, f.name, `first-rpc-health-${launchId}.json`), JSON.stringify({ firstRpcMs: Date.now() - rpcStartedAt, host: status,
      client: await page.evaluate(() => window.__dshSidebarModuleSystem__?.entries.state.getSnapshot()) }, null, 2))
    assert(!status.diagnosticError, status.diagnosticError)
    assert(Array.isArray(sessions.items))
    console.log(f.name + ':session-rpc-ready')
    if (!broken) {
      // A restored nonempty conversation intentionally has no hero. Check
      // that slot after opening an empty new conversation below.
      for (const slot of ['sidebar.brand.mark']) {
        const image = page.locator(`[data-slot="${slot}"] img[src*="zerowall-icon.png"]`)
        await image.waitFor({ state: 'visible', timeout: 10000 })
        assert(await image.evaluate(element => element.complete && element.naturalWidth > 0), 'Brand image did not decode')
      }
    }
    return await action(page, application, sessions)
  } catch (error) {
    if (page) {
      await page.screenshot({ path: join(output, f.name, 'failure.png') }).catch(() => {})
      await writeFile(join(output, f.name, 'failure.txt'), (await page.locator('body').innerText().catch(() => '')).slice(0, 20000))
    }
    throw error
  } finally {
    await writeFile(join(output, f.name, `network-timing-${launchId}.json`), JSON.stringify(network, null, 2))
    await stop(application)
  }
}

if (mode !== 'verify') {
  const f = await fixture(mode.endsWith('811') ? 'upgrade-811' : 'recover-812', mode.startsWith('prepare-'))
  if (mode.startsWith('prepare-')) await launch(f, async page => {
    await page.screenshot({ path: join(output, f.name, 'baseline.png') })
  })
  const manifest = JSON.parse(await readFile(f.profile))
  if (mode.endsWith('811')) {
    // Reproduce the physical core shadows present in older upgraded profiles,
    // using exact released 8.4.11 bytes rather than a source-tree stand-in.
    const { listPackage, extractFile } = createRequire(resolve('desktop/package.json'))('@electron/asar')
    const asar = join(dirname(executable), 'resources/app.asar')
    for (const id of coreIds) {
      const prefix = '\\node_modules\\' + id.replaceAll('/', '\\') + '\\'
      for (const entry of listPackage(asar).filter(path => path.startsWith(prefix))) {
        let bytes
        try { bytes = extractFile(asar, entry.slice(1)) } catch (error) {
          if (/not a file|directory|Cannot read properties of undefined/u.test(error.message)) continue
          throw error
        }
        const file = join(dirname(f.profile), 'node_modules', id, entry.slice(prefix.length))
        await mkdir(dirname(file), { recursive: true })
        await writeFile(file, bytes)
      }
      manifest.dependencies[id] = 'link:./node_modules/' + id
    }
    await writeFile(f.profile, JSON.stringify(manifest, null, 2) + '\n')
  }
  const shadows = []
  for (const id of coreIds) shadows.push({ id, exists: await stat(join(dirname(f.profile), 'node_modules', id, 'package.json')).then(() => true, () => false) })
  if (mode.endsWith('812')) {
    manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(id => !coreIds.includes(id))
    await writeFile(f.profile, JSON.stringify(manifest, null, 2) + '\n')
    await launch(f, async page => {
      const body = await page.locator('body').innerText()
      assert(body.includes('DSH 本地构建') && body.includes('account.nav'), 'Negative control did not reproduce missing core customization')
      await page.screenshot({ path: join(output, f.name, 'broken-812.png') })
    }, { broken: true })
  }
  const patchFile = join(dirname(f.profile), 'cordis.patch.yml')
  await writeFile(join(output, f.name, 'baseline.json'), JSON.stringify({ version: expectedVersion, shadows,
    bundles: JSON.parse(await readFile(f.profile)).dsh.profile.bundles, patchSha256: digest(await readFile(patchFile)) }, null, 2))
  console.log(mode + ': prepared isolated baseline')
} else {
  const report = { schema: 1, version: expectedVersion, executable, resumed: options.get('--resume') === 'true', startedAt: new Date().toISOString(), runs: [], passed: false }
  try {
    const scenarios = options.get('--scenarios')?.split(',') ?? ['fresh', 'upgrade-811', 'recover-812']
    for (const name of scenarios) {
      assert(['fresh', 'upgrade-811', 'recover-812'].includes(name), 'Unknown fixture')
      const f = await fixture(name, name === 'fresh' && !report.resumed)
      const baseline = name === 'fresh' ? undefined : JSON.parse(await readFile(join(output, name, 'baseline.json')))
      for (let attempt = 1; attempt <= 2; attempt++) {
        const history = name !== 'fresh' || attempt === 2 || report.resumed ? await historyFixture(f) : undefined
        const run = { name, attempt, passed: false }
        report.runs.push(run)
        const started = Date.now()
        console.log(name + ':' + attempt + ':launch')
        await launch(f, async page => {
          await handleResourceUpdateNotices(page)
          run.customization = await customization(page, f, attempt)
          run.sessions = await sessionPermissions(page, f, attempt)
          if (history) {
            assert.equal(run.sessions.reopened, history.id, 'Retained history did not reopen through the sidebar')
            await page.getByText(history.message, { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
            assert.equal(digest(await readFile(history.file)), history.sha256, 'Original history bytes changed')
            run.retainedHistory = history.id
            await page.screenshot({ path: join(output, f.name, `retained-history-${attempt}.png`) })
          }
          if (baseline) assert.equal(digest(await readFile(join(dirname(f.profile), 'cordis.patch.yml'))), baseline.patchSha256, 'User patch was changed by upgrade')
          // Exercise richer Settings and account layout only after the final
          // fresh restart; language changes are deliberate fixture actions.
          if (name === 'fresh' && attempt === 2) run.accountLayouts = await settingsAndAccount(page, f)
          run.passed = true
        })
        run.durationMs = Date.now() - started
        console.log(name + ':' + attempt + ':verified')
        await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
      }
    }
    report.passed = true
  } catch (error) {
    report.failure = error.stack
    throw error
  } finally {
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
  }
}
