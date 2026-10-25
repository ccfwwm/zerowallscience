import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, join, resolve } from 'node:path'
import { root, verificationRoot } from '../build/paths.mjs'

// Credentials enter through stdin JSON ({ email, password }), or the existing
// encrypted vault of a marked verification fixture. Never import real user data.
const usage = 'node tools/packaging/verify-account-claude.mjs --app <installed dir or exe> --user-data <empty or marked isolated fixture> --output <evidence dir> [--reuse-vault] [--expected-email <requested account>] [--model <exact Claude model>] [--provider <exact provider>]'
const options = new Map()
for (let index = 2; index < process.argv.length; index++) {
  const name = process.argv[index]
  if (name === '--help') { console.log(usage); process.exit(0) }
  if (name === '--reuse-vault') { options.set(name, true); continue }
  const value = process.argv[++index]
  if (!['--app', '--user-data', '--output', '--model', '--provider', '--expected-email'].includes(name) || !value || value.startsWith('--') || options.has(name)) throw new Error(usage)
  options.set(name, value)
}
if (!options.has('--app') || !options.has('--user-data')) throw new Error(usage)
const installation = resolve(options.get('--app'))
const executable = extname(installation).toLowerCase() === '.exe' ? installation : join(installation, 'ZeroWallScience.exe')
const userData = resolve(options.get('--user-data'))
const output = resolve(options.get('--output') ?? join(verificationRoot, 'account-claude-' + Date.now()))
await stat(executable)
await mkdir(userData, { recursive: true })
const markerFile = '.zerowall-account-claude-verification.json'
const contents = await readdir(userData)
if (contents.length && ![markerFile, '.zerowall-workbench-verification.json'].some(name => contents.includes(name))) throw new Error('REFUSING_UNMARKED_EXISTING_USER_DATA: choose an empty directory or a previously marked verification fixture')
await writeFile(join(userData, markerFile), JSON.stringify({ purpose: 'isolated installed account and Claude verification', createdAt: new Date().toISOString() }))
await mkdir(output, { recursive: true })
const json = async file => JSON.parse(await readFile(file, 'utf8'))
const wait = milliseconds => new Promise(done => setTimeout(done, milliseconds))
async function limited(operation, milliseconds, code) {
  let timer
  try { return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(failure(code)), milliseconds) })]) }
  finally { clearTimeout(timer) }
}
function failure(code) { return Object.assign(new Error(code), { verificationCode: code }) }
function check(condition, code) { if (!condition) throw failure(code) }
const safeError = error => ({ name: /^[A-Za-z][A-Za-z0-9]*$/u.test(error?.name ?? '') ? error.name : 'Error',
  code: /^[A-Za-z0-9_./-]{1,100}$/u.test(error?.verificationCode ?? error?.code ?? '') ? error.verificationCode ?? error.code : 'VERIFICATION_FAILED' })
const report = { passed: false, generatedAt: new Date().toISOString(), executable, userData, syntheticDataOnly: true,
  credentials: 'stdin-or-isolated-encrypted-vault', runs: [], rpc: [], login: {}, restore: {}, claude: {} }
const persist = () => writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
const { _electron } = createRequire(join(root, 'desktop/package.json'))('playwright')
let application, phase = 'initialize', input = {}, credentials, route
let defaultBefore

const environmentRoot = join(userData, '_account-verification-environment')
await mkdir(join(environmentRoot, 'localappdata/ZeroWall Science'), { recursive: true })
// Isolate Python's automatic background reconciliation from the real runtime.
await writeFile(join(environmentRoot, 'localappdata/ZeroWall Science/python-location.json'), JSON.stringify({ runtimeRoot: join(environmentRoot, 'Python'), source: 'user-selected' }))
const env = { ...process.env, APPDATA: join(environmentRoot, 'appdata'), LOCALAPPDATA: join(environmentRoot, 'localappdata'),
  USERPROFILE: environmentRoot, HOME: environmentRoot, ZEROWALL_USER_DATA_DIR: userData,
  ZEROWALL_PYTHON_RUNTIME_ROOT: join(environmentRoot, 'Python') }
delete env.ELECTRON_RUN_AS_NODE
delete env.PWDEBUG

async function vaultValue(key) {
  const document = await json(join(userData, 'credentials/vault.json')).catch(error => { if (error.code !== 'ENOENT') throw error })
  const encoded = document?.entries?.[key]
  if (typeof encoded !== 'string') return undefined
  return application.evaluate(({ safeStorage }, value) => {
    if (!safeStorage.isEncryptionAvailable()) return undefined
    try { return safeStorage.decryptString(Buffer.from(value, 'base64')) } catch { return undefined }
  }, encoded)
}

