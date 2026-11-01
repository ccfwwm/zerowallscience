import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { randomBytes, randomUUID } from 'node:crypto'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { test } from 'node:test'
import { chromium } from 'playwright'
import { contract } from '../../tools/build/paths.mjs'
import { locatePackagedApp } from '../scripts/packaged-app.mjs'
import { chromiumProfileEncryption, openWindowsProfileEncryption } from '../src/main/credentials/windows-profile.ts'

const delay = ms => new Promise(accept => setTimeout(accept, ms))

// app.getPath('appData') uses the Windows known folder and may ignore APPDATA.
// Pause the real packaged main before entry, bind only that OS path to our
// fixture, then resume. Do not set ZEROWALL_USER_DATA_DIR: that used to hide
// the normal startup migration branch in packaged verification.
async function bindKnownFolder(endpoint, appData) {
  const socket = new WebSocket(endpoint)
  await once(socket, 'open')
  let nextId = 0
  const pending = new Map()
  let signalPaused
  const paused = new Promise(accept => { signalPaused = accept })
  socket.addEventListener('message', event => {
    const response = JSON.parse(String(event.data))
    if (response.method === 'Debugger.paused') signalPaused()
    if (response.id) {
      const request = pending.get(response.id)
      if (request) {
        pending.delete(response.id)
        if (response.error) request.reject(new Error(JSON.stringify(response.error)))
        else request.resolve(response.result)
      }
    }
  })
  const send = (method, params = {}) => new Promise((accept, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Inspector timed out: ${method}`)) }, 10_000)
    pending.set(id, { resolve: result => { clearTimeout(timer); accept(result) }, reject: error => { clearTimeout(timer); reject(error) } })
    socket.send(JSON.stringify({ id, method, params }))
  })
  try {
    await send('Runtime.enable')
    await send('Debugger.enable')
    await send('Runtime.runIfWaitingForDebugger')
    await Promise.race([paused, delay(10_000).then(() => { throw new Error('Main entry did not pause') })])
    const result = await send('Runtime.evaluate', { expression: `(() => {
      const { app } = process.getBuiltinModule('node:module').createRequire(process.execPath)('electron');
      app.setPath('appData', ${JSON.stringify(appData)});
      return app.getPath('appData');
    })()`, returnByValue: true })
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails))
    assert.equal(result.result.value, appData)
    await send('Debugger.resume')
  } finally { socket.close() }
}

test('packaged default startup restores essential data across profile keys once, then cleans runtime after readiness', { timeout: 180_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-essential-migration-e2e-'))
  const appData = join(root, 'Roaming'), localAppData = join(root, 'Local')
  const legacy = join(appData, 'zerowall-science')
  const userData = join(localAppData, 'zerowall-science')
  const candidate = 'harness/profiles/zerowall-pnpm-8b48f512-b82b-4cc7-940b-31015825c777/node_modules/unused.js'
  const put = async (path, body) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, body) }
  const key = randomBytes(32), currentKey = randomBytes(32)
  const oldEncryption = chromiumProfileEncryption(key), currentEncryption = chromiumProfileEncryption(currentKey)
  const localState = key => {
    const protectedKey = spawnSync(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command',
      'Add-Type -AssemblyName System.Security; $k=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($k,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))'],
    { input: key.toString('base64'), encoding: 'utf8', windowsHide: true })
    assert.equal(protectedKey.status, 0, 'DPAPI fixture setup failed')
    return JSON.stringify({ os_crypt: { encrypted_key: Buffer.concat([Buffer.from('DPAPI'), Buffer.from(protectedKey.stdout.trim(), 'base64')]).toString('base64') } })
  }
  await put(join(legacy, 'Local State'), localState(key))
  await put(join(userData, 'Local State'), localState(currentKey))
  const values = {
    'zerowall.ai-cloud.login': JSON.stringify({ email: 'migration-fixture@example.invalid', password: 'fixture-only', baseUrl: 'https://code.aicodeme.cn' }),
    'zerowall.ai-cloud.manual-signout': '1', // keep the isolated test entirely offline
    'zerowall.ai-cloud.group.1': 'fixture-group',
    'zerowall.environment.var.migration_fixture': 'fixture-environment',
  }
  await put(join(legacy, 'credentials/vault.json'), JSON.stringify({ version: 1, entries: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, oldEncryption.encrypt(value).toString('base64')])) }))
  await put(join(userData, 'credentials/vault.json'), JSON.stringify({ version: 1, entries: { 'zerowall.environment.var.migration_fixture': oldEncryption.encrypt('fixture-environment').toString('base64') } }))
  const sessionId = `session-${randomUUID()}`, workspaceId = randomUUID(), workspacePath = join(root, 'original-project')
  await mkdir(workspacePath)
  const events = [
    { type: 'session', version: 4, id: sessionId, createdAt: Date.now(), cwd: workspacePath, isSeeded: false, delegationDepth: 0 },
    { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
    { type: 'user/message', seq: 1, time: 2, data: { id: 'fixture-user', role: 'user', content: [{ type: 'text', text: 'Recovered conversation fixture' }], source: { kind: 'user' } }, surfaceOp: 'append' },
    { type: 'step/start', seq: 2, time: 3, data: { turn: 1, step: 1 } },
    { type: 'assistant/message', seq: 3, time: 4, data: { turn: 1, step: 1, message: { id: 'fixture-assistant', role: 'assistant', content: [{ type: 'text', text: 'Recovered answer fixture' }], source: { kind: 'model', provider: 'mock', model: 'mock' } }, stream: [
      { type: 'chunk', time: 3, chunk: { type: 'block-start', index: 0, blockType: 'text' } },
      { type: 'text-chunks', time0: 3, index: 0, dt: [], texts: ['Recovered answer fixture'] },
      { type: 'chunk', time: 4, chunk: { type: 'block-end', index: 0, block: { type: 'text', text: 'Recovered answer fixture' } } },
      { type: 'chunk', time: 4, chunk: { type: 'finish', reason: { kind: 'stop' } } },
    ] }, surfaceOp: 'append' },
    { type: 'step/end', seq: 4, time: 5, data: { turn: 1, step: 1 } },
    { type: 'turn/end', seq: 5, time: 6, data: { turn: 1, reason: { kind: 'completed' } } },
  ]
  // Header discovery uses the cwd stored in the file; no user content is parsed
  // by the migration itself and the original log is copied byte for byte.
  const projectKey = `--${workspacePath.replace(/[\\/:]+/gu, '-').replace(/^-+/u, '')}--`
  const sessionFile = `harness/sessions/${projectKey}/${sessionId}/session.v4.jsonl`
  const preserved = [sessionFile, 'credentials/vault.json', 'harness/attachments/old.png', 'harness/profiles/web/cordis.patch.yml', 'harness/storages/workspace.json']
  await put(join(legacy, sessionFile), events.map(event => JSON.stringify(event)).join('\n') + '\n')
  await put(join(legacy, 'harness/attachments/old.png'), 'fixture attachment bytes')
  await put(join(legacy, 'harness/profiles/web/cordis.patch.yml'), '- id: ui-theme\n  name: "@deepseek-ai/dsh-client-ui-theme"\n  config:\n    preference: dark\n')
  await put(join(legacy, 'harness/storages/workspace.json'), JSON.stringify({ unit: { name: 'workspace', version: 2 }, global: { initialized: true, workspaceIds: [workspaceId], archivedSessionIds: [], pinnedSessionIds: [] },
    tables: { workspaces: { [workspaceId]: { path: workspacePath, title: 'Recovered workspace fixture', sessionIds: [sessionId], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } } } }))
  const sourceBytes = Object.fromEntries(await Promise.all(preserved.map(async path => [path, await readFile(join(legacy, path), 'utf8')])))
  for (const path of ['Cache/entry', candidate]) await put(join(legacy, path), 'obsolete runtime')
  await mkdir(localAppData, { recursive: true })
  await put(join(localAppData, 'ZeroWall Science/python-location.json'), JSON.stringify({ runtimeRoot: join(root, 'Python'), source: 'user-selected' }))
  const packaged = await locatePackagedApp(resolve(import.meta.dirname, '..'))
  const env = { ...process.env, APPDATA: appData, LOCALAPPDATA: localAppData, USERPROFILE: root, HOME: root }
  delete env.ZEROWALL_USER_DATA_DIR
  delete env.DSH_HOME
  delete env.ELECTRON_RUN_AS_NODE
  const start = () => spawn(packaged.executablePath, ['--inspect-brk=0', '--remote-debugging-port=0', `--user-data-dir=${join(root, 'chromium')}`], {
    cwd: packaged.root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
  let child = start()
  let output = ''
  const capture = chunk => { output = (output + String(chunk)).slice(-30_000) }
  child.stdout.on('data', capture); child.stderr.on('data', capture)
  let browser
  const evidence = join(contract.verification, 'essential-recovery')
  await mkdir(evidence, { recursive: true })
  try {
    const waitEndpoint = async pattern => {
      const deadline = Date.now() + 30_000
      while (Date.now() < deadline) {
        const match = pattern.exec(output)
        if (match) return match[1]
        if (child.exitCode !== null) throw new Error(`Packaged process exited: ${child.exitCode}`)
        await delay(50)
      }
      throw new Error('Packaged debugger endpoint timed out')
    }
    await bindKnownFolder(await waitEndpoint(/Debugger listening on (ws:\/\/[^\s]+)/u), appData)
    const startedAt = Date.now()
    browser = await chromium.connectOverCDP(await waitEndpoint(/DevTools listening on (ws:\/\/[^\s]+)/u))
    let startup, page, cleanedBeforeReady = false
    const deadline = Date.now() + 100_000
    while (Date.now() < deadline) {
      page = browser.contexts()[0]?.pages().find(page => page.url().startsWith('http://127.0.0.1:'))
      startup = await page?.evaluate(() => window.zerowallDesktop?.getStartupStatus()).catch(() => undefined)
      if (startup?.phase === 'failed') throw new Error(`Workbench failed: ${startup.message}`)
      if (startup?.phase === 'ready') break
      if (!await access(join(legacy, 'Cache/entry')).then(() => true, () => false)) cleanedBeforeReady = true
      await delay(100)
    }
    assert.equal(startup?.phase, 'ready')
    assert.equal(cleanedBeforeReady, false)
    const elapsedMs = Date.now() - startedAt
    const cleanupDeadline = Date.now() + 30_000
    while (Date.now() < cleanupDeadline && await access(join(legacy, candidate)).then(() => true, () => false)) await delay(100)
    await assert.rejects(access(join(legacy, candidate)))
    await assert.rejects(access(join(legacy, 'Cache/entry')))
    const receipt = JSON.parse(await readFile(join(userData, '.migration/essential-user-data-v1/completed.json'), 'utf8'))
    assert.equal(receipt.state, 'completed')
    for (const path of preserved) {
      assert.equal(await readFile(join(legacy, path), 'utf8'), sourceBytes[path])
      await access(join(userData, path))
    }
    assert.equal(await readFile(join(userData, sessionFile), 'utf8'), sourceBytes[sessionFile])
    const targetEncryption = await openWindowsProfileEncryption(userData)
    const restoredVault = JSON.parse(await readFile(join(userData, 'credentials/vault.json'), 'utf8'))
    for (const [key, value] of Object.entries(values)) assert.equal(targetEncryption.decrypt(Buffer.from(restoredVault.entries[key], 'base64')), value)
    targetEncryption.dispose()
    const rpc = (method, args) => page.evaluate(async ({ method, args }) => {
      const response = await fetch(`/api/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args } }) })
      const envelope = await response.json()
      if (!response.ok || !envelope.result?.ok) throw new Error('Recovered history RPC failed')
      return envelope.result.value
    }, { method, args })
    const sessions = await rpc('session/list', { _request: {} })
    const restoredSession = sessions.items.find(item => item.sessionId === sessionId)
    assert.ok(restoredSession, 'Restored conversation was not exposed by the Host')
    assert.equal(restoredSession.blank, false)
    await page.screenshot({ path: join(evidence, 'workbench-ready.png') })
    const log = await readFile(join(userData, 'logs/startup.log'), 'utf8')
    assert.ok(!log.includes('正在检查用户数据'))
    await writeFile(join(evidence, 'startup.log'), log)
    // Reopen the same healthy profile to separate first-run plugin
    // materialization from normal launch latency.
    const firstExit = once(child, 'exit')
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    else child.kill()
    await firstExit
    await browser.close()
    output = ''
    child = start()
    child.stdout.on('data', capture); child.stderr.on('data', capture)
    await bindKnownFolder(await waitEndpoint(/Debugger listening on (ws:\/\/[^\s]+)/u), appData)
    const warmStartedAt = Date.now()
    browser = await chromium.connectOverCDP(await waitEndpoint(/DevTools listening on (ws:\/\/[^\s]+)/u))
    let warmStartup
    const warmDeadline = Date.now() + 60_000
    while (Date.now() < warmDeadline) {
      const warmPage = browser.contexts()[0]?.pages().find(page => page.url().startsWith('http://127.0.0.1:'))
      warmStartup = await warmPage?.evaluate(() => window.zerowallDesktop?.getStartupStatus()).catch(() => undefined)
      if (warmStartup?.phase === 'failed') throw new Error(`Healthy profile failed: ${warmStartup.message}`)
      if (warmStartup?.phase === 'ready') break
      await delay(100)
    }
    assert.equal(warmStartup?.phase, 'ready')
    const warmElapsedMs = Date.now() - warmStartedAt
    const warmLog = (await readFile(join(userData, 'logs/startup.log'), 'utf8')).slice(log.length)
    assert.ok(!warmLog.includes('profile-prepare:materialized'))
    await writeFile(join(evidence, 'warm-startup.log'), warmLog)
    await writeFile(join(evidence, 'legacy-startup.json'), JSON.stringify({ buildId: contract.buildId, passed: true, elapsedMs, warmElapsedMs, warmProfileReused: true,
      defaultLocalAppData: true, explicitUserDataOverride: false, osKnownFolderIsolatedWithInspector: true,
      cleanedBeforeReady, essentialDataRestored: true, differentProfileKeysVerified: true, credentialsDecryptable: true, historyVisibleToHost: true,
      recoveryMs: receipt.elapsedMs, legacyUserDataPreserved: true, runtimeDeletedAfterReady: true }, null, 2))
    assert.ok(output.includes('already-completed'), 'Healthy restart reran recovery')
    console.log(`Default startup: first ${elapsedMs} ms, healthy profile ${warmElapsedMs} ms; essential recovery ${receipt.elapsedMs} ms; credentials and history verified.`)
  } catch (error) {
    await writeFile(join(evidence, 'failed-process.log'), output.replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]'))
    const hostLog = await readFile(join(userData, 'logs/harness.log'), 'utf8').catch(() => '')
    await writeFile(join(evidence, 'failed-fixture-host.log'), hostLog.replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]'))
    throw error
  } finally {
    if (child.exitCode === null && child.pid) {
      const exited = once(child, 'exit')
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      else child.kill()
      await Promise.race([exited, delay(5_000)])
    }
    await browser?.close().catch(() => undefined)
    oldEncryption.dispose(); currentEncryption.dispose()
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe test cleanup path')
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
