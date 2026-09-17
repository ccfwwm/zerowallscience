import { createServer } from 'node:http'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { HarnessRuntime, type HarnessChildProcess } from '../src/main/runtime/harness-runtime.js'

async function fixture(mode: 'no-token' | 'delayed-token' | 'fatal' | 'fatal-exit' | 'invalid-html' | 'cookie-redirect') {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-readiness-'))
  const child = new EventEmitter() as HarnessChildProcess
  let killed = false
  let bareRequests = 0
  let authorizedRequests = 0
  const server = createServer((req, res) => {
    if (mode === 'cookie-redirect' && req.url?.includes('token=test-only')) {
      res.writeHead(303, { Location: '/', 'Set-Cookie': 'dsh-auth-fixture=signed; Path=/; HttpOnly; SameSite=Strict' })
      res.end()
      return
    }
    const authenticated = mode === 'cookie-redirect' ? req.headers.cookie === 'dsh-auth-fixture=signed' : req.url?.includes('token=test-only')
    if (authenticated) authorizedRequests++; else bareRequests++
    res.writeHead(authenticated ? 200 : 401, { 'Content-Type': 'text/html' })
    res.end(authenticated && mode !== 'invalid-html' ? '<script>window.__DSH_BOOT__={entries:[]}</script>' : 'Unauthorized')
  })
  const terminate = () => {
    killed = true
    Object.assign(child, { exitCode: 0 })
    child.emit('exit', 0, null)
    return true
  }
  Object.assign(child, { pid: 4242, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, kill: terminate })
  let signalSpawn!: () => void
  const spawned = new Promise<void>(resolve => { signalSpawn = resolve })
  let emitToken!: () => void
  const runtime = new HarnessRuntime({
    dshEntryPath: process.execPath, nodeExecutablePath: process.execPath, nodeEntryPath: process.execPath,
    dshPatchPath: process.execPath, runAsNode: false, bundledSkillsPath: root, userDataPath: root,
    dshHome: join(root, 'harness'), userSkillsPath: join(root, 'skills'), researchDbPath: join(root, 'db.sqlite'),
    mcpEnvironmentRoot: root, logPath: join(root, 'harness.log'), startupTimeoutMs: 900,
    terminateProcessTree: terminate,
    launchProcess: (_executable, args) => {
      const port = Number(args[args.indexOf('--port') + 1])
      emitToken = () => {
        child.stdout.push(`dsh web: http://127.0.0.1:${port}/?tok`)
        child.stdout.push('en=test-only\n')
      }
      server.listen(port, '127.0.0.1', () => {
        signalSpawn()
        if (mode === 'fatal' || mode === 'fatal-exit') child.emit('message', { type: 'zerowall:host:failed', message: 'ssh_ops_profiles: defaultProjectPath null' })
        if (mode === 'fatal-exit') {
          Object.assign(child, { exitCode: 1 })
          child.emit('exit', 1, null)
        }
        if (mode === 'invalid-html' || mode === 'cookie-redirect') emitToken()
      })
      return child
    },
    onChanged: () => undefined,
  })
  const launch = () => runtime.start(join(root, 'workspace'))
  return { runtime, launch, spawned, emitToken: () => emitToken(), killed: () => killed, requests: () => ({ bareRequests, authorizedRequests }), cleanup: async () => {
    await runtime.stop()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } }
}

it('does not accept an unauthenticated listener as ready and bounds token waiting', async () => {
  const f = await fixture('no-token')
  try {
    await f.launch()
    expect(f.runtime.snapshot().phase).toBe('failed')
    expect(f.runtime.snapshot().message).toContain('启动超时')
    expect(f.killed()).toBe(true)
    expect(f.requests().bareRequests).toBe(0)
  } finally { await f.cleanup() }
})

it('waits for the authenticated boot document and coalesces concurrent starts', async () => {
  const f = await fixture('delayed-token')
  try {
    const pending = f.launch()
    expect(f.launch()).toBe(pending)
    await f.spawned
    expect(f.runtime.snapshot().phase).toBe('starting')
    f.emitToken()
    await pending
    expect(f.runtime.snapshot().phase).toBe('ready')
    expect(f.requests().authorizedRequests).toBeGreaterThan(0)
    expect(f.runtime.snapshot().logs.join('\n')).not.toContain('test-only')
  } finally { await f.cleanup() }
})

it('does not accept a 200 error page without a client boot graph', async () => {
  const f = await fixture('invalid-html')
  try { await f.launch(); expect(f.runtime.snapshot().phase).toBe('failed') }
  finally { await f.cleanup() }
})

it('follows the DSH 303 exchange with its session cookie before checking the boot graph', async () => {
  const f = await fixture('cookie-redirect')
  try {
    await f.launch()
    expect(f.runtime.snapshot().phase).toBe('ready')
    expect(f.requests().authorizedRequests).toBeGreaterThan(0)
  } finally { await f.cleanup() }
})

it('preserves the plugin failure and terminates a Host that remains alive', async () => {
  const f = await fixture('fatal')
  try {
    await f.launch()
    expect(f.runtime.snapshot().phase).toBe('failed')
    expect(f.runtime.snapshot().message).toContain('defaultProjectPath null')
    expect(f.killed()).toBe(true)
  } finally { await f.cleanup() }
})

it('retains the reported root cause when the Host exits before readiness polling resumes', async () => {
  const f = await fixture('fatal-exit')
  try {
    await f.launch()
    expect(f.runtime.snapshot().phase).toBe('failed')
    expect(f.runtime.snapshot().message).toContain('defaultProjectPath null')
    expect(f.runtime.snapshot().message).not.toContain('stopped unexpectedly')
  } finally { await f.cleanup() }
})
