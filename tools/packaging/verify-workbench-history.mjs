import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { contract, root, verificationRoot } from '../build/paths.mjs'

// Run this against an actual installed directory. All application state lives
// under a new, marked fixture directory; existing user data is never imported.
const options = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index], value = process.argv[index + 1]
  assert(['--app', '--user-data', '--output', '--history-source', '--scenario'].includes(name) && value && !value.startsWith('--'),
    'Usage: node tools/packaging/verify-workbench-history.mjs --app <installed dir or exe> [--scenario fresh|history] [--user-data <empty isolated dir>] [--output <report dir>] [--history-source <read-only harness/sessions dir>]')
  assert(!options.has(name), `Repeated argument: ${name}`)
  options.set(name, value)
}
assert(options.has('--app'), '--app must point to the installed application')
const scenario = options.get('--scenario') ?? 'history'
assert(['fresh', 'history'].includes(scenario), '--scenario must be fresh or history')
assert(scenario !== 'fresh' || !options.has('--history-source'), 'The fresh scenario cannot import history')
const installation = resolve(options.get('--app'))
const executable = extname(installation).toLowerCase() === '.exe' ? installation : join(installation, 'ZeroWallScience.exe')
await stat(executable)
const output = resolve(options.get('--output') ?? join(verificationRoot, 'workbench-history-' + Date.now()))
const userData = options.has('--user-data') ? resolve(options.get('--user-data')) : join(await mkdtemp(join(tmpdir(), 'zwh-')), 'data')
await mkdir(userData, { recursive: true })
assert.deepEqual(await readdir(userData), [], '--user-data must be empty; refusing to change existing application data')
await mkdir(output, { recursive: true })
const fixtureId = randomUUID()
await writeFile(join(userData, '.zerowall-workbench-verification.json'), JSON.stringify({ fixtureId, purpose: 'synthetic workbench history verification' }, null, 2), { flag: 'wx' })
const environmentRoot = join(userData, '_environment')
const workspaceTitle = 'ZeroWall-verification-local'
const workspace = join(environmentRoot, workspaceTitle)
const defaultWorkspacePath = join(userData, 'workspace')
const unreachableWorkspace = '\\\\wsl.localhost\\ZeroWallVerificationUnavailable-' + fixtureId + '\\home\\history'
for (const directory of [...(scenario === 'history' ? [workspace] : []), join(environmentRoot, 'appdata'), join(environmentRoot, 'localappdata/ZeroWall Science')]) {
  await mkdir(directory, { recursive: true })
}
// Python's automatic bootstrap, if scheduled, must use the fixture's fixed
// root and may never reconcile the real installation's Python directory.
await writeFile(join(environmentRoot, 'localappdata/ZeroWall Science/python-location.json'), JSON.stringify({ runtimeRoot: join(environmentRoot, 'Python'), source: 'user-selected' }))
const env = { ...process.env, APPDATA: join(environmentRoot, 'appdata'), LOCALAPPDATA: join(environmentRoot, 'localappdata'),
  USERPROFILE: environmentRoot, HOME: environmentRoot, ZEROWALL_USER_DATA_DIR: userData, ZEROWALL_PYTHON_RUNTIME_ROOT: join(environmentRoot, 'Python') }
