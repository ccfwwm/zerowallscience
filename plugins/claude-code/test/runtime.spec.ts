import { randomUUID } from 'node:crypto'
import * as nodeFs from 'node:fs/promises'
import { chmod, mkdtemp, readFile, rm, writeFile, mkdir, stat, symlink, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CLAUDE_CODE_PACKAGE,
  CLAUDE_CODE_REGISTRY,
  CLAUDE_CODE_VERSION,
  createClaudeRuntimeManager,
  resolveBundledPnpmRuntime,
  type ProcessRunner,
  type ProcessRunResult,
} from '../src/host/runtime.js'

const temporaryDirectories: string[] = []

async function makeDataDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'zerowall-claude-runtime-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

function installFixture(runResult: { code: number } = { code: 0 }, healthResult: ProcessRunResult = { code: 0, stdout: `${CLAUDE_CODE_VERSION} (Claude Code)\n` }, native = false): { run: ProcessRunner; calls: Array<{ command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv }> } {
  const calls: Array<{ command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv }> = []
  const run: ProcessRunner = async (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd, env: options.env })
    if (args.includes('--version')) return healthResult
    if (runResult.code !== 0) return runResult
    const packageRoot = join(options.cwd, 'node_modules', '@anthropic-ai', 'claude-code')
    await mkdir(join(packageRoot, 'bin'), { recursive: true })
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
      name: CLAUDE_CODE_PACKAGE,
      version: CLAUDE_CODE_VERSION,
      bin: { claude: native ? './bin/claude.exe' : './bin/claude.js' },
    }))
    await writeFile(join(packageRoot, 'bin', native ? 'claude.exe' : 'claude.js'), '#!/usr/bin/env node\n')
    return runResult
  }
  return { run, calls }
}

