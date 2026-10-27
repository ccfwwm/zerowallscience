import { randomUUID } from 'node:crypto'
import { existsSync as nodeExistsSync, type Stats } from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

export const CLAUDE_CODE_PACKAGE = '@anthropic-ai/claude-code'
export const CLAUDE_CODE_VERSION = '2.1.309'
export const CLAUDE_CODE_REGISTRY = 'https://registry.npmmirror.com'

type FsPromises = Pick<typeof nodeFs, 'mkdir' | 'writeFile' | 'readFile' | 'rename' | 'rm' | 'lstat' | 'open' | 'chmod' | 'realpath' | 'link' | 'readdir'>

export type ProcessRunOptions = {
  cwd: string
  env: NodeJS.ProcessEnv
  windowsHide: true
}

export type ProcessRunResult = { code: number; stdout?: string; stderr?: string }
export type ProcessRunner = (command: string, args: string[], options: ProcessRunOptions) => Promise<ProcessRunResult>

export type BundledPnpmRuntimeOptions = {
  /** Electron's process.resourcesPath. When present, only its bundled pnpm is considered. */
  resourcesPath?: string
  /** Repository root used to probe development copies of the bundled pnpm. */
  projectRoot?: string
  electron?: boolean
  executable?: string
  existsSync?: (path: string) => boolean
}

export type BundledPnpmRuntime = { executable: string; pnpmPath: string }