async function rpc(page, method, args = {}, timeout = 60_000) {
  const started = Date.now()
  const result = await limited(page.evaluate(async ({ method, args, timeout }) => {
    const rpcId = crypto.randomUUID()
    const response = await fetch('/api/' + method, { method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(timeout),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method, payload: { args } }) })
    if (!response.ok) return { ok: false, code: 'RPC_HTTP_' + response.status }
    const envelope = await response.json()
    if (envelope.rpcId !== rpcId) return { ok: false, code: 'RPC_CORRELATION_MISMATCH' }
    return envelope.result?.ok === true ? { ok: true, value: envelope.result.value } : { ok: false, code: envelope.result?.error?.code ?? 'RPC_INVALID_RESPONSE' }
  }, { method, args, timeout }), timeout + 1_000, 'RPC_TIMEOUT')
  report.rpc.push({ method, ok: result.ok, durationMs: Date.now() - started })
  if (!result.ok) throw failure(/^[A-Za-z0-9_./-]{1,100}$/u.test(result.code) ? result.code : 'RPC_FAILED')
  return result.value
}

async function start(run) {
  const started = Date.now()
  application = await _electron.launch({ executablePath: executable, args: ['--user-data-dir=' + join(environmentRoot, 'chromium')],
    cwd: dirname(executable), env, timeout: 60_000 })
  // Discard raw stdout/stderr; provider messages may contain private values.
  application.process().stdout?.on('data', () => {})
  application.process().stderr?.on('data', () => {})
  const deadline = Date.now() + 240_000
  let page, state
  while (Date.now() < deadline) {
    page = application.windows().find(window => /^http:\/\/127\.0\.0\.1:/u.test(window.url())) ?? application.windows()[0]
    if (page) {
      state = await page.evaluate(() => window.zerowallDesktop?.getStartupStatus()).catch(() => undefined)
      if (state?.phase === 'failed') throw failure('INSTALLED_APP_STARTUP_FAILED')
      if (state?.phase === 'ready' && /^http:\/\/127\.0\.0\.1:/u.test(page.url())) break
    }
    await wait(250)
  }
  check(state?.phase === 'ready', 'INSTALLED_APP_STARTUP_TIMEOUT')
  for (const button of await page.locator('[role="dialog"] button').all()) {
    if (['继续', '稍后配置'].includes((await button.innerText().catch(() => '')).trim()) && await button.isVisible()) await button.click({ timeout: 1_000 }).catch(() => {})
  }
  await page.locator('button[data-zerowall-footer-action][data-connection]').waitFor({ timeout: 45_000 })
  const identity = await application.evaluate(({ app }) => ({ version: app.getVersion(), packaged: app.isPackaged, appPath: app.getAppPath() }))
  check(identity.packaged && identity.appPath.toLowerCase().startsWith(dirname(executable).toLowerCase()), 'NOT_THE_REQUESTED_PACKAGED_APP')
  report.runs.push({ run, version: identity.version, packaged: identity.packaged, startupMs: Date.now() - started })
  return page
}

async function stop() {
  if (!application) return
  const current = application
  application = undefined
  const pid = current.process().pid
  try { await limited(current.close(), 20_000, 'APP_SHUTDOWN_TIMEOUT') }
  catch (error) {
    if (process.platform === 'win32' && pid) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    else current.process().kill('SIGKILL')
    throw error
  }
}

function accountSummary(account) {
  return { status: account.status, balanceFreshness: account.balanceFreshness, gateway: account.gatewayBaseUrl,
    modelCount: account.models?.length ?? 0, modelSync: account.modelSync?.status, mediaSync: account.mediaSync?.status,
    failedGroups: (account.modelSync?.groups ?? []).filter(group => group.status === 'failed').map(group => group.groupId) }
}
async function accountPanel(page) {
  await page.locator('button[data-zerowall-footer-action][data-connection]').click()
  const panel = page.locator('section:has(#zerowall-account-title)')
  await panel.waitFor({ state: 'visible', timeout: 30_000 })
  return panel
}
async function screenshot(page, name) {
  // Mask credentials and the account identity even in failed-form evidence.
  const masks = [page.locator('input[type="email"]'), page.locator('input[autocomplete="current-password"]'),
    page.locator('section:has(#zerowall-account-title) strong')]
  if (credentials?.email) masks.push(page.getByText(credentials.email, { exact: true }))
  await page.screenshot({ path: join(output, name), mask: masks })
}
async function modelCatalog(page, selected) {
  const deadline = Date.now() + 45_000
  do {
    const catalog = await rpc(page, 'session/modelCatalog', {}, 45_000)
    if (!selected || catalog.groups?.some(group => group.id === selected.providerId && group.models.some(model => model.id === selected.modelId))) return catalog
    await wait(500)
  } while (Date.now() < deadline)
  throw failure('CLAUDE_ROUTE_NOT_SYNCED_TO_PACKAGED_HOST')
}