describe('Claude Code private runtime manager', () => {
  it('resolves only the app-bundled pnpm paths and never falls back to PATH', () => {
    const exists = vi.fn((path: string) => path === resolve('app', 'commands', 'pnpm', 'bin', 'pnpm.cjs'))
    expect(resolveBundledPnpmRuntime({
      electron: true,
      resourcesPath: 'app',
      executable: 'C:/ZeroWall/zerowall.exe',
      existsSync: exists,
    })).toEqual({
      executable: resolve('C:/ZeroWall/zerowall.exe'),
      pnpmPath: resolve('app', 'commands', 'pnpm', 'bin', 'pnpm.cjs'),
    })
    expect(() => resolveBundledPnpmRuntime({ electron: true, resourcesPath: 'app', existsSync: () => false }))
      .toThrow(/bundled pnpm is unavailable/u)
  })

  it('installs the exact package through pinned bundled pnpm in plugin-owned paths', async () => {
    const dataDir = await makeDataDirectory()
    const userConfig = join(dataDir, 'sentinel-user-claude-config')
    await writeFile(userConfig, 'leave this file unchanged')
    const { run, calls } = installFixture()
    const manager = createClaudeRuntimeManager({
      dataDir: join(dataDir, 'plugin-runtime'),
      platform: 'linux',
      pnpm: { executable: resolve('bundled-node'), pnpmPath: resolve('bundled-pnpm.cjs') },
      run,
      env: {
        HOME: dataDir,
        CLAUDE_CONFIG_DIR: userConfig,
        ANTHROPIC_API_KEY: 'ambient-secret',
        OPENAI_API_KEY: 'ambient-openai-secret',
        AWS_SECRET_ACCESS_KEY: 'ambient-aws-secret',
        GH_TOKEN: 'ambient-github-token',
        NODE_OPTIONS: '--require=ambient-hook',
        XDG_CONFIG_HOME: join(dataDir, 'user-xdg-config'),
        npm_config_userconfig: join(dataDir, 'user-npmrc'),
        PATH: 'preserved-for-installer',
        SystemRoot: 'C:/Windows',
      },
      createId: () => `candidate-${calls.length}`,
    })

    const installed = await manager.installOrUpdate()
    expect(installed).toMatchObject({ installed: true, version: CLAUDE_CODE_VERSION })
    expect(installed.executablePath).toBe(join(calls[0]!.cwd, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.js'))
    expect(calls[0]?.command).toBe(resolve('bundled-node'))
    expect(calls[0]?.args).toContain(resolve('bundled-pnpm.cjs'))
    expect(calls[0]?.args).toContain(`--registry=${CLAUDE_CODE_REGISTRY}`)
    expect(calls[0]?.args).toContain(`--store-dir=${join(dataDir, 'plugin-runtime', 'pnpm-store')}`)
    expect(calls[0]?.cwd).toContain(join(dataDir, 'plugin-runtime', 'versions'))
    expect(calls[0]?.env.HOME).toBe(join(dataDir, 'plugin-runtime', 'home'))
    expect(calls[0]?.env.CLAUDE_CONFIG_DIR).toBe(join(dataDir, 'plugin-runtime', 'config'))
    expect(calls[0]?.env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(calls[0]?.env.OPENAI_API_KEY).toBeUndefined()
    expect(calls[0]?.env.AWS_SECRET_ACCESS_KEY).toBeUndefined()
    expect(calls[0]?.env.GH_TOKEN).toBeUndefined()
    expect(calls[0]?.env.NODE_OPTIONS).toBeUndefined()
    expect(calls[0]?.env.XDG_CONFIG_HOME).toBe(join(dataDir, 'plugin-runtime', 'xdg-config'))
    expect(calls[0]?.env.npm_config_userconfig).toBe(join(calls[0]!.cwd, '.npmrc'))
    expect(calls[0]?.env.PATH).toBe('preserved-for-installer')
    const generatedManifest = JSON.parse(await readFile(join(calls[0]!.cwd, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
    expect(generatedManifest.dependencies).toEqual({ [CLAUDE_CODE_PACKAGE]: CLAUDE_CODE_VERSION })
    expect(await readFile(join(calls[0]!.cwd, 'pnpm-workspace.yaml'), 'utf8')).toBe([
      'packages: []',
      'strictDepBuilds: true',
      'allowBuilds:',
      `  '${CLAUDE_CODE_PACKAGE}@${CLAUDE_CODE_VERSION}': true`,
      '',
    ].join('\n'))
    expect(calls[0]?.args).not.toContain('--ignore-workspace')
    expect(calls[1]?.command).toBe(resolve('bundled-node'))
    expect(calls[1]?.args).toEqual([installed.executablePath, '--version'])
    expect(calls[1]?.env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(await readFile(userConfig, 'utf8')).toBe('leave this file unchanged')
  })

  it('keeps the previous active install when an update fails, then supports rollback after a successful update', async () => {
    const dataDir = await makeDataDirectory()
    let shouldFail = false
    const calls: string[] = []
    const run: ProcessRunner = async (_command, args, options) => {
      if (args.includes('--version')) return { code: 0, stdout: `${CLAUDE_CODE_VERSION} (Claude Code)` }
      calls.push(options.cwd)
      if (shouldFail) return { code: 1, stderr: 'redacted details' }
      const packageRoot = join(options.cwd, 'node_modules', '@anthropic-ai', 'claude-code')
      await mkdir(join(packageRoot, 'bin'), { recursive: true })
      await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: CLAUDE_CODE_PACKAGE, version: CLAUDE_CODE_VERSION, bin: { claude: 'bin/claude.js' } }))
      await writeFile(join(packageRoot, 'bin', 'claude.js'), 'fixture')
      return { code: 0 }
    }
    let serial = 0
    const manager = createClaudeRuntimeManager({
      dataDir: join(dataDir, 'plugin-runtime'),
      platform: 'linux',
      pnpm: { executable: resolve('bundled-node'), pnpmPath: resolve('bundled-pnpm.cjs') },
      run,
      createId: () => `generation-${serial++}`,
    })
    const first = await manager.installOrUpdate()
    shouldFail = true
    await expect(manager.installOrUpdate()).rejects.toThrow('Claude Code installation failed')
    expect(await manager.status()).toEqual(first)
    expect(await readFile(join(dataDir, 'plugin-runtime', 'current.json'), 'utf8')).toContain('generation-0')

    shouldFail = false
    const second = await manager.installOrUpdate()
    expect(second.executablePath).not.toBe(first.executablePath)
    expect(second.previousVersion).toBe(CLAUDE_CODE_VERSION)
    const restored = await manager.rollback()
    expect(restored.executablePath).toBe(first.executablePath)
    expect(await manager.getExecutablePath()).toBe(first.executablePath)
    expect(calls).toHaveLength(3)
  })

  it.each([
    { code: 1, stdout: `${CLAUDE_CODE_VERSION} (Claude Code)` },
    { code: 0, stdout: '2.1.308 (Claude Code)' },
    { code: 0, stdout: 'Native package missing; please reinstall Claude Code.' },
    { code: 0, stdout: `${CLAUDE_CODE_VERSION} (Claude Code)\nunexpected output` },
    { code: 0 },
  ])('keeps the active generation when candidate version health fails: %j', async (healthResult) => {
    const dataDir = await makeDataDirectory()
    let healthy = true
    const good = installFixture()
    const bad = installFixture({ code: 0 }, healthResult)
    const manager = createClaudeRuntimeManager({
      dataDir: join(dataDir, 'plugin-runtime'),
      platform: 'linux',
      pnpm: { executable: resolve('bundled-node'), pnpmPath: resolve('bundled-pnpm.cjs') },
      run: (command, args, options) => (healthy ? good.run : bad.run)(command, args, options),
    })
    const first = await manager.installOrUpdate()
    const priorState = await readFile(join(dataDir, 'plugin-runtime', 'current.json'), 'utf8')
    healthy = false
    await expect(manager.installOrUpdate()).rejects.toThrow('pinned version health check')
    expect(await manager.status()).toEqual(first)
    expect(await readFile(join(dataDir, 'plugin-runtime', 'current.json'), 'utf8')).toBe(priorState)
    await expect(stat(bad.calls[0]!.cwd)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('probes a native candidate directly before activation', async () => {
    const dataDir = await makeDataDirectory()
    const { run, calls } = installFixture({ code: 0 }, { code: 0, stdout: `${CLAUDE_CODE_VERSION} (Claude Code)` }, true)
    const manager = createClaudeRuntimeManager({
      dataDir: join(dataDir, 'native-runtime'),
      platform: 'win32',
      pnpm: { executable: resolve('bundled-node'), pnpmPath: resolve('bundled-pnpm.cjs') },
      run,
    })
    const installed = await manager.installOrUpdate()
    expect(calls[1]?.command).toBe(installed.executablePath)
    expect(calls[1]?.args).toEqual(['--version'])
  })

  it('recovers a complete lock only when its owner is confirmed dead', async () => {
    const dataDir = await makeDataDirectory()
    const lockPath = join(dataDir, 'runtime.lock')
    const owner = { schema: 1, pid: 2147483647, nonce: randomUUID() }
    await writeFile(lockPath, JSON.stringify(owner))
    const probe = vi.fn(() => { throw Object.assign(new Error('dead process'), { code: 'ESRCH' }) })
    const manager = createClaudeRuntimeManager({
      dataDir,
      platform: 'linux',
      pnpm: { executable: resolve('bundled-node'), pnpmPath: resolve('bundled-pnpm.cjs') },
      run: installFixture().run,
      processProbe: probe,
    })

    expect(await manager.installOrUpdate()).toMatchObject({ installed: true, version: CLAUDE_CODE_VERSION })
    expect(probe).toHaveBeenCalledExactlyOnceWith(owner.pid)
    await expect(stat(lockPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('elects one stale-lock recoverer before unlink so a late contender cannot delete its new lock', async () => {
    const dataDir = await makeDataDirectory()
    const lockPath = join(dataDir, 'runtime.lock')
    await writeFile(lockPath, JSON.stringify({ schema: 1, pid: 2147483647, nonce: randomUUID() }))
    let resumeUnlink!: () => void
    let reachedUnlink!: () => void
    const unlinkPaused = new Promise<void>(resolve => { reachedUnlink = resolve })
    const resume = new Promise<void>(resolve => { resumeUnlink = resolve })
    let paused = false
    const fixture = installFixture()
    const common = {
      dataDir,
      platform: 'linux' as const,
      pnpm: { executable: resolve('bundled-node'), pnpmPath: resolve('bundled-pnpm.cjs') },
      processProbe: () => { throw Object.assign(new Error('dead process'), { code: 'ESRCH' }) },
    }
    const first = createClaudeRuntimeManager({
      ...common,
      run: fixture.run,
      fs: {
        ...nodeFs,
        rm: async (path, options) => {
          if (path === lockPath && !paused) {
            paused = true
            reachedUnlink()
            await resume
          }
          return nodeFs.rm(path, options)
        },
      },
    })
    const secondFixture = installFixture()
    const second = createClaudeRuntimeManager({ ...common, run: secondFixture.run })
    const installing = first.installOrUpdate()
    await unlinkPaused
    try {
      await expect(second.installOrUpdate()).rejects.toThrow('Another Claude Code runtime operation is in progress.')
      expect(secondFixture.calls).toHaveLength(0)
    } finally {
      resumeUnlink()
    }
    expect(await installing).toMatchObject({ installed: true, version: CLAUDE_CODE_VERSION })
    expect(fixture.calls).toHaveLength(2)
    await expect(stat(lockPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('recovers when an elected stale-lock recoverer also died before unlinking', async () => {
    const dataDir = await makeDataDirectory()
    const lockPath = join(dataDir, 'runtime.lock')
    const owner = { schema: 1, pid: 2147483647, nonce: randomUUID() }
    const failedRecoverer = { schema: 1, pid: 2147483646, nonce: randomUUID() }
    const claimPath = join(dataDir, `.runtime-recovery-${owner.nonce}.lock`)
    await writeFile(lockPath, JSON.stringify(owner))
    await writeFile(claimPath, JSON.stringify(failedRecoverer))
    const probe = vi.fn((_pid: number) => { throw Object.assign(new Error('dead process'), { code: 'ESRCH' }) })
    const manager = createClaudeRuntimeManager({
      dataDir,
      platform: 'linux',
      pnpm: { executable: resolve('bundled-node'), pnpmPath: resolve('bundled-pnpm.cjs') },
      run: installFixture().run,
      processProbe: probe,
    })

    expect(await manager.installOrUpdate()).toMatchObject({ installed: true, version: CLAUDE_CODE_VERSION })
    expect(probe.mock.calls.map(([pid]) => pid)).toEqual([owner.pid, failedRecoverer.pid])
    expect(await readFile(claimPath, 'utf8')).toBe(JSON.stringify(failedRecoverer))
    const replacementClaim = JSON.parse(await readFile(join(dataDir, `.runtime-recovery-${failedRecoverer.nonce}.lock`), 'utf8'))
    expect(replacementClaim).toMatchObject({ schema: 1, pid: process.pid })
    await expect(stat(lockPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each([
    { name: 'current process', pid: process.pid, code: undefined, probed: false },
    { name: 'live process', pid: 2147483647, code: undefined, probed: true },
    { name: 'permission denied', pid: 2147483647, code: 'EPERM', probed: true },
    { name: 'unrecognized probe error', pid: 2147483647, code: 'EACCES', probed: true },
  ])('preserves a lock owned by an active or unprobeable owner: $name', async ({ pid, code, probed }) => {
    const dataDir = await makeDataDirectory()
    const lockPath = join(dataDir, 'runtime.lock')
    const content = JSON.stringify({ schema: 1, pid, nonce: randomUUID() })
    await writeFile(lockPath, content)
    const probe = vi.fn(() => { if (code) throw Object.assign(new Error('probe denied'), { code }) })
    const fixture = installFixture()
    const manager = createClaudeRuntimeManager({
      dataDir,
      pnpm: { executable: resolve('bundled-node'), pnpmPath: resolve('bundled-pnpm.cjs') },
      run: fixture.run,
      processProbe: probe,
    })

    await expect(manager.installOrUpdate()).rejects.toThrow('Another Claude Code runtime operation is in progress.')
    expect(await readFile(lockPath, 'utf8')).toBe(content)
    expect(probe).toHaveBeenCalledTimes(probed ? 1 : 0)
    expect(fixture.calls).toHaveLength(0)
  })

  it.each([
    '',
    '{bad json',
    JSON.stringify({ schema: 1, pid: 0, nonce: randomUUID() }),
    JSON.stringify({ schema: 1, pid: 2147483647, nonce: 'not-a-nonce' }),
    JSON.stringify({ schema: 2, pid: 2147483647, nonce: randomUUID() }),
  ])('preserves an unrecognized lock without probing or installing: %j', async (content) => {
    const dataDir = await makeDataDirectory()
    const lockPath = join(dataDir, 'runtime.lock')
    await writeFile(lockPath, content)
    const probe = vi.fn()
    const fixture = installFixture()
    const manager = createClaudeRuntimeManager({
      dataDir,
      pnpm: { executable: resolve('bundled-node'), pnpmPath: resolve('bundled-pnpm.cjs') },
      run: fixture.run,
      processProbe: probe,
    })

    await expect(manager.installOrUpdate()).rejects.toThrow('Another Claude Code runtime operation is in progress.')
    expect(await readFile(lockPath, 'utf8')).toBe(content)
    expect(probe).not.toHaveBeenCalled()
    expect(fixture.calls).toHaveLength(0)
  })

  it.each(['nonce', 'identity'] as const)('preserves a stale lock whose $0 changes during the owner probe', async (change) => {
    const dataDir = await makeDataDirectory()
    const lockPath = join(dataDir, 'runtime.lock')
    const owner = { schema: 1, pid: 2147483647, nonce: randomUUID() }
    const original = JSON.stringify(owner)
    const replacement = JSON.stringify({ ...owner, ...(change === 'nonce' ? { nonce: randomUUID() } : {}) })
    await writeFile(lockPath, original)
    const replacementPath = join(dataDir, 'replacement.lock')
    await writeFile(replacementPath, replacement)
    const fixture = installFixture()
    const manager = createClaudeRuntimeManager({
      dataDir,
      pnpm: { executable: resolve('bundled-node'), pnpmPath: resolve('bundled-pnpm.cjs') },
      run: fixture.run,
      processProbe: async () => {
        if (change === 'nonce') await writeFile(lockPath, replacement)
        else await rename(replacementPath, lockPath)
        throw Object.assign(new Error('dead process'), { code: 'ESRCH' })
      },
    })

    await expect(manager.installOrUpdate()).rejects.toThrow('Another Claude Code runtime operation is in progress.')
    expect(await readFile(lockPath, 'utf8')).toBe(replacement)
    expect(fixture.calls).toHaveLength(0)
  })

  it('does not unlink a replacement owner lock during failure cleanup', async () => {
    const dataDir = await makeDataDirectory()
    const lockPath = join(dataDir, 'runtime.lock')
    const replacement = JSON.stringify({ schema: 1, pid: 2147483647, nonce: randomUUID() })
    let observedOwner: { schema: number; pid: number; nonce: string } | undefined
    const manager = createClaudeRuntimeManager({
      dataDir,
      pnpm: { executable: resolve('bundled-node'), pnpmPath: resolve('bundled-pnpm.cjs') },
      run: async () => {
        observedOwner = JSON.parse(await readFile(lockPath, 'utf8')) as typeof observedOwner
        await writeFile(lockPath, replacement)
        return { code: 1 }
      },
    })

    await expect(manager.installOrUpdate()).rejects.toThrow('Claude Code installation failed')
    expect(observedOwner).toMatchObject({ schema: 1, pid: process.pid })
    expect(observedOwner?.nonce).toMatch(/^[0-9a-f-]{36}$/u)
    expect(await readFile(lockPath, 'utf8')).toBe(replacement)
  })

  it('rejects a symlinked lock without following or removing its target', async () => {
    if (process.platform === 'win32') return
    const dataDir = await makeDataDirectory()
    const runtimeDir = join(dataDir, 'runtime')
    await mkdir(runtimeDir)
    const outsideLock = join(dataDir, 'outside.lock')
    const content = JSON.stringify({ schema: 1, pid: 2147483647, nonce: randomUUID() })
    await writeFile(outsideLock, content)
    await symlink(outsideLock, join(runtimeDir, 'runtime.lock'))
    const probe = vi.fn()
    const manager = createClaudeRuntimeManager({
      dataDir: runtimeDir,
      pnpm: { executable: resolve('bundled-node'), pnpmPath: resolve('bundled-pnpm.cjs') },
      run: installFixture().run,
      processProbe: probe,
    })

    await expect(manager.installOrUpdate()).rejects.toThrow('Another Claude Code runtime operation is in progress.')
    expect(await readFile(outsideLock, 'utf8')).toBe(content)
    expect(probe).not.toHaveBeenCalled()
  })

  it('uses the Windows native CLI executable and rejects damaged pointers', async () => {
    const dataDir = await makeDataDirectory()
    const { run } = installFixture()
    const manager = createClaudeRuntimeManager({
      dataDir: join(dataDir, 'windows-runtime'),
      platform: 'win32',
      pnpm: { executable: resolve('bundled-node'), pnpmPath: resolve('bundled-pnpm.cjs') },
      run,
    })
    await expect(manager.installOrUpdate()).rejects.toThrow(/CLI executable is missing/u)
  })

  it('uses only the explicitly supplied turn environment and reasserts the isolated Claude config directory', async () => {
    const dataDir = await makeDataDirectory()
    const manager = createClaudeRuntimeManager({
      dataDir: join(dataDir, 'isolated'),
      platform: 'linux',
      pnpm: { executable: resolve('bundled-node'), pnpmPath: resolve('bundled-pnpm.cjs') },
    })
    const env = manager.getCliEnvironment({ ANTHROPIC_API_KEY: 'turn-secret', ANTHROPIC_BASE_URL: 'https://route.example' }, {
      HOME: dataDir,
      CLAUDE_CONFIG_DIR: join(dataDir, 'user-claude'),
      ANTHROPIC_API_KEY: 'ambient-secret',
      ANTHROPIC_AUTH_TOKEN: 'ambient-auth-token',
      OPENAI_API_KEY: 'ambient-openai-secret',
      AWS_ACCESS_KEY_ID: 'ambient-aws-access-key',
      GOOGLE_APPLICATION_CREDENTIALS: join(dataDir, 'gcloud-user.json'),
      GITHUB_TOKEN: 'ambient-github-token',
      NODE_OPTIONS: '--require=ambient-hook',
      npm_config_userconfig: join(dataDir, 'user-npmrc'),
      XDG_CONFIG_HOME: join(dataDir, 'user-xdg-config'),
      CLAUDE_CODE_USE_BEDROCK: '1',
      PATH: 'preserved-for-cli-runtime',
    })
    expect(env.ANTHROPIC_API_KEY).toBe('turn-secret')
    expect(env.ANTHROPIC_BASE_URL).toBe('https://route.example')
    expect(env.CLAUDE_CONFIG_DIR).toBe(join(dataDir, 'isolated', 'config'))
    expect(env.HOME).toBe(join(dataDir, 'isolated', 'home'))
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.AWS_ACCESS_KEY_ID).toBeUndefined()
    expect(env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined()
    expect(env.GITHUB_TOKEN).toBeUndefined()
    expect(env.NODE_OPTIONS).toBeUndefined()
    expect(env.npm_config_userconfig).toBeUndefined()
    expect(env.CLAUDE_CODE_USE_BEDROCK).toBeUndefined()
    expect(env.XDG_CONFIG_HOME).toBe(join(dataDir, 'isolated', 'xdg-config'))
    expect(env.XDG_DATA_HOME).toBe(join(dataDir, 'isolated', 'xdg-data'))
    expect(env.PATH).toBe('preserved-for-cli-runtime')
    const withMcp = manager.getCliEnvironment({}, { PATH: 'safe-path' }, { CUSTOM_MCP_TOKEN: 'ephemeral-mcp-token' })
    expect(withMcp.CUSTOM_MCP_TOKEN).toBe('ephemeral-mcp-token')
    expect(withMcp.CLAUDE_CONFIG_DIR).toBe(join(dataDir, 'isolated', 'config'))
    const withConfigured = manager.getCliEnvironment({}, { PATH: 'safe-path' }, {}, { MY_BUILD_TOKEN: 'configured-secret' })
    expect(withConfigured.MY_BUILD_TOKEN).toBe('configured-secret')
    expect(() => manager.getCliEnvironment({}, {}, { ANTHROPIC_API_KEY: 'override' })).toThrow(/reserved/u)
    expect(() => manager.getCliEnvironment({}, {}, {}, { ANTHROPIC_API_KEY: 'ambient-route' })).toThrow(/reserved/u)
    expect(() => manager.getCliEnvironment({}, {}, { HOME: join(dataDir, 'outside-home') })).toThrow(/reserved/u)
    expect(() => manager.getCliEnvironment({}, {}, { MY_BUILD_TOKEN: 'mcp-override' }, { MY_BUILD_TOKEN: 'configured-secret' })).toThrow(/reserved or invalid/u)
    expect(() => manager.getCliEnvironment({}, {}, { BAD: 'nul\0value' })).toThrow(/invalid value/u)
  })

  it('repairs permissive pre-existing private directories before installing', async () => {
    if (process.platform === 'win32') return
    const dataDir = await makeDataDirectory()
    const runtimeDir = join(dataDir, 'private-runtime')
    const configDir = join(runtimeDir, 'config')
    await mkdir(configDir, { recursive: true, mode: 0o777 })
    await chmod(configDir, 0o755)
    const { run } = installFixture()
    const manager = createClaudeRuntimeManager({
      dataDir: runtimeDir,
      platform: 'linux',
      pnpm: { executable: resolve('bundled-node'), pnpmPath: resolve('bundled-pnpm.cjs') },
      run,
    })

    await manager.installOrUpdate()

    for (const directory of [runtimeDir, join(runtimeDir, 'config'), join(runtimeDir, 'home'), join(runtimeDir, 'pnpm-store')]) {
      expect((await stat(directory)).mode & 0o077).toBe(0)
    }
  })

  it('rejects an installed CLI symlink that resolves outside the private package tree', async () => {
    if (process.platform === 'win32') return
    const dataDir = await makeDataDirectory()
    const outsideExecutable = join(dataDir, 'outside-claude.js')
    await writeFile(outsideExecutable, '#!/usr/bin/env node\n')
    const run: ProcessRunner = async (_command, _args, options) => {
      const packageRoot = join(options.cwd, 'node_modules', '@anthropic-ai', 'claude-code')
      await mkdir(join(packageRoot, 'bin'), { recursive: true })
      await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
        name: CLAUDE_CODE_PACKAGE,
        version: CLAUDE_CODE_VERSION,
        bin: { claude: './bin/claude.js' },
      }))
      await symlink(outsideExecutable, join(packageRoot, 'bin', 'claude.js'))
      return { code: 0 }
    }
    const manager = createClaudeRuntimeManager({
      dataDir: join(dataDir, 'private-runtime'),
      platform: 'linux',
      pnpm: { executable: resolve('bundled-node'), pnpmPath: resolve('bundled-pnpm.cjs') },
      run,
    })

    await expect(manager.installOrUpdate()).rejects.toThrow(/resolves outside/u)
    expect(await manager.status()).toEqual({ installed: false })
  })

  it('rejects a symlinked versions directory instead of following a generation pointer outside the runtime root', async () => {
    if (process.platform === 'win32') return
    const dataDir = await makeDataDirectory()
    const runtimeDir = join(dataDir, 'runtime')
    const outsideVersions = join(dataDir, 'outside-versions')
    await mkdir(outsideVersions)
    await symlink(outsideVersions, join(runtimeDir, 'versions'))
    const manager = createClaudeRuntimeManager({
      dataDir: runtimeDir,
      platform: 'linux',
      pnpm: { executable: resolve('bundled-node'), pnpmPath: resolve('bundled-pnpm.cjs') },
      run: installFixture().run,
    })

    await expect(manager.installOrUpdate()).rejects.toThrow(/not a private directory/u)
    expect(await manager.status()).toEqual({ installed: false })
  })
})
