import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { HarnessChildProcess } from '../src/main/runtime/harness-runtime.js'
import { describe, expect, it } from 'vitest'
import { HarnessRuntime, buildHarnessArguments, buildHarnessSpawnOptions } from '../src/main/runtime/harness-runtime.js'

describe('Harness runtime boundary', () => {
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
      bundledSkillsPath: 'C:/app/resources/skills',
      mcpEnvironmentRoot: 'C:/data/mcp-environments',
      runAsNode: true,
      runtimeAnchorPath: 'C:/app/resources/app.asar/node_modules/@deepseek-ai/dsh/package.json',
    }, { ELECTRON_RUN_AS_NODE: '1', Path: 'C:/Windows', ZEROWALL_DISABLE_DEFAULT_MCP: '1', OPENCODE_API_KEY: 'test-key-reference' })
    expect(options.env?.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(options.env?.NODE_PATH).toBe('C:/app/resources/app.asar/node_modules')
    expect(options.env?.ZEROWALL_RUNTIME_ANCHOR).toContain('app.asar/node_modules/@deepseek-ai/dsh/package.json')
    expect(options.env?.DSH_HOME).toBe('C:/data/harness')
    expect(options.env?.ZEROWALL_USER_DATA_DIR).toBe('C:/data')
    expect(options.env?.DSH_BUNDLED_SKILL_DIR).toBe('C:/app/resources/skills')
    expect(options.env?.ZEROWALL_USER_SKILLS).toBe('C:/data/harness/zerowall-skills/enabled')
    expect(options.env?.ZEROWALL_RESEARCH_DB).toBe('C:/data/research/zerowall-research.sqlite')
    expect(options.env?.ZEROWALL_MCP_ENVIRONMENT_ROOT).toBe('C:/data/mcp-environments')
    expect(options.env?.ZEROWALL_DISABLE_DEFAULT_MCP).toBe('1')
    expect(options.env?.OPENCODE_API_KEY).toBe('test-key-reference')
    expect(options.env?.ZEROWALL_BUNDLED_SKILLS).toBe('C:/app/resources/skills')
    expect(options.env?.ZEROWALL_MCP_BUNDLED_SKILLS).toBe('C:/app/resources/skills')
    expect(options.env?.ZEROWALL_MCP_USER_SKILLS).toBe('C:/data/harness/zerowall-skills/enabled')
    expect(options.env?.ZEROWALL_MCP_SKILLS).toContain('C:/app/resources/skills')
    expect(options.env?.ZEROWALL_MCP_SKILLS).toContain('C:/data/harness/zerowall-skills/enabled')
    expect(options.stdio).toEqual(['pipe', 'pipe', 'pipe', 'ipc'])
  })

  it('creates a fresh workspace before spawning the packaged Host', async () => {
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
      bundledSkillsPath: root,
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
    expect(await readFile(join(root, 'logs', 'harness.log'), 'utf8')).toContain('Harness could not start: test stop')
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
      terminateProcessTree: (_pid, force) => terminations.push(force),
      shutdownGracePeriodMs: 5,
      shutdownForcePeriodMs: 5,
      onChanged: () => undefined,
    })

    const start = runtime.start(join(root, 'workspace'))
    await launched
    await runtime.stop()
    child.emit('exit', 0, null)
    await start

    if (process.platform === 'win32') expect(terminations).toEqual([false, true])
  })
})