/** Resolve only application-owned pnpm. This deliberately has no PATH/system fallback. */
export function resolveBundledPnpmRuntime(options: BundledPnpmRuntimeOptions = {}): BundledPnpmRuntime {
  const electron = options.electron ?? Boolean(process.versions.electron)
  const resourcesPath = options.resourcesPath ?? (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  const exists = options.existsSync ?? nodeExistsSync
  const root = resolve(options.projectRoot ?? process.cwd())
  const candidates = electron
    ? (resourcesPath ? [join(resolve(resourcesPath), 'commands', 'pnpm', 'bin', 'pnpm.cjs')] : [])
    : [
        join(root, 'commands', 'pnpm', 'bin', 'pnpm.cjs'),
        join(root, 'tools', 'commands', 'pnpm', 'bin', 'pnpm.cjs'),
        join(root, 'deepseek-harness', 'apps', 'desktop', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
      ]
  const pnpmPath = candidates.find(exists)
  if (!pnpmPath) {
    throw new Error(electron
      ? 'ZeroWall bundled pnpm is unavailable under process.resourcesPath/commands/pnpm.'
      : 'ZeroWall bundled pnpm is unavailable in the development runtime paths.')
  }
  const executable = resolve(options.executable ?? process.execPath)
  if (!isAbsolute(executable)) throw new Error('ZeroWall bundled Node/Electron executable must be an absolute path.')
  return { executable, pnpmPath: resolve(pnpmPath) }
}

export type ClaudeRuntimeStatus = {
  installed: boolean
  version?: string
  executablePath?: string
  previousVersion?: string
}

type RuntimeState = {
  schema: 1
  current: { id: string; version: string; executable: string }
  previous: { id: string; version: string; executable: string } | null
}

type RuntimeLock = { schema: 1; pid: number; nonce: string }
type RuntimeLockSnapshot = { owner: RuntimeLock; identity: Stats }

export type ClaudeRuntimeManagerOptions = {
  /** Dedicated plugin-owned data directory, never the user's Claude home directory. */
  dataDir: string
  platform?: NodeJS.Platform
  pnpm?: BundledPnpmRuntime
  fs?: FsPromises
  run?: ProcessRunner
  env?: NodeJS.ProcessEnv
  executable?: string
  createId?: () => string
  /** A successful probe or any error other than ESRCH treats the owner as live. */
  processProbe?: (pid: number) => void | Promise<void>
}

const safeId = /^[a-zA-Z0-9_-]{1,80}$/u
const lockNonce = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

function sameLockIdentity(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino
    && left.birthtimeMs === right.birthtimeMs && left.mtimeMs === right.mtimeMs && left.size === right.size
}

// Forward only process plumbing needed by the CLI and its child tools. In
// particular, do not forward arbitrary Host credentials, NODE_OPTIONS, DSH_*
// facts, or user package-manager settings into pnpm lifecycle scripts/Claude.
const CLAUDE_CONTROL_ENV = new Set([
  'CLAUDE_CODE_MAX_CONTEXT_TOKENS', 'CLAUDE_CODE_AUTO_COMPACT_WINDOW', 'CLAUDE_CODE_DISABLE_1M_CONTEXT',
  'CLAUDE_CODE_PROMPT_CACHE_TTL', 'CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL',
  'ENABLE_PROMPT_CACHING_1H', 'FORCE_PROMPT_CACHING_5M',
])
const SAFE_INHERITED_ENV = new Set([
  'PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'TERM_PROGRAM', 'COLORTERM',
  'NO_COLOR', 'FORCE_COLOR', 'CI', ...CLAUDE_CONTROL_ENV,
])
const ANTHROPIC_TURN_ENV = new Set([
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL',
])
const RESERVED_EPHEMERAL_ENV = /^(?:ANTHROPIC_|CLAUDE_|DSH_|NPM_CONFIG_|PNPM_|XDG_)/iu
// User-managed environment variables are part of the Claude session contract.
// Keep routing, package-manager, DSH and profile-path namespaces Host-owned,
// while allowing documented CLAUDE_CODE_* controls and ordinary tool vars.
const RESERVED_CONFIGURED_ENV = /^(?:ANTHROPIC_|DSH_|NPM_CONFIG_|PNPM_|XDG_)/iu
const RESERVED_EPHEMERAL_NAMES = new Set([
  'PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SYSTEMROOT', 'WINDIR', 'COMSPEC',
  'NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE', 'TEMP', 'TMP', 'TMPDIR',
  'DISABLE_AUTOUPDATER', 'DISABLE_UPDATES',
])

function normalizedEnvKey(key: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? key.toUpperCase() : key
}

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/**
 * Manages a plugin-private Claude Code install. Each install is staged beside
 * the active version; current.json is the sole activation pointer. A failed
 * candidate never replaces the active installation.
 */
export class ClaudeRuntimeManager {
  readonly dataDir: string
  readonly configDir: string
  readonly homeDir: string
  readonly storeDir: string
  readonly #platform: NodeJS.Platform
  readonly #pnpm: BundledPnpmRuntime
  readonly #fs: FsPromises
  readonly #run: ProcessRunner
  readonly #env: NodeJS.ProcessEnv
  readonly #createId: () => string
  readonly #processProbe: (pid: number) => void | Promise<void>
  #busy = false

  constructor(options: ClaudeRuntimeManagerOptions) {
    this.dataDir = resolve(options.dataDir)
    this.configDir = join(this.dataDir, 'config')
    this.homeDir = join(this.dataDir, 'home')
    this.storeDir = join(this.dataDir, 'pnpm-store')
    this.#platform = options.platform ?? process.platform
    this.#pnpm = options.pnpm ?? resolveBundledPnpmRuntime(options.executable === undefined ? {} : { executable: options.executable })
    this.#fs = options.fs ?? nodeFs
    this.#run = options.run ?? (() => Promise.reject(new Error('A process runner is required to install Claude Code.')))
    this.#env = options.env ?? process.env
    this.#createId = options.createId ?? randomUUID
    this.#processProbe = options.processProbe ?? (pid => { process.kill(pid, 0) })
  }

  /** Return the active CLI's absolute path without consulting PATH or a user install. */
  async getExecutablePath(): Promise<string | undefined> {
    return (await this.status()).executablePath
  }

  async status(): Promise<ClaudeRuntimeStatus> {
    const state = await this.#readState()
    if (!state) return { installed: false }
    await this.#verifyRealPathInside(this.dataDir, this.dataDir, 'Claude Code runtime root', 'directory', true)
    const versionsRoot = join(this.dataDir, 'versions')
    await this.#verifyRealPathInside(this.dataDir, versionsRoot, 'Claude Code versions directory', 'directory', true)
    const activePath = this.#generationPath(state.current.id)
    if (!await this.#exists(activePath)) return this.#recoverMissingGeneration()
    await this.#verifyRealPathInside(versionsRoot, activePath, 'Active Claude Code generation', 'directory', true)
    const executablePath = resolve(activePath, state.current.executable)
    if (!isInside(activePath, executablePath) || !isAbsolute(executablePath)) {
      throw new Error('Claude Code runtime state contains an invalid executable path.')
    }
    if (!await this.#exists(executablePath)) return this.#recoverMissingGeneration()
    await this.#verifyRealPathInside(activePath, executablePath, 'Claude Code runtime executable', 'file', true)
    return {
      installed: true,
      version: state.current.version,
      executablePath,
      ...(state.previous ? { previousVersion: state.previous.version } : {}),
    }
  }

  /** Install the pinned CLI into a private candidate and atomically activate it. */
  async installOrUpdate(): Promise<ClaudeRuntimeStatus> {
    return this.#withMutation(async () => {
      await this.#ensurePrivateDirectories()
      const prior = await this.#readState()
      const id = this.#newId()
      const candidate = this.#generationPath(id)
      const active = this.#generationPath(id)
      let promoted = false
      let candidateCreated = false
      try {
        await this.#fs.mkdir(candidate, { recursive: false, mode: 0o700 })
        await this.#secureDirectory(candidate)
        candidateCreated = true
        await this.#fs.writeFile(join(candidate, 'package.json'), JSON.stringify({
          name: 'zerowall-claude-code-runtime',
          private: true,
          version: '1.0.0',
          dependencies: { [CLAUDE_CODE_PACKAGE]: CLAUDE_CODE_VERSION },
        }, null, 2), { mode: 0o600 })
        await this.#fs.writeFile(join(candidate, '.npmrc'), `registry=${CLAUDE_CODE_REGISTRY}\n`, { mode: 0o600 })
        // pnpm 11 rejects unapproved dependency build scripts. The pinned
        // wrapper's postinstall places its matching native binary; approve
        // only that exact package/version in this private workspace. A local
        // workspace file also prevents discovery of any parent workspace.
        await this.#fs.writeFile(join(candidate, 'pnpm-workspace.yaml'), [
          'packages: []',
          'strictDepBuilds: true',
          'allowBuilds:',
          `  '${CLAUDE_CODE_PACKAGE}@${CLAUDE_CODE_VERSION}': true`,
          '',
        ].join('\n'), { mode: 0o600 })

        const result = await this.#run(this.#pnpm.executable, [
          this.#pnpm.pnpmPath,
          'install',
          `--registry=${CLAUDE_CODE_REGISTRY}`,
          `--store-dir=${this.storeDir}`,
        ], {
          cwd: candidate,
          env: this.#buildInstallEnvironment(join(candidate, '.npmrc')),
          windowsHide: true,
        })
        if (result.code !== 0) throw new Error(`Claude Code installation failed (pnpm exited ${result.code}).`)

        const packageRoot = join(candidate, 'node_modules', '@anthropic-ai', 'claude-code')
        const packageJson = JSON.parse(String(await this.#fs.readFile(join(packageRoot, 'package.json'), 'utf8'))) as {
          name?: string
          version?: string
          bin?: string | Record<string, string>
        }
        if (packageJson.name !== CLAUDE_CODE_PACKAGE || packageJson.version !== CLAUDE_CODE_VERSION) {
          throw new Error(`Installed Claude Code package did not match the pinned ${CLAUDE_CODE_VERSION} release.`)
        }
        const relativeCli = this.#resolveCliRelative(packageJson)
        const executablePath = resolve(packageRoot, relativeCli)
        if (!isInside(packageRoot, executablePath)) {
          throw new Error('Installed Claude Code CLI executable is missing or escapes its package directory.')
        }
        if (!await this.#exists(executablePath)) {
          throw new Error('Installed Claude Code CLI executable is missing or escapes its package directory.')
        }
        const generationReal = await this.#fs.realpath(candidate)
        const packageReal = await this.#verifyRealPathInside(generationReal, packageRoot, 'Installed Claude Code package', 'directory')
        await this.#verifyRealPathInside(packageReal, executablePath, 'Installed Claude Code executable', 'file', true)
        // The wrapper's postinstall can exit successfully while leaving its
        // placeholder behind if the optional native package is unavailable.
        // Probe the candidate before the activation pointer changes.
        const javascriptCli = /\.[cm]?js$/iu.test(executablePath)
        const probe = await this.#run(javascriptCli ? this.#pnpm.executable : executablePath,
          javascriptCli ? [executablePath, '--version'] : ['--version'], {
            cwd: candidate,
            env: this.getCliEnvironment(),
            windowsHide: true,
          })
        if (probe.code !== 0 || probe.stdout?.trim() !== `${CLAUDE_CODE_VERSION} (Claude Code)`) {
          throw new Error('Installed Claude Code CLI failed its pinned version health check.')
        }

        const previous = prior?.current ?? prior?.previous ?? null
        const next: RuntimeState = {
          schema: 1,
          current: { id, version: CLAUDE_CODE_VERSION, executable: relative(active, executablePath) },
          previous,
        }
        // The state swap is the activation point. The old generation remains
        // in place so rollback can switch back without reinstalling it.
        await this.#writeState(next)
        promoted = true
        return this.status()
      } catch (error) {
        if (!promoted && candidateCreated) await this.#fs.rm(active, { recursive: true, force: true }).catch(() => undefined)
        throw asError(error)
      }
    })
  }

  /** Atomically reactivate the previous successfully installed generation. */
  async rollback(): Promise<ClaudeRuntimeStatus> {
    return this.#withMutation(async () => {
      const state = await this.#readState()
      if (!state?.previous) throw new Error('No previous Claude Code installation is available to restore.')
      await this.#verifyRealPathInside(this.dataDir, this.dataDir, 'Claude Code runtime root', 'directory', true)
      const versionsRoot = join(this.dataDir, 'versions')
      await this.#verifyRealPathInside(this.dataDir, versionsRoot, 'Claude Code versions directory', 'directory', true)
      const oldPath = this.#generationPath(state.previous.id)
      await this.#verifyRealPathInside(versionsRoot, oldPath, 'Previous Claude Code generation', 'directory', true)
      const oldExecutable = resolve(oldPath, state.previous.executable)
      if (!isInside(oldPath, oldExecutable) || !await this.#exists(oldExecutable)) {
        throw new Error('The previous Claude Code installation is incomplete and cannot be restored.')
      }
      await this.#verifyRealPathInside(oldPath, oldExecutable, 'Previous Claude Code executable', 'file', true)
      await this.#writeState({ schema: 1, current: state.previous, previous: state.current })
      return this.status()
    })
  }

  /** Restore a retained, verified generation without downloading or reinstalling it. */
  async #recoverMissingGeneration(): Promise<ClaudeRuntimeStatus> {
    return this.#withMutation(async () => {
      const state = await this.#readState()
      if (!state) return { installed: false }

      // Another process may have repaired the pointer while this caller was
      // waiting for the runtime lock. In that case, leave its activation alone.
      const activePath = this.#generationPath(state.current.id)
      if (await this.#exists(activePath)) {
        const activeExecutable = resolve(activePath, state.current.executable)
        if (isInside(activePath, activeExecutable) && await this.#exists(activeExecutable)) return this.status()
      }

      const versionsRoot = join(this.dataDir, 'versions')
      await this.#verifyRealPathInside(this.dataDir, this.dataDir, 'Claude Code runtime root', 'directory', true)
      await this.#verifyRealPathInside(this.dataDir, versionsRoot, 'Claude Code versions directory', 'directory', true)
      const generations = await this.#fs.readdir(versionsRoot, { withFileTypes: true })
      const byModifiedTime = await Promise.all(generations
        .filter(entry => entry.isDirectory() && safeId.test(entry.name))
        .map(async entry => ({ id: entry.name, modified: (await this.#fs.lstat(this.#generationPath(entry.name))).mtimeMs })))
      byModifiedTime.sort((left, right) => right.modified - left.modified)

      const ids = new Set<string>([state.current.id])
      if (state.previous) ids.add(state.previous.id)
      for (const generation of byModifiedTime) ids.add(generation.id)

      const healthy: RuntimeState['current'][] = []
      for (const id of ids) {
        const generationRoot = this.#generationPath(id)
        try {
          await this.#verifyRealPathInside(versionsRoot, generationRoot, 'Retained Claude Code generation', 'directory', true)
          const packageRoot = join(generationRoot, 'node_modules', '@anthropic-ai', 'claude-code')
          await this.#verifyRealPathInside(generationRoot, packageRoot, 'Retained Claude Code package', 'directory')
          const packageJson = JSON.parse(String(await this.#fs.readFile(join(packageRoot, 'package.json'), 'utf8'))) as {
            name?: string
            version?: string
            bin?: string | Record<string, string>
          }
          if (packageJson.name !== CLAUDE_CODE_PACKAGE || packageJson.version !== CLAUDE_CODE_VERSION) continue

          const executablePath = resolve(packageRoot, this.#resolveCliRelative(packageJson))
          if (!isInside(packageRoot, executablePath) || !await this.#exists(executablePath)) continue
          const packageReal = await this.#fs.realpath(packageRoot)
          await this.#verifyRealPathInside(packageReal, executablePath, 'Retained Claude Code executable', 'file', true)
          const javascriptCli = /\.[cm]?js$/iu.test(executablePath)
          const probe = await this.#run(javascriptCli ? this.#pnpm.executable : executablePath,
            javascriptCli ? [executablePath, '--version'] : ['--version'], {
              cwd: generationRoot,
              env: this.getCliEnvironment(),
              windowsHide: true,
            })
          if (probe.code !== 0 || probe.stdout?.trim() !== `${CLAUDE_CODE_VERSION} (Claude Code)`) continue
          healthy.push({ id, version: CLAUDE_CODE_VERSION, executable: relative(generationRoot, executablePath) })
          if (healthy.length === 2) break
        } catch {
          // Never activate a stale or malformed generation. Continue to the
          // next retained directory and report one actionable error if no
          // candidate passes the package and executable health checks.
        }
      }

      if (!healthy.length) {
        throw new Error(`Claude Code's active executable is missing, and no retained managed generation passed the ${CLAUDE_CODE_VERSION} health check. Reinstall Claude Code from plugin settings.`)
      }
      await this.#writeState({ schema: 1, current: healthy[0]!, previous: healthy[1] ?? null })
      return this.status()
    })
  }

  /** Remove managed executables only. Configuration and native transcripts survive reinstall. */
  async uninstall(): Promise<void> {
    return this.#withMutation(async () => {
      await this.#verifyRealPathInside(this.dataDir, this.dataDir, 'Claude Code runtime root', 'directory', true)
      await this.#fs.rm(join(this.dataDir, 'versions'), { recursive: true, force: true })
      await this.#fs.rm(join(this.dataDir, 'current.json'), { force: true })
    })
  }

  /**
   * Build an isolated process environment for a CLI turn. Existing Anthropic
   * routing variables are stripped so the host must supply the current turn's
   * endpoint/model/credential explicitly in `turnEnvironment`.
   */
  getCliEnvironment(
    turnEnvironment: Record<string, string | undefined> = {},
    inherited: NodeJS.ProcessEnv = this.#env,
    ephemeralMcpEnvironment: Record<string, string> = {},
    configuredEnvironment: Record<string, string> = {},
  ): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {}
    const inheritedByKey = new Map<string, string>()
    for (const [key, value] of Object.entries(inherited)) {
      const normalized = normalizedEnvKey(key, this.#platform)
      if (value !== undefined && SAFE_INHERITED_ENV.has(normalized)) inheritedByKey.set(normalized, value)
    }
    for (const [key, value] of inheritedByKey) env[key] = value
    const configuredKeys = new Set<string>()
    for (const [key, value] of Object.entries(configuredEnvironment)) {
      const normalized = normalizedEnvKey(key, this.#platform)
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)
        || RESERVED_CONFIGURED_ENV.test(key)
        || RESERVED_EPHEMERAL_NAMES.has(normalized)
        || SAFE_INHERITED_ENV.has(normalized) && !CLAUDE_CONTROL_ENV.has(normalized)
        || configuredKeys.has(normalized)
        || typeof value !== 'string'
        || value.includes('\0')) {
        throw new Error('Claude Code configured environment contains a reserved or invalid variable.')
      }
      configuredKeys.add(normalized)
      env[CLAUDE_CONTROL_ENV.has(normalized) ? normalized : key] = value
    }
    for (const [key, value] of Object.entries(turnEnvironment)) {
      if (!ANTHROPIC_TURN_ENV.has(normalizedEnvKey(key, this.#platform))) {
        throw new Error(`Claude Code route supplied an unsupported environment variable: ${key}`)
      }
      if (value !== undefined && value.includes('\0')) throw new Error('Claude Code route environment contains an invalid value.')
      const canonicalKey = this.#platform === 'win32' ? [...ANTHROPIC_TURN_ENV].find(candidate => candidate.toUpperCase() === key.toUpperCase())! : key
      if (value === undefined) delete env[canonicalKey]
      else env[canonicalKey] = value
    }
    const seenMcpKeys = new Set(configuredKeys)
    for (const [key, value] of Object.entries(ephemeralMcpEnvironment)) {
      const normalized = normalizedEnvKey(key, this.#platform)
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)
        || RESERVED_EPHEMERAL_NAMES.has(normalized)
        || RESERVED_EPHEMERAL_ENV.test(key)
        || seenMcpKeys.has(normalized)
        || !ANTHROPIC_TURN_ENV.has(normalized) && Object.hasOwn(env, normalized)) {
        throw new Error('Claude Code MCP environment contains a reserved or invalid variable name.')
      }
      if (typeof value !== 'string' || value.includes('\0')) {
        throw new Error('Claude Code MCP environment contains an invalid value.')
      }
      seenMcpKeys.add(normalized)
      env[key] = value
    }
    // This plugin distributes an exact pinned CLI build and switches builds
    // through the managed runtime pointer. Upstream self-updates can rename or
    // replace the executable inside an immutable generation, so all updates
    // must go through ZeroWall's install/rollback transaction.
    env.DISABLE_AUTOUPDATER = '1'
    env.DISABLE_UPDATES = '1'
    // These paths deliberately override inherited values, preventing Claude
    // from reading/writing the user's ~/.claude or platform user profile.
    env.CLAUDE_CONFIG_DIR = this.configDir
    env.HOME = this.homeDir
    env.USERPROFILE = this.homeDir
    if (this.#platform === 'win32') {
      env.APPDATA = join(this.dataDir, 'appdata')
      env.LOCALAPPDATA = join(this.dataDir, 'local-appdata')
    }
    // Claude may use XDG paths on POSIX and many tools honor them as well.
    env.XDG_CONFIG_HOME = join(this.dataDir, 'xdg-config')
    env.XDG_CACHE_HOME = join(this.dataDir, 'xdg-cache')
    env.XDG_DATA_HOME = join(this.dataDir, 'xdg-data')
    env.XDG_STATE_HOME = join(this.dataDir, 'xdg-state')
    return env
  }

  #buildEnvironment(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
    const env = this.getCliEnvironment()
    for (const [key, value] of Object.entries(extra)) {
      if (!key.toLowerCase().startsWith('npm_config_') || value === undefined || value.includes('\0')) {
        throw new Error('Claude Code installer received an invalid package-manager environment setting.')
      }
      env[key] = value
    }
    env.npm_config_registry = CLAUDE_CODE_REGISTRY
    env.PNPM_HOME = join(this.dataDir, 'pnpm-home')
    return env
  }

  #buildInstallEnvironment(userConfigFile: string): NodeJS.ProcessEnv {
    return this.#buildEnvironment({ npm_config_userconfig: userConfigFile })
  }

  #resolveCliRelative(packageJson: { bin?: string | Record<string, string> }): string {
    if (this.#platform === 'win32') return join('bin', 'claude.exe')
    const declared = typeof packageJson.bin === 'string'
      ? packageJson.bin
      : packageJson.bin?.claude
    if (!declared || declared.includes('\0')) throw new Error('Installed Claude Code package does not declare its CLI entrypoint.')
    return declared
  }

  async #ensurePrivateDirectories(): Promise<void> {
    for (const directory of [
      this.dataDir,
      join(this.dataDir, 'versions'),
      this.storeDir,
      join(this.dataDir, 'pnpm-home'),
      this.configDir,
      this.homeDir,
      join(this.dataDir, 'xdg-config'),
      join(this.dataDir, 'xdg-cache'),
      join(this.dataDir, 'xdg-data'),
      join(this.dataDir, 'xdg-state'),
      ...(this.#platform === 'win32' ? [join(this.dataDir, 'appdata'), join(this.dataDir, 'local-appdata')] : []),
    ]) {
      await this.#secureDirectory(directory)
    }
  }

  async #secureDirectory(directory: string): Promise<void> {
    await this.#fs.mkdir(directory, { recursive: true, mode: 0o700 })
    const info = await this.#fs.lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`Claude Code runtime directory is not a private directory: ${directory}`)
    }
    if (process.platform !== 'win32') {
      await this.#fs.chmod(directory, 0o700)
      const secured = await this.#fs.lstat(directory)
      if ((secured.mode & 0o077) !== 0) throw new Error(`Claude Code runtime directory permissions are not private: ${directory}`)
    }
  }

  async #verifyRealPathInside(
    root: string,
    candidate: string,
    label: string,
    kind: 'file' | 'directory',
    rejectSymlink = false,
  ): Promise<string> {
    const linkInfo = await this.#fs.lstat(candidate)
    if (rejectSymlink && linkInfo.isSymbolicLink()) {
      throw new Error(`${label} must not be a symbolic link or reparse point.`)
    }
    const realRoot = await this.#fs.realpath(root)
    const realCandidate = await this.#fs.realpath(candidate)
    if (!isInside(realRoot, realCandidate)) {
      throw new Error(`${label} resolves outside its private runtime directory.`)
    }
    const info = await this.#fs.lstat(realCandidate)
    if (kind === 'file' ? !info.isFile() : !info.isDirectory()) {
      throw new Error(`${label} is not a regular ${kind}.`)
    }
    return realCandidate
  }

  async #exists(path: string): Promise<boolean> {
    try { await this.#fs.lstat(path); return true } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
  }

  #newId(): string {
    const id = this.#createId()
    if (!safeId.test(id)) throw new Error('Runtime generation identifier is invalid.')
    return id
  }

  #generationPath(id: string): string {
    if (!safeId.test(id)) throw new Error('Claude Code runtime state contains an invalid generation identifier.')
    const path = resolve(this.dataDir, 'versions', id)
    if (!isInside(resolve(this.dataDir, 'versions'), path)) throw new Error('Claude Code runtime generation escaped its managed directory.')
    return path
  }

  async #readState(): Promise<RuntimeState | undefined> {
    let text: string
    const statePath = join(this.dataDir, 'current.json')
    try {
      const stateInfo = await this.#fs.lstat(statePath)
      if (!stateInfo.isFile() || stateInfo.isSymbolicLink()) throw new Error('Claude Code runtime state must be a regular private file.')
      text = String(await this.#fs.readFile(statePath, 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
    const state = JSON.parse(text) as RuntimeState
    const validGeneration = (entry: RuntimeState['current'] | null): entry is RuntimeState['current'] => Boolean(entry
      && safeId.test(entry.id)
      && entry.version === CLAUDE_CODE_VERSION
      && typeof entry.executable === 'string'
      && entry.executable.length > 0
      && !isAbsolute(entry.executable)
      && !entry.executable.split(/[\\/]/u).includes('..'))
    if (state.schema !== 1 || !validGeneration(state.current) || (state.previous !== null && !validGeneration(state.previous))) {
      throw new Error('Claude Code runtime state is invalid.')
    }
    this.#generationPath(state.current.id)
    if (state.previous) this.#generationPath(state.previous.id)
    return state
  }

  async #writeState(state: RuntimeState): Promise<void> {
    const target = join(this.dataDir, 'current.json')
    const temporary = join(this.dataDir, `current.${this.#newId()}.tmp`)
    await this.#fs.writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' })
    try { await this.#fs.rename(temporary, target) } catch (error) {
      await this.#fs.rm(temporary, { force: true }).catch(() => undefined)
      throw error
    }
  }

  async #readLock(path: string): Promise<RuntimeLockSnapshot | undefined> {
    let handle: Awaited<ReturnType<FsPromises['open']>> | undefined
    try {
      const pathIdentity = await this.#fs.lstat(path)
      if (!pathIdentity.isFile() || pathIdentity.isSymbolicLink() || pathIdentity.size > 512) return undefined
      handle = await this.#fs.open(path, 'r')
      const identity = await handle.stat()
      if (!identity.isFile() || !sameLockIdentity(pathIdentity, identity)) return undefined
      let owner: RuntimeLock
      try { owner = JSON.parse(await handle.readFile('utf8')) as RuntimeLock } catch { return undefined }
      if (owner?.schema !== 1 || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 || owner.pid > 0x7fffffff
        || typeof owner.nonce !== 'string' || !lockNonce.test(owner.nonce)
        || !sameLockIdentity(identity, await handle.stat())) return undefined
      return { owner, identity }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    } finally {
      await handle?.close().catch(() => undefined)
    }
  }

  async #removeLockIfUnchanged(path: string, expected: RuntimeLockSnapshot): Promise<boolean> {
    // Only the live owner or the elected stale-lock recoverer may call this.
    // Identity checks alone cannot serialize two recoverers across unlink.
    const current = await this.#readLock(path)
    if (!current || !sameLockIdentity(current.identity, expected.identity)
      || current.owner.pid !== expected.owner.pid || current.owner.nonce !== expected.owner.nonce) return false
    await this.#fs.rm(path, { force: true })
    return true
  }

  async #ownerIsDead(owner: RuntimeLock): Promise<boolean> {
    if (owner.pid === process.pid) return false
    try { await this.#processProbe(owner.pid) } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ESRCH'
    }
    return false
  }

  async #claimStaleRecovery(stale: RuntimeLockSnapshot, temporary: string): Promise<boolean> {
    let blocker = stale
    for (let depth = 0; depth < 32; depth++) {
      // A permanent claim, keyed by the stale owner's unique nonce, elects
      // exactly one recoverer. Never remove it: a late contender may still
      // hold the old snapshot after a new runtime.lock has been acquired.
      const claimPath = join(this.dataDir, `.runtime-recovery-${blocker.owner.nonce}.lock`)
      try {
        await this.#fs.link(temporary, claimPath)
        return true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
      const claim = await this.#readLock(claimPath)
      if (!claim || !await this.#ownerIsDead(claim.owner)) return false
      // If a recoverer itself crashed, elect its replacement under the next
      // nonce without unlinking/reusing any earlier election file.
      blocker = claim
    }
    return false
  }

  async #recoverStaleLock(path: string, temporary: string): Promise<boolean> {
    const existing = await this.#readLock(path)
    // PID reuse is intentionally conservative. A lock owned by this process,
    // a live PID, or an unprobeable PID is never considered stale.
    if (!existing || !await this.#ownerIsDead(existing.owner)) return false
    if (!await this.#claimStaleRecovery(existing, temporary)) return false
    return this.#removeLockIfUnchanged(path, existing)
  }

  async #acquireMutationLock(path: string): Promise<RuntimeLockSnapshot> {
    const owner: RuntimeLock = { schema: 1, pid: process.pid, nonce: randomUUID() }
    const temporary = join(this.dataDir, `.runtime-lock-${owner.nonce}.tmp`)
    let created = false
    try {
      // Publish only a complete lock record. Writing directly to runtime.lock
      // after wx would leave an unreadable empty lock if the Host crashed
      // between creation and writing. A hard link atomically exposes these
      // already-written bytes and retains exclusive EEXIST semantics.
      await this.#fs.writeFile(temporary, JSON.stringify(owner), { mode: 0o600, flag: 'wx' })
      created = true
      const snapshot = await this.#readLock(temporary)
      if (!snapshot) throw new Error('Claude Code runtime lock could not be initialized.')
      try { await this.#fs.link(temporary, path) } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        if (!await this.#recoverStaleLock(path, temporary)) throw new Error('Another Claude Code runtime operation is in progress.')
        try { await this.#fs.link(temporary, path) } catch (retryError) {
          if ((retryError as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Another Claude Code runtime operation is in progress.')
          throw retryError
        }
      }
      return snapshot
    } finally {
      if (created) await this.#fs.rm(temporary, { force: true }).catch(() => undefined)
    }
  }

  async #withMutation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#busy) throw new Error('A Claude Code runtime operation is already in progress.')
    this.#busy = true
    const lockPath = join(this.dataDir, 'runtime.lock')
    let lock: RuntimeLockSnapshot | undefined
    try {
      // Secure the root before creating the lock. Otherwise an existing
      // symlink/permissive directory could redirect or expose the lock before
      // installOrUpdate() gets a chance to validate the private tree.
      await this.#secureDirectory(this.dataDir)
      lock = await this.#acquireMutationLock(lockPath)
      return await operation()
    } finally {
      if (lock) await this.#removeLockIfUnchanged(lockPath, lock).catch(() => undefined)
      this.#busy = false
    }
  }
}

export function createClaudeRuntimeManager(options: ClaudeRuntimeManagerOptions): ClaudeRuntimeManager {
  return new ClaudeRuntimeManager(options)
}
