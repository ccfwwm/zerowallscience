import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { access, mkdtemp as createTemporaryDirectory, rm, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import type { HarnessChildProcess } from '../src/main/runtime/harness-runtime.js'
import { afterEach, describe, expect, it } from 'vitest'
import { HarnessRuntime, buildHarnessArguments, buildHarnessSpawnOptions } from '../src/main/runtime/harness-runtime.js'

const temporaryDirectories: string[] = []
async function mkdtemp(prefix: string) {
  const directory = await createTemporaryDirectory(prefix)
  temporaryDirectories.push(directory)
  return directory
}
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true, maxRetries: 3 })))
})

describe('Harness runtime boundary', () => {
  it.each(['EACCES', 'EADDRINUSE', 'new-profile'])('starts with an OS-assigned Host port after %s', async code => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-port-recovery-'))
    const files = { dshEntryPath: join(root, 'dsh.js'), nodeExecutablePath: process.execPath, nodeEntryPath: join(root, 'bootstrap.mjs'), dshPatchPath: join(root, 'patch.yml'), runAsNode: false }
    await Promise.all([files.dshEntryPath, files.nodeEntryPath, files.dshPatchPath].map(path => writeFile(path, '')))
    const portPath = join(root, 'port')
    if (code !== 'new-profile') await writeFile(portPath, '55191\n')
    const server = createServer((_req, res) => res.end('__DSH_BOOT__'))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    const ports: string[] = [], phases: string[] = []
    const runtime = new HarnessRuntime({ ...files, portPath, dshHome: root, userDataPath: root, userSkillsPath: root, researchDbPath: join(root, 'research.db'), bundledSkillsPath: root, mcpEnvironmentRoot: root, logPath: join(root, 'harness.log'), startupTimeoutMs: 3000, onChanged: snapshot => phases.push(snapshot.phase), launchProcess: (_exe, args) => {
      const child = new EventEmitter() as HarnessChildProcess
      Object.assign(child, { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, kill: () => { Object.assign(child, { exitCode: 0 }); child.emit('exit', 0, null); return true } })
      const port = args[args.indexOf('--port') + 1]!; ports.push(port)
      queueMicrotask(() => {
        if (ports.length === 1 && code !== 'new-profile') child.emit('message', { type: 'zerowall:host:failed', message: 'webserver failed', listenError: code })
        else (child.stdout as PassThrough).write(`dsh web: http://127.0.0.1:${address.port}/?token=fixture\n`)
      })
      return child
    } })
    try {
      await runtime.start(root)
      expect(ports).toEqual(code === 'new-profile' ? ['0'] : ['55191', '0'])
      expect(phases).not.toContain('failed')
      expect(runtime.snapshot().phase).toBe('ready')
      expect(runtime.snapshot().url).toContain(`127.0.0.1:${address.port}`)
      expect((await readFile(portPath, 'utf8')).trim()).toBe(String(address.port))
    } finally { await runtime.stop(); await new Promise<void>(resolve => server.close(() => resolve())) }
  })
  it('keeps ordinary plugin boot failures actionable without a port retry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-plugin-failure-'))
    const files = { dshEntryPath: join(root, 'dsh.js'), nodeExecutablePath: process.execPath, nodeEntryPath: join(root, 'bootstrap.mjs'), dshPatchPath: join(root, 'patch.yml'), runAsNode: false }
    await Promise.all([files.dshEntryPath, files.nodeEntryPath, files.dshPatchPath].map(path => writeFile(path, '')))
    let launches = 0
    const runtime = new HarnessRuntime({ ...files, dshHome: root, userDataPath: root, userSkillsPath: root, researchDbPath: join(root, 'research.db'), bundledSkillsPath: root, mcpEnvironmentRoot: root, logPath: join(root, 'harness.log'), onChanged: () => {}, launchProcess: () => {
      launches++
      const child = new EventEmitter() as HarnessChildProcess
      Object.assign(child, { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, kill: () => { Object.assign(child, { exitCode: 0 }); child.emit('exit', 0, null); return true } })
      queueMicrotask(() => child.emit('message', { type: 'zerowall:host:failed', message: 'invalid plugin schema' }))
      return child
    } })
    try {
      await runtime.start(root)
      expect(launches).toBe(1)
      expect(runtime.snapshot()).toMatchObject({ phase: 'failed', message: '核心服务启动失败：invalid plugin schema' })
    } finally { await runtime.stop() }
  })
  it('binds the Host to an explicit loopback port and patch', () => {
    expect(buildHarnessArguments(43127, 'zerowall.patch.yml')).toEqual([
      'web', '--patch', 'zerowall.patch.yml', '--host', '127.0.0.1', '--port', '43127', '--no-open',
    ])
  })

  it('uses separate DSH and research storage and enables packaged Electron Node mode', () => {
    const options = buildHarnessSpawnOptions('C:/workspace', {
      dshEntryPath: 'C:/app/resources/app.asar/node_modules/@deepseek-ai/dsh/lib/bin.js',
      runtimeModulesPath: 'C:/app/resources/app.asar/node_modules',
      userDataPath: 'C:/data',
      dshHome: 'C:/data/harness',
      userSkillsPath: 'C:/data/harness/zerowall-skills/enabled',
      researchDbPath: 'C:/data/research/zerowall-research.sqlite',
      bundledSkillsPath: 'C:/app/resources/extensions/skills',
      mcpEnvironmentRoot: 'C:/data/mcp-environments',
      runAsNode: true,
      runtimeAnchorPath: 'C:/app/resources/app.asar/node_modules/@deepseek-ai/dsh/package.json',
    }, { ELECTRON_RUN_AS_NODE: '1', Path: 'C:/Windows', ZEROWALL_DISABLE_DEFAULT_MCP: '1', CUSTOM_API_KEY: 'test-key-reference' })
    expect(options.env?.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(options.env?.NODE_PATH).toBe('C:/app/resources/app.asar/node_modules')
    expect(options.env?.ZEROWALL_RUNTIME_ANCHOR).toContain('app.asar/node_modules/@deepseek-ai/dsh/package.json')
    expect(options.env?.DSH_HOME).toBe('C:/data/harness')
    expect(options.env?.ZEROWALL_USER_DATA_DIR).toBe('C:/data')
    expect(options.env?.DSH_BUNDLED_SKILL_DIR).toBe('C:/app/resources/extensions/skills')
    expect(options.env?.ZEROWALL_USER_SKILLS).toBe('C:/data/harness/zerowall-skills/enabled')
    expect(options.env?.ZEROWALL_RESEARCH_DB).toBe('C:/data/research/zerowall-research.sqlite')
    expect(options.env?.ZEROWALL_MCP_ENVIRONMENT_ROOT).toBe('C:/data/mcp-environments')
    expect(options.env?.ZEROWALL_PYTHON_ROOT).toBe('C:/data/mcp-environments')
    expect(options.env?.ZEROWALL_DISABLE_DEFAULT_MCP).toBe('1')
    expect(options.env?.CUSTOM_API_KEY).toBe('test-key-reference')
    expect(options.env?.ZEROWALL_BUNDLED_SKILLS).toBe('C:/app/resources/extensions/skills')
    expect(options.env?.ZEROWALL_MCP_BUNDLED_SKILLS).toBe('C:/app/resources/extensions/skills')
    expect(options.env?.ZEROWALL_MCP_USER_SKILLS).toBe('C:/data/harness/zerowall-skills/enabled')
    expect(options.env?.ZEROWALL_MCP_SKILLS).toContain('C:/app/resources/extensions/skills')
    expect(options.env?.ZEROWALL_MCP_SKILLS).toContain('C:/data/harness/zerowall-skills/enabled')
    expect(options.stdio).toEqual(['pipe', 'pipe', 'pipe', 'ipc'])
  })

  it('starts the Core Host without an optional bundled Skills directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-harness-runtime-'))
    const launchDirectory = join(root, 'new', 'workspace')
    const files = {
      dshEntryPath: join(root, 'dsh.js'),
      nodeExecutablePath: process.execPath,
      nodeEntryPath: join(root, 'bootstrap.mjs'),
      dshPatchPath: join(root, 'zerowall.patch.yml'),
      runAsNode: false,
    }
    await Promise.all([
      writeFile(files.dshEntryPath, ''),
      writeFile(files.nodeEntryPath, ''),
      writeFile(files.dshPatchPath, ''),
    ])

    let spawnCwd: string | undefined
    const runtime = new HarnessRuntime({
      ...files,
      dshHome: join(root, 'harness'),
      userDataPath: root,
      userSkillsPath: join(root, 'harness', 'zerowall-skills', 'enabled'),
      researchDbPath: join(root, 'research', 'zerowall-research.sqlite'),
      bundledSkillsPath: join(root, 'extensions', 'skills'),
      mcpEnvironmentRoot: join(root, 'mcp-environments'),
      logPath: join(root, 'logs', 'harness.log'),
      launchProcess: (_executable, _args, options) => {
        spawnCwd = options.cwd?.toString()
        const child = new EventEmitter() as HarnessChildProcess
        Object.assign(child, {
          stdin: new PassThrough(),
          stdout: new PassThrough(),
          stderr: new PassThrough(),
          exitCode: null,
          kill: () => true,
        })
        queueMicrotask(() => child.emit('error', new Error('test stop')))
        return child
      },
      onChanged: () => undefined,
    })

    await runtime.start(launchDirectory)

    await expect(access(launchDirectory)).resolves.toBeUndefined()
    expect(spawnCwd).toBe(launchDirectory)
    const log = await readFile(join(root, 'logs', 'harness.log'), 'utf8')
    expect(log).toContain('optional bundled Skills are not installed; continuing with Core')
    expect(log).toContain('Harness could not start: test stop')
    await runtime.stop()
  })

  it('bounds shutdown and force-terminates the Windows Host tree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-harness-stop-'))
    const files = {
      dshEntryPath: join(root, 'dsh.js'),
      nodeExecutablePath: process.execPath,
      nodeEntryPath: join(root, 'bootstrap.mjs'),
      dshPatchPath: join(root, 'zerowall.patch.yml'),
      runAsNode: false,
    }
    await Promise.all(Object.values(files).filter((value): value is string => typeof value === 'string' && value !== process.execPath).map((value) => writeFile(value, '')))
    const terminations: boolean[] = []
    let releaseRenderer!: () => void
    let beginRendererStop!: () => void
    const rendererStopped = new Promise<void>(resolve => { releaseRenderer = resolve })
    const rendererStopping = new Promise<void>(resolve => { beginRendererStop = resolve })
    let unmounted = false
    const child = new EventEmitter() as HarnessChildProcess
    Object.assign(child, {
      pid: 4242,
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exitCode: null,
      kill: () => true,
    })
    let markLaunched: (() => void) | undefined
    const launched = new Promise<void>((resolve) => { markLaunched = resolve })
    const runtime = new HarnessRuntime({
      ...files,
      dshHome: join(root, 'harness'),
      userDataPath: root,
      userSkillsPath: join(root, 'harness', 'zerowall-skills', 'enabled'),
      researchDbPath: join(root, 'research', 'zerowall-research.sqlite'),
      bundledSkillsPath: root,
      mcpEnvironmentRoot: join(root, 'mcp-environments'),
      logPath: join(root, 'logs', 'harness.log'),
      launchProcess: () => {
        markLaunched?.()
        return child
      },
      onBeforeStop: async () => {
        beginRendererStop()
        await rendererStopped
        unmounted = true
      },
      terminateProcessTree: (_pid, force) => {
        expect(unmounted).toBe(true)
        terminations.push(force)
      },
      shutdownGracePeriodMs: 5,
      shutdownForcePeriodMs: 5,
      onChanged: () => undefined,
    })

    const start = runtime.start(join(root, 'workspace'))
    await launched
    const stop = runtime.stop()
    await rendererStopping
    expect(terminations).toEqual([])
    releaseRenderer()
    await stop
    child.emit('exit', 0, null)
    await start

    if (process.platform === 'win32') expect(terminations).toEqual([false, true])
  })
})