try {
  if (!options.has('--reuse-vault') && !process.stdin.isTTY) {
    phase = 'read-stdin'
    let raw = ''
    for await (const chunk of process.stdin) {
      raw += chunk
      check(raw.length <= 16_384, 'CREDENTIAL_INPUT_TOO_LARGE')
    }
    if (raw.trim()) input = JSON.parse(raw)
    raw = ''
  }
  phase = 'launch-login-run'
  let page = await start('login')
  const initial = await rpc(page, 'zerowallAccount/current')
  const initialCatalog = await modelCatalog(page)
  defaultBefore = JSON.stringify(initialCatalog.default)
  credentials = input.email && input.password ? { email: input.email, password: input.password } : JSON.parse(await vaultValue('zerowall.ai-cloud.login') ?? '{}')
  check(typeof credentials.email === 'string' && typeof credentials.password === 'string' && credentials.email && credentials.password, 'NO_TEST_CREDENTIALS_IN_STDIN_OR_ISOLATED_VAULT')
  check(!options.has('--expected-email') || credentials.email.trim().toLowerCase() === options.get('--expected-email').trim().toLowerCase(), 'ISOLATED_SAVED_LOGIN_IDENTITY_MISMATCH')
  input.email = ''; input.password = ''
  phase = 'gui-login'
  let panel = await accountPanel(page)
  if (initial.status === 'signedIn') await panel.getByRole('button', { name: /^(退出登录|Sign out)$/u }).click()
  const email = panel.locator('input[type="email"]')
  await email.waitFor({ state: 'visible', timeout: 30_000 })
  await email.fill(credentials.email)
  await panel.locator('input[autocomplete="current-password"]').fill(credentials.password)
  await panel.locator('input[type="checkbox"]').check()
  const [response] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/zerowallAccount/login' && response.request().method() === 'POST', { timeout: 120_000 }),
    panel.locator('button[type="submit"]').click(),
  ])
  check(response.ok(), 'GUI_LOGIN_TRANSPORT_FAILED')
  const envelope = await response.json()
  check(envelope.result?.ok === true && envelope.result.value?.status === 'signedIn', 'GUI_PACKAGED_HOST_LOGIN_FAILED')
  await email.waitFor({ state: 'hidden', timeout: 15_000 })
  phase = 'confirm-current-and-model-sync'
  const current = await rpc(page, 'zerowallAccount/current')
  report.login = { ...accountSummary(current), guiFormSubmitted: true, rpcLoginConfirmed: true,
    identityMatchesInput: current.email?.toLowerCase() === credentials.email.trim().toLowerCase() }
  check(current.status === 'signedIn' && current.balanceFreshness === 'current' && report.login.identityMatchesInput, 'PACKAGED_CURRENT_NOT_AUTHENTICATED')
  const available = (current.models ?? []).filter(model => /^(claude|anthropic)/iu.test(model.modelId) && model.providerId.endsWith('-messages') && !model.stale)
    .filter(model => (!options.has('--model') || model.modelId === options.get('--model')) && (!options.has('--provider') || model.providerId === options.get('--provider')))
  route = available.find(model => model.providerId === initialCatalog.default?.provider && model.modelId === initialCatalog.default?.model) ?? available[0]
  check(route, 'NO_CONFIGURED_CLAUDE_MESSAGES_ROUTE')
  const catalog = await modelCatalog(page, route)
  report.login.modelsSyncedToHost = true
  report.login.defaultSelectionPreserved = JSON.stringify(catalog.default) === defaultBefore
  check(report.login.defaultSelectionPreserved, 'DEFAULT_MODEL_CHANGED_DURING_LOGIN')
  await screenshot(page, 'account-login-masked.png')
  await persist()

  phase = 'restart-and-restore'
  await stop()
  page = await start('restart-restore')
  const restored = await rpc(page, 'zerowallAccount/current')
  report.restore = { ...accountSummary(restored), identityMatchesLogin: restored.email?.toLowerCase() === credentials.email.trim().toLowerCase() }
  check(restored.status === 'signedIn' && restored.balanceFreshness === 'current' && report.restore.identityMatchesLogin, 'PACKAGED_ACCOUNT_NOT_RESTORED_AFTER_RESTART')
  check(restored.models?.some(model => model.providerId === route.providerId && model.modelId === route.modelId && !model.stale), 'RESTORED_CLAUDE_ROUTE_MISSING')
  const restoredCatalog = await modelCatalog(page, route)
  report.restore.modelsSyncedToHost = true
  report.restore.defaultSelectionPreserved = JSON.stringify(restoredCatalog.default) === defaultBefore
  check(report.restore.defaultSelectionPreserved, 'DEFAULT_MODEL_CHANGED_AFTER_RESTART')
  await accountPanel(page)
  await screenshot(page, 'account-restored-masked.png')
  await persist()

  phase = 'claude-messages'
  let apiKey = await vaultValue('zerowall.ai-cloud.group.' + route.groupId)
  check(typeof apiKey === 'string' && apiKey.length > 0, 'ISOLATED_GROUP_CREDENTIAL_MISSING')
  const endpoint = new URL(route.baseUrl)
  check(endpoint.protocol === 'https:' && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash, 'INVALID_CONFIGURED_CLAUDE_ENDPOINT')
  endpoint.pathname = endpoint.pathname.replace(/\/+$/u, '') + '/v1/messages'
  const marker = 'ZERO_WALL_CLAUDE_OK_' + randomUUID().slice(0, 8)
  const started = Date.now()
  const reply = await fetch(endpoint, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: route.modelId, max_tokens: 64, messages: [{ role: 'user', content: 'Reply only with ' + marker + '.' }] }), signal: AbortSignal.timeout(120_000) })
  apiKey = ''
  const body = await reply.json()
  const text = (body.content ?? []).filter(part => part.type === 'text').map(part => part.text ?? '').join('')
  report.claude = { success: reply.ok && text.includes(marker), method: 'minimal-messages-on-restored-configured-route',
    requestModel: route.modelId, providerId: route.providerId, hostCatalogConfirmed: true, protocol: 'anthropic-messages',
    host: endpoint.host, path: endpoint.pathname, httpStatus: reply.status, responseModel: body.model,
    durationMs: Date.now() - started, outputCharacters: text.length, outputSha256: createHash('sha256').update(text).digest('hex'),
    markerMatched: text.includes(marker), stopReason: body.stop_reason,
    usage: Object.fromEntries(Object.entries(body.usage ?? {}).filter(([key, value]) => /tokens$/u.test(key) && typeof value === 'number')),
    ...(body.error ? { errorType: /^[A-Za-z0-9_-]+$/u.test(body.error.type ?? '') ? body.error.type : 'provider-error' } : {}) }
  check(report.claude.success, 'CONFIGURED_CLAUDE_RESPONSE_FAILED')
  const finalCatalog = await modelCatalog(page, route)
  check(JSON.stringify(finalCatalog.default) === defaultBefore, 'DEFAULT_MODEL_CHANGED_DURING_CLAUDE_TEST')
  report.defaultSelectionPreserved = true
  phase = 'installed-plugin-versions'
  report.installedPlugins = []
  for (const id of ['@zerowallscience/plugin-account', '@zerowallscience/plugin-ai-cloud', '@zerowallscience/plugin-claude-code']) {
    const manifest = await json(join(userData, 'harness/profiles/web/node_modules', id, 'package.json')).catch(error => { if (error.code !== 'ENOENT') throw error })
    report.installedPlugins.push({ id, version: manifest?.version ?? null })
  }
  const digest = createHash('sha256')
  for await (const bytes of createReadStream(executable)) digest.update(bytes)
  report.executableSha256 = digest.digest('hex')
  report.passed = true
} catch (error) {
  report.failure = { phase, ...safeError(error) }
  if (application) {
    const page = application.windows().find(window => /^http:\/\/127\.0\.0\.1:/u.test(window.url()))
    if (page) await screenshot(page, 'failure-masked.png').catch(() => {})
  }
  process.exitCode = 1
} finally {
  if (credentials) { credentials.email = ''; credentials.password = '' }
  input = {}
  await stop().catch(error => { report.shutdownFailure = safeError(error); report.passed = false; process.exitCode = 1 })
  report.finishedAt = new Date().toISOString()
  await persist()
  console.log(JSON.stringify({ passed: report.passed, output, login: report.login.status, restore: report.restore.status,
    claude: report.claude.success ?? false, failure: report.failure }))
}