delete env.ELECTRON_RUN_AS_NODE
const { _electron } = createRequire(join(root, 'desktop/package.json'))('playwright')
const copiedHistory = [], importedSessionIds = new Set()
let historySource
if (options.has('--history-source')) {
  historySource = resolve(options.get('--history-source'))
  assert((await stat(historySource)).isDirectory(), '--history-source must be an existing session root')
  const sourceToFixture = relative(historySource, userData)
  const fixtureToSource = relative(userData, historySource)
  assert(sourceToFixture.startsWith('..' + sep) && fixtureToSource.startsWith('..' + sep), 'History source and isolated profile must not contain each other')
  const pending = ['']
  while (pending.length) {
    const local = pending.pop()
    for (const entry of await readdir(join(historySource, local), { withFileTypes: true })) {
      const path = join(local, entry.name)
      assert(!entry.isSymbolicLink(), 'History source contains a link; refusing to follow it')
      if (entry.isDirectory()) { pending.push(path); continue }
      assert(entry.isFile(), 'History source contains a non-file entry')
      const bytes = await readFile(join(historySource, path))
      const destination = join(userData, 'harness/sessions', path)
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, bytes, { flag: 'wx' })
      copiedHistory.push({ path, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
      if (/^session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/u.test(entry.name)) {
        const plain = entry.name.endsWith('.zstd') ? zstdDecompressSync(bytes) : bytes
        const header = JSON.parse(plain.subarray(0, plain.indexOf(10) < 0 ? plain.length : plain.indexOf(10)).toString('utf8'))
        assert(header.type === 'session' && typeof header.id === 'string', 'History source contains an invalid session header')
        importedSessionIds.add(header.id)
      }
    }
  }
  assert(importedSessionIds.size > 0, 'History source contains no session headers')
}

// Deliberately retain v3 logs: upgrades must discover existing conversations
// through the released legacy reader rather than only accept newly made logs.
function projectKey(cwd) {
  let readable = '', separatorRun = false
  for (let index = 0; index < cwd.length; index++) {
    const character = cwd[index]
    if ('/\\:'.includes(character)) {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else {
      readable += character !== '~' && /^[A-Za-z0-9._-]$/u.test(character)
        ? character : '~' + cwd.charCodeAt(index).toString(16).toUpperCase().padStart(4, '0')
      separatorRun = false
    }
  }
  return `--${(readable.replace(/^-+/u, '') || 'root').slice(0, 251)}--`
}
const fixtures = []
for (const [kind, cwd] of scenario === 'history' ? [['local', workspace], ['unreachable-wsl', unreachableWorkspace]] : []) {
  const id = 'session-' + randomUUID(), now = Date.now()
  const title = `ZeroWall history fixture ${kind}`
  const message = `Retained conversation fixture ${kind} ${fixtureId}`
  const header = { type: 'session', version: 3, id, createdAt: now, cwd, isSeeded: false, delegationDepth: 0, agentPreset: 'standard' }
  const events = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'step/start', data: { turn: 1, step: 1 } },
    { type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: message }], source: { kind: 'user' }, id: randomUUID() }, surfaceOp: 'append' },
    { type: 'step/end', data: { turn: 1, step: 1 } },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    { type: 'session/title', data: { title, messageSeqs: [], source: { kind: 'user' } } },
  ].map((event, seq) => ({ ...event, seq, time: now + seq }))
  const directory = join(userData, 'harness/sessions', projectKey(cwd), id)
  await mkdir(directory, { recursive: true })
  const file = join(directory, 'session.v3.jsonl')
  const original = Buffer.from([header, ...events].map(row => JSON.stringify(row)).join('\n') + '\n')
  await writeFile(file, original, { flag: 'wx' })
  fixtures.push({ kind, id, cwd, title, message, file, original, workspaceId: randomUUID() })
}
let expectedWorkspaceId
let expectedDefaultWorkspaceId

const report = { passed: false, version: contract.version, buildId: contract.buildId, installation: dirname(executable), executable,
  userData, fixtureId, scenario, precreatedWorkspaceDomain: false, precreatedPluginProfile: false,
  syntheticDataOnly: !historySource, startupDeadlineMs: 120_000, runs: [], errors: [],
  importedHistory: historySource ? { files: copiedHistory.length, sessions: importedSessionIds.size, sourceReadOnly: true,
    sourceInventorySha256: createHash('sha256').update(copiedHistory.map(item => `${item.path}:${item.sha256}`).sort().join('\n')).digest('hex') } : undefined,
  pathLengths: { userData: userData.length, longestSeed: Math.max(0, ...fixtures.map(item => item.file.length)) } }
const redact = value => String(value).replace(/([?&](?:token|key|api_key|access_token|auth)=)[^&#\s]+/giu, '$1[redacted]')
  .replace(/((?:authorization|cookie|password|bearer|api[-_ ]?key)["'\s:=]+)[^\s,;"']+/giu, '$1[redacted]')
const wait = milliseconds => new Promise(done => setTimeout(done, milliseconds))
async function limited(operation, milliseconds, label) {
  let timer
  try {
    return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timed out')), milliseconds) })])
  } finally { clearTimeout(timer) }
}
async function startupEvents(started) {
  const source = await readFile(join(userData, 'logs/startup.log'), 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return '' })
  return source.split(/\r?\n/u).flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } }).filter(event => Date.parse(event.timestamp) >= started)
}
async function transactionState() {
  const directory = join(userData, 'harness/profiles')
  const profiles = await readdir(directory).catch(error => { if (error.code !== 'ENOENT') throw error; return [] })
  const locked = await stat(join(directory, '.zerowall-plugin-mutation.lock')).then(() => true, error => { if (error.code !== 'ENOENT') throw error; return false })
  const temporaryProfiles = profiles.filter(name => name === 'zerowall' || name.startsWith('zerowall-pnpm-'))
  return { settled: !locked && temporaryProfiles.length === 0, locked, temporaryProfiles }
}
async function pathMetrics(directory) {
  const pending = [directory]
  const result = { longestPath: directory, longestLength: directory.length, entriesOver260: 0, files: 0, directories: 0, links: 0 }
  while (pending.length) {
    const current = pending.pop()
    const entries = await readdir(current, { withFileTypes: true }).catch(error => { if (error.code !== 'ENOENT') throw error; return [] })
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (path.length > result.longestLength) { result.longestPath = path; result.longestLength = path.length }
      if (path.length > 260) result.entriesOver260++
      if (entry.isSymbolicLink()) result.links++
      else if (entry.isDirectory()) { result.directories++; pending.push(path) }
      else result.files++
    }
  }
  return result
}
async function layoutSnapshot(page) {
  return page.evaluate(() => {
    const visible = element => {
      if (!element) return false
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return false
      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current)
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
      }
      return true
    }
    const frame = document.querySelector('[data-rightbar-col]')?.parentElement
    const sidebar = document.querySelector('[data-sidebar-footer]')?.parentElement
    const content = document.querySelector('[data-conversation-content]')
    const footer = document.querySelector('[data-sidebar-footer]')
    const box = element => element?.getBoundingClientRect().toJSON() ?? null
    const flow = element => element ? { display: getComputedStyle(element).display, direction: getComputedStyle(element).flexDirection } : null
    const images = Array.from(document.querySelectorAll('img[src*="zerowall-icon.png"]')).filter(visible).map(image => ({
      complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, bounds: box(image),
    }))
    const frameStyle = flow(frame), sidebarStyle = flow(sidebar), contentStyle = flow(content)
    const ready = !document.querySelector('[data-dsh-boot], [data-dsh-boot-failed]')
      && visible(frame) && frameStyle?.display === 'grid' && visible(sidebar)
      && sidebarStyle?.display === 'flex' && sidebarStyle.direction === 'column'
      && visible(footer) && images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)
    return { ready, viewport: { width: innerWidth, height: innerHeight }, frame: box(frame), frameStyle,
      sidebar: box(sidebar), sidebarStyle, footer: box(footer), content: box(content), contentStyle, images,
      rightbarVisible: visible(document.querySelector('[data-rightbar-col]')), treeItems: document.querySelectorAll('[role="treeitem"]').length,
      bootFailed: Boolean(document.querySelector('[data-dsh-boot-failed]')) }
  })
}
async function dismissFirstUseDialogs(page) {
  const buttons = page.locator('[role="dialog"] button')
  for (const button of await buttons.all()) {
    if (['继续', '稍后配置'].includes((await button.innerText().catch(() => '')).trim()) && await button.isVisible()) {
      await button.click({ timeout: 1000 }).catch(() => {})
    }
  }
}
async function rpc(page, method, args, timeout) {
  return limited(page.evaluate(async ({ method, args, timeout }) => {
    const response = await fetch('/api/' + method, { method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(timeout),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args } }) })
    if (!response.ok) throw new Error(method + ' HTTP ' + response.status)
    const envelope = await response.json()
    if (!envelope.result?.ok) throw new Error(method + ' failed: ' + String(envelope.result?.error?.code ?? 'invalid response'))
    return envelope.result.value
  }, { method, args, timeout }), timeout + 250, method)
}
async function defaultWorkspaceReady(page, timeout) {
  const deadline = Date.now() + timeout
  let found
  while (Date.now() < deadline) {
    const bytes = await readFile(join(userData, 'harness/storages/workspace.json'), 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return undefined })
    const domain = bytes === undefined ? undefined : JSON.parse(bytes)
    const candidate = Object.entries(domain?.tables?.workspaces ?? {}).find(([, item]) => resolve(item.path).toLowerCase() === resolve(defaultWorkspacePath).toLowerCase())
    if (candidate && domain.global.workspaceIds.includes(candidate[0])) { found = candidate; break }
    await wait(Math.min(100, Math.max(1, deadline - Date.now())))
  }
  assert(found, 'The application did not restore its fixed local default Workspace')
  expectedDefaultWorkspaceId ??= found[0]
  assert.equal(found[0], expectedDefaultWorkspaceId, 'Default Workspace identity changed across application launches')
  assert((await stat(defaultWorkspacePath)).isDirectory(), 'Default Workspace directory is missing')
  const row = page.locator(`[role="treeitem"][data-row-key="workspace:${found[0]}"]`)
  await row.waitFor({ timeout: Math.max(1, deadline - Date.now()) })
  return { workspaceId: found[0], visible: true, existsOnDisk: true, sessionIds: found[1].sessionIds }
}
async function clickNewSessionAndType(page, timeout) {
  const before = await rpc(page, 'session/list', { _request: {} }, timeout)
  const known = new Set(before.items.map(item => item.sessionId))
  await page.getByRole('button', { name: /^(新建会话|新会话|New Session|New session)$/u }).first().click({ timeout })
  const deadline = Date.now() + timeout
  let created
  while (Date.now() < deadline) {
    const list = await rpc(page, 'session/list', { _request: {} }, Math.max(1, deadline - Date.now()))
    created = list.items.find(item => !known.has(item.sessionId))
    if (created) break
    await wait(100)
  }
  assert(created, 'The New Session button did not create a durable Session')
  if (scenario === 'fresh') assert.equal(resolve(created.cwd).toLowerCase(), resolve(defaultWorkspacePath).toLowerCase(), 'Fresh New Session did not use the fixed default Workspace')
  const content = page.locator(`[data-conversation-content][data-conversation-session="${created.sessionId}"]`)
  await content.waitFor({ timeout })
  const editor = content.locator('[data-composer-input]').first()
  await editor.waitFor({ timeout })
  // A genuinely empty profile may require model setup. Preserve that product
  // state and prove its explicit recovery control, rather than configuring a
  // test-only default or treating every disabled editor as a successful input.
  if (await editor.getAttribute('contenteditable') !== 'true') {
    const reason = await editor.getAttribute('data-placeholder') ?? ''
    const modelChoice = content.getByRole('button', { name: /请选择模型|Select model|选择模型，当前/u }).first()
    if (/模型|model/iu.test(reason) && await modelChoice.isVisible() && await modelChoice.isEnabled()) {
      const catalog = await rpc(page, 'session/modelCatalog', {}, timeout)
      const modelsAvailable = catalog.groups.reduce((count, group) => count + group.models.length, 0)
      return { created: true, opened: true, inputAccepted: false, inputState: 'requires-model-configuration', reason,
        modelChoiceEnabled: true, modelsAvailable, defaultWorkspace: resolve(created.cwd).toLowerCase() === resolve(defaultWorkspacePath).toLowerCase() }
    }
  }
  await page.waitForFunction(element => element.getAttribute('contenteditable') === 'true', await editor.elementHandle(), { timeout })
  const text = 'ZeroWall isolated input verification ' + fixtureId
  await editor.fill(text, { timeout })
  assert.equal(await editor.innerText(), text, 'The new conversation did not accept the typed draft')
  await editor.fill('', { timeout })
  return { created: true, opened: true, inputAccepted: true, inputState: 'typed-draft-verified', defaultWorkspace: resolve(created.cwd).toLowerCase() === resolve(defaultWorkspacePath).toLowerCase() }
}
async function stop(application) {
  if (!application) return
  const child = application.process()
  await limited(application.close(), 5000, 'Electron shutdown').catch(() => {})
  if (child.exitCode === null && child.pid) await new Promise(done => {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    killer.once('exit', done); killer.once('error', done)
  })
}

try {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now(), deadline = started + report.startupDeadlineMs
    const run = { attempt, passed: false, timing: {}, screenshots: [], rendererErrors: [], consoleErrors: [], checks: [] }
    report.runs.push(run)
    const remaining = () => Math.max(1, deadline - Date.now())
    let application, page
    try {
      console.log(`workbench-history-${attempt}:launch`)
      application = await _electron.launch({ executablePath: executable, cwd: dirname(executable),
        args: [`--user-data-dir=${join(environmentRoot, 'chromium')}`], env, timeout: remaining() })
      run.actualVersion = await limited(application.evaluate(({ app }) => app.getVersion()), remaining(), 'Application version')
      assert.equal(run.actualVersion, contract.version, 'Installed desktop version differs from the source version')
      const observed = new WeakSet()
      const observe = candidate => {
        if (observed.has(candidate)) return
        observed.add(candidate)
        candidate.on('pageerror', error => run.rendererErrors.push(redact(error.message).slice(0, 1600)))
        candidate.on('console', message => { if (message.type() === 'error') run.consoleErrors.push(redact(message.text()).slice(0, 1600)) })
      }
      application.context().pages().forEach(observe)
      application.context().on('page', observe)
      while (Date.now() < deadline) {
        const events = await startupEvents(started)
        const firstHostReady = events.find(event => event.segment === 'host:ready')
        const firstDesktopReady = events.find(event => event.phase === 'ready')
        if (firstHostReady && run.timing.hostReadyMs === undefined) run.timing.hostReadyMs = Date.parse(firstHostReady.timestamp) - started
        if (firstDesktopReady && run.timing.desktopDeclaredReadyMs === undefined) run.timing.desktopDeclaredReadyMs = Date.parse(firstDesktopReady.timestamp) - started
        const failure = events.find(event => event.phase === 'failed')
        if (failure) throw new Error('Desktop startup failed: ' + redact(failure.message))
        page = application.context().pages().find(candidate => candidate.url().startsWith('http://127.0.0.1:'))
        if (page) {
          await dismissFirstUseDialogs(page)
          run.layout = await limited(layoutSnapshot(page), Math.min(3000, remaining()), 'Layout observation').catch(() => run.layout)
          if (run.layout?.bootFailed) throw new Error('Renderer plugin boot reported a failure')
          if (run.layout?.ready && run.timing.coreShellMs === undefined) {
            run.timing.coreShellMs = Date.now() - started
            console.log(`workbench-history-${attempt}:core-shell-${run.timing.coreShellMs}ms`)
          }
          if (run.layout?.ready && events.some(event => event.phase === 'ready')) break
        }
        await wait(Math.min(300, remaining()))
      }
      assert(run.layout?.ready, 'Native grid/sidebar layout or visible brand PNG did not become usable within 120 seconds')
      run.timing.desktopReadyMs = Date.now() - started
      assert((await startupEvents(started)).some(event => event.phase === 'ready'), 'Desktop never reported ready within 120 seconds')
      assert(run.layout.sidebar.height > run.layout.viewport.height - 80, 'Sidebar does not fill the window height')
      assert(run.layout.footer.bottom <= run.layout.viewport.height + 2 && run.layout.footer.y > run.layout.viewport.height - 180, 'Sidebar footer escaped the bottom seat')
      run.checks.push('Native grid and sidebar CSS are active; visible brand PNGs decoded')
      await page.screenshot({ path: join(output, `workbench-${attempt}.png`), timeout: Math.min(5000, remaining()) })
      run.screenshots.push(`workbench-${attempt}.png`)
      run.defaultWorkspace = await defaultWorkspaceReady(page, Math.min(8000, remaining()))
      run.newSession = await clickNewSessionAndType(page, Math.min(10000, remaining()))
      run.checks.push('The fixed default Workspace is present without test-created registrations; clicking New Session creates and opens it; input readiness is reported separately')
      const queryStarted = Date.now()
      const list = await rpc(page, 'session/list', { _request: {} }, Math.min(8000, remaining()))
      run.timing.sessionListMs = Date.now() - queryStarted
      assert(Array.isArray(list.items), 'Session RPC did not return a list')
      run.sessionRpc = { count: list.items.length, localFound: fixtures.length ? list.items.some(item => item.sessionId === fixtures[0].id) : undefined,
        unreachableWslFound: fixtures.length ? list.items.some(item => item.sessionId === fixtures[1].id) : undefined,
        importedFound: [...importedSessionIds].filter(id => list.items.some(item => item.sessionId === id)).length }
      if (scenario === 'history') {
      assert(run.sessionRpc.localFound && run.sessionRpc.unreachableWslFound, 'Local or unreachable WSL history disappeared from session/list')
      assert.equal(run.sessionRpc.importedFound, importedSessionIds.size, 'Some copied original sessions disappeared from session/list')
      run.checks.push('session/list completes with both local and unreachable WSL histories')
      const domain = JSON.parse(await readFile(join(userData, 'harness/storages/workspace.json'), 'utf8'))
      const registration = Object.entries(domain.tables?.workspaces ?? {}).find(([, item]) => resolve(item.path).toLowerCase() === resolve(workspace).toLowerCase())
      assert(registration, 'The application did not bootstrap the historical local Workspace')
      expectedWorkspaceId ??= registration[0]
      run.workspaceRpc = { preservedId: registration[0] === expectedWorkspaceId, localSessionFound: registration[1].sessionIds?.includes(fixtures[0].id), observedThroughUiStream: true }
      assert(run.workspaceRpc.preservedId && run.workspaceRpc.localSessionFound, 'Historical Workspace registration or Session membership is missing')
      run.checks.push('Workspace follow stream projects the original registration and Session membership without test-created Workspaces')
      const workspaceRow = page.getByRole('treeitem').filter({ hasText: workspaceTitle }).first()
      await workspaceRow.waitFor({ timeout: Math.min(8000, remaining()) })
      if (await workspaceRow.getAttribute('aria-expanded') !== 'true') await workspaceRow.click({ timeout: Math.min(3000, remaining()) })
      // A legacy log without its old projection cache is initially shown with
      // the neutral title. Its stable public row key proves it exists before
      // opening; opening must then recover its actual persisted title/body.
      const sessionRow = page.locator(`[role="treeitem"][data-row-key="session:${fixtures[0].id}"]`)
      await sessionRow.waitFor({ timeout: Math.min(8000, remaining()) })
      await sessionRow.click({ timeout: Math.min(3000, remaining()) })
      await page.getByText(fixtures[0].message, { exact: true }).first().waitFor({ timeout: Math.min(8000, remaining()) })
      await page.getByRole('treeitem').filter({ hasText: fixtures[0].title }).first().waitFor({ timeout: Math.min(5000, remaining()) })
      run.checks.push('The original local history title and conversation body are visible through the sidebar')
      run.timing.historyVisibleMs = Date.now() - started
      await page.screenshot({ path: join(output, `history-${attempt}.png`), timeout: Math.min(5000, remaining()) })
      run.screenshots.push(`history-${attempt}.png`)
      }
      while (Date.now() < deadline) {
        run.profileTransaction = await transactionState()
        if (run.profileTransaction.settled) break
        await wait(Math.min(300, remaining()))
      }
      assert(run.profileTransaction?.settled, 'Background profile transaction did not settle within the startup deadline')
      run.timing.profileSettledMs = Date.now() - started
      // A repair can restart the Host after the first usable frame. Wait for
      // the resulting generation, then repeat actual API and conversation
      // checks; an earlier screenshot must not conceal a later empty shell.
      const settledAt = Date.now()
      let finalReady = false
      while (Date.now() < deadline) {
        page = application.context().pages().find(candidate => candidate.url().startsWith('http://127.0.0.1:'))
        if (page) {
          const status = await limited(page.evaluate(() => window.zerowallDesktop?.getStartupStatus()), Math.min(2000, remaining()), 'Final desktop status').catch(() => null)
          const layout = await limited(layoutSnapshot(page), Math.min(2000, remaining()), 'Final layout').catch(() => null)
          if (status?.phase === 'failed') throw new Error('Desktop failed after profile repair: ' + redact(status.message))
          if (status?.phase === 'ready' && layout?.ready && Date.now() - settledAt >= 2000) {
            run.finalLayout = layout
            finalReady = true
            break
          }
        }
        await wait(Math.min(200, remaining()))
      }
      assert(finalReady, 'Workbench did not remain usable after background profile repair')
      const finalQueryStarted = Date.now()
      const finalList = await rpc(page, 'session/list', { _request: {} }, Math.min(8000, remaining()))
      run.timing.finalSessionListMs = Date.now() - finalQueryStarted
      assert(fixtures.every(fixture => finalList.items?.some(item => item.sessionId === fixture.id)), 'A background Host restart removed history from session/list')
      assert([...importedSessionIds].every(id => finalList.items?.some(item => item.sessionId === id)), 'Copied original history disappeared after profile repair')
      await dismissFirstUseDialogs(page)
      run.finalDefaultWorkspace = await defaultWorkspaceReady(page, Math.min(5000, remaining()))
      assert.equal(run.finalDefaultWorkspace.workspaceId, run.defaultWorkspace.workspaceId, 'Default Workspace identity changed during profile repair')
      run.finalNewSession = await clickNewSessionAndType(page, Math.min(10000, remaining()))
      if (scenario === 'history') {
      const finalDomain = JSON.parse(await readFile(join(userData, 'harness/storages/workspace.json'), 'utf8'))
      assert(finalDomain.tables.workspaces[expectedWorkspaceId]?.sessionIds?.includes(fixtures[0].id), 'Workspace registration or history membership disappeared after profile repair')
      const finalWorkspaceRow = page.getByRole('treeitem').filter({ hasText: workspaceTitle }).first()
      await finalWorkspaceRow.waitFor({ timeout: Math.min(5000, remaining()) })
      if (await finalWorkspaceRow.getAttribute('aria-expanded') !== 'true') await finalWorkspaceRow.click({ timeout: Math.min(3000, remaining()) })
      const finalSessionRow = page.locator(`[role="treeitem"][data-row-key="session:${fixtures[0].id}"]`)
      await finalSessionRow.waitFor({ timeout: Math.min(5000, remaining()) })
      await finalSessionRow.click({ timeout: Math.min(3000, remaining()) })
      await page.getByText(fixtures[0].message, { exact: true }).first().waitFor({ timeout: Math.min(5000, remaining()) })
      await page.getByRole('treeitem').filter({ hasText: fixtures[0].title }).first().waitFor({ timeout: Math.min(5000, remaining()) })
      await page.screenshot({ path: join(output, `settled-history-${attempt}.png`), timeout: Math.min(5000, remaining()) })
      run.screenshots.push(`settled-history-${attempt}.png`)
      run.timing.finalHistoryVisibleMs = Date.now() - started
      run.checks.push('After background repair, the active Host still serves both histories and the sidebar opens the local original body')
      } else {
        await page.screenshot({ path: join(output, `settled-new-session-${attempt}.png`), timeout: Math.min(5000, remaining()) })
        run.screenshots.push(`settled-new-session-${attempt}.png`)
        run.checks.push('Fresh startup and the settled Host both create and open conversations from the visible New Session button')
      }
      const events = await startupEvents(started)
      assert(!events.some(event => event.phase === 'failed'), 'Desktop rolled back or failed after the workbench became available')
      for (const fixture of fixtures) {
        const current = await readFile(fixture.file)
        assert(current.subarray(0, fixture.original.length).equals(fixture.original), 'An original v3 session header or history event was rewritten')
      }
      run.checks.push('Background profile repair settled without a later desktop failure; original v3 logs retain their bytes')
      assert.deepEqual(run.rendererErrors, [], 'Renderer raised an unhandled error')
      run.passed = true
      console.log(`workbench-history-${attempt}:verified`)
    } catch (error) {
      run.failure = redact(error.stack ?? error)
      if (page) {
        run.layout = await limited(layoutSnapshot(page), 3000, 'Failure layout').catch(() => run.layout)
        await page.screenshot({ path: join(output, `failure-${attempt}.png`), timeout: 5000 }).then(() => run.screenshots.push(`failure-${attempt}.png`), () => {})
        if (!historySource) {
          const snapshot = await limited(page.locator('body').ariaSnapshot(), 3000, 'Failure accessibility snapshot').catch(() => '')
          if (snapshot) await writeFile(join(output, `failure-${attempt}.aria.txt`), redact(snapshot))
        }
      }
      console.error(`workbench-history-${attempt}:failed: ${redact(error.message ?? error)}`)
    } finally {
      run.totalMs = Date.now() - started
      run.startupEvents = (await startupEvents(started)).map(({ timestamp, phase, segment, durationMs }) => ({ timestamp, phase, segment, durationMs }))
      await stop(application)
      await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
    }
  }
  report.originalHistory = []
  for (const fixture of fixtures) {
    const current = await readFile(fixture.file)
    report.originalHistory.push({ kind: fixture.kind, preserved: current.subarray(0, fixture.original.length).equals(fixture.original),
      originalSha256: createHash('sha256').update(fixture.original).digest('hex') })
  }
  report.pathLengths.sessions = await pathMetrics(join(userData, 'harness/sessions'))
  report.pathLengths.profiles = await pathMetrics(join(userData, 'harness/profiles'))
  report.passed = report.runs.length === 2 && report.runs.every(run => run.passed) && report.originalHistory.every(row => row.preserved)
} catch (error) {
  report.errors.push(redact(error.stack ?? error))
} finally {
  if (historySource) {
    let sourceUnchanged = true, cloneOriginalsPreserved = true
    for (const item of copiedHistory) {
      const source = await readFile(join(historySource, item.path)).catch(() => null)
      const clone = await readFile(join(userData, 'harness/sessions', item.path)).catch(() => null)
      sourceUnchanged &&= source !== null && createHash('sha256').update(source).digest('hex') === item.sha256
      cloneOriginalsPreserved &&= clone !== null && clone.length >= item.size && createHash('sha256').update(clone.subarray(0, item.size)).digest('hex') === item.sha256
    }
    Object.assign(report.importedHistory, { sourceUnchanged, cloneOriginalsPreserved })
    if (!sourceUnchanged || !cloneOriginalsPreserved) report.passed = false
  }
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ passed: report.passed, report: join(output, 'report.json'), userData, starts: report.runs.map(run => ({ attempt: run.attempt, passed: run.passed, timing: run.timing })) }, null, 2))
  if (!report.passed) process.exitCode = 1
}
