import { attachPythonBroker } from './python-broker.js'
import { startCommandServer } from './command-server.js'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { access, appendFile, cp, mkdir, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, WebContentsView, clipboard, dialog, ipcMain, Menu, nativeImage, nativeTheme, Notification, safeStorage, shell, Tray, type OpenDialogOptions } from 'electron'
import { DesktopNotifications } from './notifications.js'
import updaterPackage from 'electron-updater'
import { HarnessRuntime, type HarnessChildProcess } from './runtime/harness-runtime.js'
import { attachCredentialBroker } from './credentials/broker.js'
import { CredentialVault } from './credentials/vault.js'
import { secureWindow } from './security.js'
import { isZoteroOpenUrl } from './security-policy.js'
import { resolveDesktopIdentity } from './identity.js'
import { findDesktopWorkspaceRoot, resolveBundledSkillsPath, resolveDesktopIconPath, resolveDesktopResourcePath, resolveWorkspaceResourcePath } from './paths.js'
import { stopBeforeExit } from './shutdown.js'
import { PythonUpdaterService } from './python-updater-service.js'
import { createPythonTerminalLaunch, managedPythonTerminalPaths } from './python-terminal.js'
import { PythonSyncService } from './python-sync.js'
import { PythonEnvironmentApi, type PythonEnvironmentRequest } from './python-environment-api.js'
import { resolvePythonLocation } from './python-location.js'
import { resolveDesktopUserDataPath } from './user-data-location.js'
import { mcpEnvironmentDiagnostic, MCP_ENVIRONMENT_KEYRING } from './mcp-environment.js'
import { hideWindowToTray, showWindowFromTray } from './tray-window.js'
import { registerWindowControls } from './window-controls.js'
import { DesktopUpdateController, isUpdateCheckDue, UPDATE_CHECK_INTERVAL_MS } from './updater.js'
import { verifyDownloadedArtifact } from './update-artifact.js'
import { resolveRevealPath } from './reveal-path.js'
import { copyWindowsFile } from './clipboard-files.js'
import { deleteStoredSession, parseSessionDeleteRpcResponse, recoverSessionDeletions, sessionDeletionJournal, validSessionId } from './session-delete.js'
import type { DesktopClipboardFile, DesktopInfo, PythonDependencyLayer, RuntimeSnapshot, StartupStatus } from '../shared/contracts.js'

const { autoUpdater } = updaterPackage
/** Stable updates are served from the Qiniu-backed generic feed. Keeping this
 * explicit also makes the unpacked `win-unpacked` build testable, because
 * electron-builder only emits app-update.yml for installer targets. */
export const STABLE_UPDATE_FEED_URL = 'https://zerowall.chengxunkeji.cn/stable/'
// Update pointers are mutable objects on the CDN; always revalidate them.
autoUpdater.requestHeaders = { 'Cache-Control': 'no-cache' }
const MCP_ENVIRONMENT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAu8wAGfgRWqQBdIGcbkwPlBq01SjgEMybgNh3xVv0ej4=\n-----END PUBLIC KEY-----`

let mainWindow: BrowserWindow | undefined
let startupCover: WebContentsView | undefined
let runtime: HarnessRuntime | undefined
let pythonEnvironmentApi: PythonEnvironmentApi | undefined
let tray: Tray | undefined
let quitting = false
let restarting = false
let startup: StartupStatus = { phase: 'starting', progress: 5, message: '正在准备本地工作台', startedAt: Date.now() }
let navigation: Promise<void> | undefined
let runtimeReachedReady = false
let initialRuntimeStartRequested = false
const desktopPluginProcesses = new Map<string, ReturnType<typeof spawn>>()
let managementChild: HarnessChildProcess | undefined
const managementRequests = new Map<string, { resolve: (result: unknown) => void; reject: (error: Error) => void }>()

async function sessionDeleteRpc<T>(window: BrowserWindow, activeRuntime: HarnessRuntime, method: string, request: object, fallback: string): Promise<T> {
  if (activeRuntime.snapshot().phase !== 'ready') throw new Error(fallback)
  const body = { type: 'client-request', rpcId: crypto.randomUUID(), method: `session/${method}`, payload: { args: { request } } }
  const result = await window.webContents.executeJavaScript(`(async () => {
    const response = await fetch(${JSON.stringify(`/api/session/${method}`)}, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(body))} });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text: text.slice(0, 500) };
  })()`)
  return parseSessionDeleteRpcResponse<T>(result, fallback)
}

function readPackagedChannel(): unknown {
  try {
    const manifest = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as { zerowallChannel?: unknown }
    return manifest.zerowallChannel
  } catch {
    return process.env.ZEROWALL_RELEASE_CHANNEL
  }
}

const identity = resolveDesktopIdentity(readPackagedChannel())

// These names were used for managed Python slots/profile trees before the
// shared runtime moved beside the application (or to LocalAppData). They are
// deliberately excluded from ordinary user-data migration. The signed base
// archive in the current installer is the only supported recovery source.
const LEGACY_PYTHON_DATA_DIRECTORIES = new Set([
  'python',
  'zerowall-python',
  'mcp-environments',
  'mcp-environment',
  'python-environment',
  'python-environments',
])

function configureIdentity(): void {
  app.setName(identity.productName)
  if (process.platform === 'win32') app.setAppUserModelId(identity.channel === 'stable' ? 'com.zerowall.science' : 'com.zerowall.science.preview')
  let appDataPath: string | undefined
  try { appDataPath = app.getPath('appData') } catch { /* use LocalAppData */ }
  const userData = resolveDesktopUserDataPath({
    override: process.env.ZEROWALL_USER_DATA_DIR,
    appDataPath,
    localAppDataPath: process.env.LOCALAPPDATA?.trim() || join(process.env.USERPROFILE ?? app.getPath('home'), 'AppData', 'Local'),
    directoryName: identity.userDataDirectory,
  })
  if (userData.usedLocalFallback) console.info('Using LocalAppData for this Windows profile; no Roaming product directory is required.')
  app.setPath('userData', userData.path)
}

async function migrateLegacyUserData(): Promise<void> {
  // An explicitly selected profile must stay isolated. Windows known-folder
  // paths can ignore APPDATA overrides used by packaged verification.
  if (process.env.ZEROWALL_USER_DATA_DIR?.trim()) return
  const target = app.getPath('userData')
  // Existing installations have already migrated. Recursively walking old
  // caches and Python trees on every launch can take minutes on Windows.
  try { await stat(join(target, 'harness')); return } catch { /* first launch */ }
  let appData: string
  try {
    appData = app.getPath('appData')
  } catch {
    // Electron can expose an unusable APPDATA during first-run/smoke
    // environments. Legacy migration is optional; startup must continue with
    // the explicitly configured user-data directory.
    return
  }
  const legacyNames = identity.channel === 'stable'
    ? ['zerowall-science-3']
    : ['zerowall-science-3-preview']
  for (const name of legacyNames) {
    const legacy = join(appData, name)
    if (legacy === target) continue
    try {
      await cp(legacy, target, {
        recursive: true,
        force: false,
        errorOnExist: false,
        // User data such as sessions and settings still migrates. The old
        // managed interpreter/profile is deliberately left in place; Stable
        // restores Python from its signed installer archive instead.
        filter: source => {
          const relativePath = relative(legacy, source)
          if (relativePath === '' || relativePath === '.') return true
          const topLevel = relativePath.split(/[\\/]/u, 1)[0]?.toLowerCase()
          // Older releases stored the interpreter and its slot/profile under
          // several different names.  Do not copy any of those trees into the
          // new user-data directory: the signed Python archive in the current
          // installer is the only source for a fresh shared runtime.  Copying
          // one of these directories was enough to make a clean install look
          // like an unfinished migration and to block dependency installs.
          return !LEGACY_PYTHON_DATA_DIRECTORIES.has(topLevel ?? '')
        },
      })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'EEXIST' && code !== 'EACCES' && code !== 'EPERM' && code !== 'ENOTDIR') throw error
      if (code === 'EACCES' || code === 'EPERM' || code === 'ENOTDIR') console.warn(`Legacy user data is unavailable (${code}); continuing with the writable profile.`)
    }
  }
}

function resourcePath(name: string): string {
  return resolveDesktopResourcePath({ appPath: app.getAppPath(), isPackaged: app.isPackaged, name, resourcesPath: process.resourcesPath })
}

function desktopIconPath(): string {
  return resolveDesktopIconPath({ appPath: app.getAppPath(), isPackaged: app.isPackaged, resourcesPath: process.resourcesPath })
}

function bundledSkillsPath(): string {
  return app.isPackaged ? resolveBundledSkillsPath(process.resourcesPath) : resolveWorkspaceResourcePath(findWorkspaceRoot(), 'skills')
}

function brandIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'zerowall-icon.png')
    : resolveWorkspaceResourcePath(findWorkspaceRoot(), 'brand', 'zerowall', 'zerowall-icon.png')
}

interface UpdateCheckRecord { lastCheckedAt?: number }
interface ResourceCheckRecord { lastCheckedAt?: number; lastNotifiedSignature?: string }

async function readUpdateCheckRecord(path: string): Promise<UpdateCheckRecord> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as UpdateCheckRecord
    return typeof parsed.lastCheckedAt === 'number' ? parsed : {}
  } catch {
    return {}
  }
}

async function writeUpdateCheckRecord(path: string, lastCheckedAt: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify({ lastCheckedAt })}\n`, 'utf8')
}

async function readResourceCheckRecord(path: string): Promise<ResourceCheckRecord> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as ResourceCheckRecord
    return typeof parsed.lastCheckedAt === 'number' ? parsed : {}
  } catch { return {} }
}

async function writeResourceCheckRecord(path: string, record: ResourceCheckRecord): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(record)}\n`, { mode: 0o600 })
  await rename(temporary, path)
}

function findWorkspaceRoot(): string {
  return findDesktopWorkspaceRoot(app.getAppPath())
}

function developmentStagePath(...parts: string[]): string {
  const root = findWorkspaceRoot()
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version as string
  const stage = join(root, 'artifacts', 'stage', version)
  const buildId = process.env.ZEROWALL_BUILD_ID ?? (JSON.parse(readFileSync(join(stage, 'current.json'), 'utf8')).buildId as string)
  return join(stage, buildId, ...parts)
}

function attachDesktopBridge(child: HarnessChildProcess): () => void {
  const onMessage = (message: unknown) => {
    if (!message || typeof message !== 'object') return
    const value = message as { type?: string; requestId?: string; op?: string; args?: readonly string[]; invokingDir?: string }
    if (value.type === 'zerowall:desktop:restart-runtime') {
      void runtime?.start(join(app.getPath('userData'), 'workspace'))
      return
    }
    if (value.type === 'zerowall:desktop:cancel' && value.requestId !== undefined) {
      desktopPluginProcesses.get(value.requestId)?.kill()
      return
    }
    if (value.type !== 'zerowall:desktop' || value.requestId === undefined || value.op === undefined) return
    if (value.op === 'selectProfile') {
      child.send({ type: 'zerowall:desktop:result', requestId: value.requestId, result: { ok: true, result: undefined } })
      return
    }
    if (value.op !== 'runPlugin' && value.op !== 'run') return
    const args = Array.isArray(value.args) ? [...value.args] : []
    const invokingDir = value.invokingDir ?? join(app.getPath('userData'), 'harness')
    const command = nodeExecutablePath()
    const pnpmEntry = app.isPackaged ? join(process.resourcesPath, 'commands/pnpm/bin/pnpm.cjs') : process.env.npm_execpath
    if (!pnpmEntry) throw new Error('Bundled pnpm is unavailable')
    let operation: ReturnType<typeof spawn>
    try {
      operation = spawn(command, ['--expose-internals', pnpmEntry, ...args], { cwd: invokingDir, env: { ...process.env, ...(app.isPackaged ? { ELECTRON_RUN_AS_NODE: '1' } : {}) }, windowsHide: true, shell: false })
    } catch (error) {
      child.send({ type: 'zerowall:desktop:result', requestId: value.requestId, result: { ok: false, error: error instanceof Error ? error.message : String(error) } })
      return
    }
    desktopPluginProcesses.set(value.requestId, operation)
    operation.stdout?.on('data', chunk => child.send({ type: 'zerowall:desktop:result', requestId: value.requestId, stream: 'stdout', chunk: String(chunk) }))
    operation.stderr?.on('data', chunk => child.send({ type: 'zerowall:desktop:result', requestId: value.requestId, stream: 'stderr', chunk: String(chunk) }))
    operation.once('error', error => child.send({ type: 'zerowall:desktop:result', requestId: value.requestId, result: { ok: false, error: error.message } }))
    operation.once('exit', (code, signal) => {
      desktopPluginProcesses.delete(value.requestId as string)
      child.send({ type: 'zerowall:desktop:result', requestId: value.requestId, result: { ok: true, result: { exitCode: code, signal } } })
    })
  }
  child.on('message', onMessage)
  const dispose = () => child.off('message', onMessage)
  child.once('exit', dispose)
  return dispose
}

function dshEntryPath(): string {
  if (app.isPackaged) return join(app.getAppPath(), 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  return join(findWorkspaceRoot(), 'deepseek-harness', 'apps', 'cli', 'lib', 'bin.js')
}

function nodeExecutablePath(): string {
  if (app.isPackaged) return process.execPath
  return process.env.npm_node_execpath ?? process.execPath
}

function nodeEntryPath(): string {
  return app.isPackaged ? join(app.getAppPath(), 'runtime', 'harness-node-entry.mjs') : resourcePath('harness-node-entry.mjs')
}

function nodeResolverPath(): string | undefined {
  return app.isPackaged ? join(app.getAppPath(), 'runtime', 'runtime-esm-register.mjs') : resourcePath('runtime-esm-register.mjs')
}

function runtimeModulesPath(): string | undefined {
  return app.isPackaged ? join(app.getAppPath(), 'node_modules') : developmentStagePath('runtime', 'node_modules')
}

function runtimeAnchorPath(): string {
  if (app.isPackaged) return dshEntryPath()
  return join(runtimeModulesPath() as string, '@deepseek-ai', 'dsh', 'package.json')
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    ...(process.platform === 'win32' ? { frame: false, roundedCorners: true } : {}),
    width: 1380,
    height: 900,
    minWidth: 960,
    minHeight: 680,
    show: false,
    title: identity.productName,
    icon: desktopIconPath(),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#17181a' : '#f7f4ed',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  })
  window.on('page-title-updated', (event) => {
    event.preventDefault()
    window.setTitle(identity.productName)
  })
  window.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    hideWindowToTray(window, process.platform)
  })
  secureWindow(window, () => runtime?.snapshot().url)
  registerWindowControls(window, () => runtime?.snapshot().url, pathToFileURL(resourcePath('splash.html')).href, () => startupCover?.webContents, () => app.quit())
  window.on('closed', () => {
    startupCover?.webContents.close()
    startupCover = undefined
    if (mainWindow === window) mainWindow = undefined
  })
  mainWindow = window
  return window
}

function showMainWindow(): void {
  const window = mainWindow
  if (window === undefined || window.isDestroyed()) return
  showWindowFromTray(window, process.platform)
}

function restartDesktop(): void {
  if (quitting || restarting) return
  restarting = true
  app.quit()
}

function publishStartup(update: Partial<StartupStatus>): void {
  startup = { ...startup, ...update }
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:startup-status', startup)
  if (startupCover && !startupCover.webContents.isDestroyed()) startupCover.webContents.send('desktop:startup-status', startup)
  const line = { timestamp: new Date().toISOString(), elapsedMs: Date.now() - startup.startedAt, ...update }
  void mkdir(app.getPath('logs'), { recursive: true }).then(() =>
    appendFile(join(app.getPath('logs'), 'startup.log'), `${JSON.stringify(line)}\n`, 'utf8'),
  ).catch(() => undefined)
}

async function failStartup(error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]')
  publishStartup({ phase: 'failed', message: message.slice(0, 1800) })
  if (!quitting && mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.getURL().startsWith('file:')) await showSplash()
}

function ensureTray(): void {
  if (tray !== undefined && !tray.isDestroyed()) return
  const source = nativeImage.createFromPath(desktopIconPath())
  const icon = source.resize({ width: process.platform === 'darwin' ? 18 : 16, height: process.platform === 'darwin' ? 18 : 16 })
  const next = new Tray(icon)
  const chinese = app.getLocale().toLowerCase().startsWith('zh')
  next.setToolTip(identity.productName)
  next.setContextMenu(Menu.buildFromTemplate([
    { label: chinese ? `显示 ${identity.productName}` : `Show ${identity.productName}`, click: showMainWindow },
    { label: chinese ? '重启' : 'Restart', click: restartDesktop },
    { type: 'separator' },
    { label: chinese ? '退出' : 'Quit', click: () => app.quit() },
  ]))
  next.on('click', showMainWindow)
  next.on('double-click', showMainWindow)
  tray = next
}

async function showSplash(): Promise<void> {
  const window = mainWindow ?? createWindow()
  ensureTray()
  if (startupCover) {
    window.contentView.removeChildView(startupCover)
    startupCover.webContents.close()
    startupCover = undefined
  }
  await window.loadFile(resourcePath('splash.html'), {
    query: { icon: pathToFileURL(desktopIconPath()).href, version: app.getVersion() },
  })
  if (!window.isDestroyed()) window.show()
}

async function showHarness(snapshot: RuntimeSnapshot): Promise<void> {
  if (snapshot.phase !== 'ready' || snapshot.url === undefined) return
  // DSH first exposes the loopback endpoint and then prints an authenticated
  // URL. The bare endpoint intentionally returns 401 and renders as a blank
  // page, so wait for the token-bearing URL before navigating the window.
  if (!/[?&]token=/u.test(snapshot.url)) return
  const window = mainWindow ?? createWindow()
  publishStartup({ progress: 85, message: '正在打开工作台' })
  // Keep the same branded splash above the navigating document until every
  // client plugin has activated and React has painted the workbench.
  const cover = new WebContentsView({ webPreferences: {
    contextIsolation: true, nodeIntegration: false, sandbox: true,
    preload: join(import.meta.dirname, '../preload/index.cjs'),
  } })
  startupCover = cover
  const resizeCover = () => {
    const { width, height } = window.getContentBounds()
    cover.setBounds({ x: 0, y: 0, width, height })
  }
  cover.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  cover.webContents.on('will-navigate', event => event.preventDefault())
  await cover.webContents.loadFile(resourcePath('splash.html'), {
    query: { icon: pathToFileURL(desktopIconPath()).href, version: app.getVersion() },
  })
  window.contentView.addChildView(cover)
  resizeCover()
  window.on('resize', resizeCover)
  cover.webContents.once('destroyed', () => window.removeListener('resize', resizeCover))
  await window.loadURL(snapshot.url)
  // Wait for the actual shell, not just the HTML load. This also surfaces a
  // renderer plugin failure instead of silently abandoning the startup page.
  const deadline = Date.now() + 45_000
  while (!window.isDestroyed() && !quitting) {
    const bootFailed = await window.webContents.executeJavaScript('document.querySelector("[data-dsh-boot-failed]") !== null')
    if (bootFailed) throw new Error('客户端插件加载失败，请重试或打开日志查看详情。')
    const mounted = await window.webContents.executeJavaScript('Boolean(!document.querySelector("[data-dsh-boot]") && document.querySelector("[data-dsh-better-sidebar], [data-zerowall-conversation], [contenteditable]"))')
    if (mounted) break
    if (Date.now() >= deadline) throw new Error('工作台界面加载超时，请打开日志检查客户端插件。')
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  if (!window.isDestroyed()) {
    publishStartup({ phase: 'ready', progress: 100, message: '工作台已就绪' })
    runtime?.workbenchReady()
    window.contentView.removeChildView(cover)
    cover.webContents.close()
    startupCover = undefined
    window.show()
    window.focus()
    const activeRuntime = runtime
    if (activeRuntime !== undefined) {
      const userData = app.getPath('userData')
      void recoverSessionDeletions({
        directory: join(userData, 'harness', 'session-delete-pending'),
        root: join(userData, 'harness', 'sessions'),
        commit: async (sessionId, token) => { await sessionDeleteRpc(window, activeRuntime, 'commitDelete', { sessionId, token }, 'Session deletion recovery failed') },
        abort: async (sessionId, token) => { await sessionDeleteRpc(window, activeRuntime, 'abortDelete', { sessionId, token }, 'Session deletion recovery failed') },
      }).catch(error => { console.error('Session deletion recovery failed:', error) })
    }
  }
}

async function resolveManagedPythonExecutable(root: string): Promise<string | undefined> {
  try {
    const current = JSON.parse(await readFile(join(root, 'current.json'), 'utf8')) as { root?: unknown; health?: unknown; manifest?: { python?: { relativeExecutable?: unknown } } }
    if (current.health !== 'ready' || typeof current.root !== 'string' || current.root.trim() === '') return undefined
    const installRoot = resolve(current.root)
    const manifest = current.manifest ?? JSON.parse(await readFile(join(installRoot, 'manifest.json'), 'utf8')) as { python?: { relativeExecutable?: unknown } }
    const relativeExecutable = manifest.python?.relativeExecutable
    if (typeof relativeExecutable !== 'string' || relativeExecutable.trim() === '' || isAbsolute(relativeExecutable)) return undefined
    const executable = resolve(installRoot, relativeExecutable)
    const containment = relative(installRoot, executable)
    if (containment === '..' || containment.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(containment)) return undefined
    await access(executable)
    return executable
  } catch { return undefined }
}

async function launch(): Promise<void> {
  // Offline profile activation already starts and validates this same Host.
  // Starting it twice replaces its token after the Renderer authenticated.
  if (runtimeReachedReady || runtime?.snapshot().phase === 'ready' || initialRuntimeStartRequested) return
  initialRuntimeStartRequested = true
  publishStartup({ progress: 35, message: '正在加载核心服务与插件' })
  await runtime?.start(join(app.getPath('userData'), 'workspace'))
}

app.commandLine.appendSwitch('lang', 'zh-CN')
configureIdentity()
const ownsInstance = app.requestSingleInstanceLock()
if (!ownsInstance) app.exit(0)
app.on('second-instance', showMainWindow)

if (ownsInstance) app.whenReady().then(async () => {
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
  ipcMain.handle('desktop:startup-status', () => startup)
  ipcMain.handle('desktop:restart', () => { restartDesktop(); return true })
  ipcMain.handle('desktop:open-logs', () => shell.openPath(app.getPath('logs')))
  await showSplash()
  publishStartup({ progress: 15, message: '正在检查用户数据' })
  const userData = app.getPath('userData')
  await migrateLegacyUserData()
  // Roaming is optional. These roots are used only to reject an obsolete
  // saved Python target; no files are read or copied from those profiles.
  let appDataPath: string | undefined
  try { appDataPath = app.getPath('appData') } catch { /* Python remains independent of Roaming */ }
  const pythonLocation = await resolvePythonLocation({
    localAppDataPath: process.env.LOCALAPPDATA?.trim() || join(process.env.USERPROFILE ?? app.getPath('home'), 'AppData', 'Local'),
    legacyRoamingRoots: appDataPath ? [
      userData,
      join(appDataPath, identity.userDataDirectory),
      join(appDataPath, 'zerowall-science'),
      join(appDataPath, 'zerowall-science-3'),
    ] : [],
    applicationInstallRoot: app.isPackaged ? dirname(process.execPath) : undefined,
  })
  const mcpEnvironmentRoot = pythonLocation.managementRoot
  // Do not copy the old Roaming profile. The updater recreates the managed
  // runtime from the signed archive packaged with Stable installers and
  // leaves the former profile untouched for manual recovery if needed.
  publishStartup({ progress: 25, message: '正在准备本地运行环境' })
  // Python lives outside Roaming and may be on a removable or temporarily
  // unavailable drive. Do not make a Python path error prevent the desktop and
  // its path settings from opening; the updater creates the directory inside
  // its recoverable install transaction and reports any failure in the panel.
  process.env.ZEROWALL_PYTHON_ROOT = mcpEnvironmentRoot
  process.env.ZEROWALL_BIOGENIE_ROOT = app.isPackaged ? join(process.resourcesPath, 'extensions/capabilities/biogenie') : resolveWorkspaceResourcePath(findWorkspaceRoot(), 'biogenie')
  const bundledKetcherRoot = app.isPackaged ? join(process.resourcesPath, 'extensions/mcp/ketcher-chemistry') : resolveWorkspaceResourcePath(findWorkspaceRoot(), 'mcp', 'ketcher-chemistry')
  process.env.ZEROWALL_KETCHER_ROOT = bundledKetcherRoot
  const bundledBioToolsRoot = app.isPackaged ? join(process.resourcesPath, 'extensions/mcp/bio-tools') : resolveWorkspaceResourcePath(findWorkspaceRoot(), 'mcp', 'bio-tools')
  const bundledSciRoot = app.isPackaged ? join(process.resourcesPath, 'sci') : developmentStagePath('resources', 'sci')
  const bundledSkillsRoot = bundledSkillsPath()
  const bundledAssets: { bioToolsRoot?: string; ketcherRoot?: string; sciRoot?: string; skillsRoot?: string } = {}
  for (const [key, path] of [
    ['bioToolsRoot', bundledBioToolsRoot], ['ketcherRoot', bundledKetcherRoot],
    ['sciRoot', bundledSciRoot], ['skillsRoot', bundledSkillsRoot],
  ] as const) {
    try { await access(path); bundledAssets[key] = path }
    catch (error) { if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error }
  }
  process.env.ZEROWALL_BIO_TOOLS_ROOT = bundledBioToolsRoot
  process.env.ZEROWALL_SCI_ROOT = bundledSciRoot
  // Compatibility for older bundled plugins and already-running sessions.
  process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT = mcpEnvironmentRoot
  // BrainGlobe resolves current.json for each job. Do not freeze a managed
  // snapshot into an inherited environment variable across updates. All
  // scientific engines resolve this same shared runtime; external Python
  // interpreters are never accepted as a profile override.
  // Managed Python operations pass the configured mirror explicitly. Do not
  // mutate the user's global pip.ini; it may belong to another project.
  // Do not block the entire desktop when the OS credential provider is not
  // available (for example, a packaged smoke run in a headless profile).
  // CredentialVault still receives the safeStorage callbacks and will fail
  // closed when a caller attempts to persist a secret; the UI and offline
  // runtime can continue to start and report that limitation explicitly.
  const encryptionAvailable = safeStorage.isEncryptionAvailable()
  if (!encryptionAvailable) {
    console.warn('Operating-system credential encryption is unavailable; secret persistence is disabled until it becomes available.')
  }
  const credentialVault = new CredentialVault(join(userData, 'credentials', 'vault.json'), {
    encrypt: (value) => safeStorage.encryptString(value),
    decrypt: (value) => safeStorage.decryptString(value),
  })
  let mcpEnvironment!: PythonUpdaterService
  const harnessRuntime = new HarnessRuntime({
    dshEntryPath: dshEntryPath(),
    nodeExecutablePath: nodeExecutablePath(),
    nodeEntryPath: nodeEntryPath(),
    nodeResolverPath: nodeResolverPath(),
    runtimeModulesPath: runtimeModulesPath(),
    runtimeAnchorPath: runtimeAnchorPath(),
    // Source Electron's test launcher may not provide npm_node_execpath;
    // in that case process.execPath is Electron itself and must be switched
    // into its Node-compatible mode for the embedded Harness child.
    runAsNode: app.isPackaged || nodeExecutablePath() === process.execPath,
    dshPatchPath: app.isPackaged ? resourcePath('zerowall.patch.yml') : developmentStagePath('resources', 'zerowall-core.patch.yml'),
    userDataPath: userData,
    dshHome: join(userData, 'harness'),
    userSkillsPath: join(userData, 'harness', 'zerowall-skills', 'enabled'),
    researchDbPath: join(userData, 'research', 'zerowall-research.sqlite'),
    bundledSkillsPath: bundledSkillsPath(),
    mcpEnvironmentRoot,
    brandIconPath: brandIconPath(),
    logPath: join(app.getPath('logs'), 'harness.log'),
    portPath: join(userData, 'harness', 'endpoint-port.txt'),
    launchProcess: (executable, args, options) => spawn(executable, args, options) as HarnessChildProcess,
    onChildStarted: (child) => {
      managementChild = child
      const managementListener = (message: unknown): void => {
        if (!message || typeof message !== 'object') return
        const response = message as { type?: string; id?: string; result?: unknown; error?: string }
        if (response.type !== 'zerowall:management:result' || !response.id) return
        const pending = managementRequests.get(response.id)
        managementRequests.delete(response.id)
        if (response.error) pending?.reject(new Error(response.error)); else pending?.resolve(response.result)
      }
      child.on('message', managementListener)
      const disposeCredential = attachCredentialBroker(child, credentialVault)
      const disposeDesktop = attachDesktopBridge(child)
      const disposePython = attachPythonBroker(child, () => mcpEnvironment)
      return () => {
        child.off('message', managementListener)
        if (managementChild === child) managementChild = undefined
        for (const [id, pending] of managementRequests) { pending.reject(new Error('Host restarted')); managementRequests.delete(id) }
        disposeCredential(); disposeDesktop(); disposePython()
      }
    },
    onChanged: (snapshot) => {
      // Profile repair/recovery may already start and health-check this Host
      // before the normal startup tail runs. Remember the ready transition,
      // because a later start() replaces DSH's authenticated web token while
      // the renderer may already be connected to the previous URL.
      if (snapshot.phase === 'ready') runtimeReachedReady = true
      if (snapshot.phase === 'ready' && navigation === undefined) {
        navigation = showHarness(snapshot).catch(failStartup).finally(() => { navigation = undefined })
      }
      if (snapshot.phase === 'failed' && !quitting) void failStartup(snapshot.message)
    },
  })
  runtime = harnessRuntime

  const mcpEnvironmentLogPath = join(app.getPath('logs'), 'mcp-environment.log')
  const pythonCheckRecordPath = join(userData, 'updates', 'python-check.json')
  let pythonNotificationQueue = Promise.resolve()
  await mkdir(dirname(mcpEnvironmentLogPath), { recursive: true })
  let notifiedPythonSnapshot: string | undefined
  // Thin installers use the signed remote feed. An explicitly prepared
  // offline bootstrap is used only when both local files are present.
  const bootstrapManifest = app.isPackaged
    ? join(process.resourcesPath, 'python', 'base-manifest.json')
    : developmentStagePath('python-base-3.12.10', 'latest.json')
  const bootstrapArchive = app.isPackaged
    ? join(process.resourcesPath, 'python', 'base-runtime.zip')
    : developmentStagePath('python-base-3.12.10', 'zerowall-python-windows-x64-3.12.10.zip')
  const bootstrapAvailable = (await Promise.all([bootstrapManifest, bootstrapArchive].map(file => access(file).then(() => true, () => false)))).every(Boolean)
  mcpEnvironment = new PythonUpdaterService({
    generationMode: true,
    coordinateHost: true,
    root: mcpEnvironmentRoot,
    runtimeRoot: pythonLocation.runtimeRoot,
    settingsPath: dirname(pythonLocation.locationPath),
    ...(app.isPackaged ? { updaterWorkerPath: join(process.resourcesPath, 'python-updater', 'python-updater-worker.js') } : {}),
    ...(bootstrapAvailable ? { bundledManifestPath: bootstrapManifest, bundledArchivePath: bootstrapArchive } : {}),
    bundledAssets,
    manifestUrl: process.env.ZEROWALL_PYTHON_MANIFEST ?? process.env.ZEROWALL_MCP_ENVIRONMENT_MANIFEST ?? 'https://zerowall.chengxunkeji.cn/stable/zerowall-python-bootstrap/windows-x64/1.5.1/manifest.json',
    publicKey: process.env.ZEROWALL_MCP_ENVIRONMENT_PUBLIC_KEY ?? MCP_ENVIRONMENT_PUBLIC_KEY,
    publicKeys: MCP_ENVIRONMENT_KEYRING,
    diagnosticPath: mcpEnvironmentLogPath,
    publish: status => {
      void appendFile(mcpEnvironmentLogPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...mcpEnvironmentDiagnostic(status) })}\n`, 'utf8').catch(() => undefined)
      const window = mainWindow
      if (window !== undefined && !window.isDestroyed()) window.webContents.send('desktop:mcp-environment:status-changed', status)
      if (status.updateAvailable && status.onlineEnvironmentVersion) {
        const signature = `${status.onlineEnvironmentVersion}:${status.onlineContentRevision ?? 'unknown'}`
        pythonNotificationQueue = pythonNotificationQueue.then(async () => {
          const previous = await readResourceCheckRecord(pythonCheckRecordPath)
          if (previous.lastNotifiedSignature === signature) return
          notifications.show({ title: 'ZeroWall Python 环境有可用更新', body: `科研环境 ${status.onlineEnvironmentVersion} 可更新。打开 Python 环境管理查看变更并手动安装。`, tag: 'python-update' })
          await writeResourceCheckRecord(pythonCheckRecordPath, { lastCheckedAt: Date.now(), lastNotifiedSignature: signature })
        }).catch(error => console.warn('Python update notification could not be recorded:', error instanceof Error ? error.message : 'unknown error'))
      }
      const snapshot = status.packageInventory?.snapshotId
      if (status.updated && snapshot && snapshot !== notifiedPythonSnapshot) {
        notifiedPythonSnapshot = snapshot
        if (Notification.isSupported()) new Notification({ title: 'Python 环境已更新', body: `科研环境 ${status.activeEnvironment?.environmentVersion ?? ''} 已生效，依赖清单已同步。`, silent: true }).show()
      }
    },
  })
  const pythonSync = new PythonSyncService({
    updater: mcpEnvironment,
    root: mcpEnvironmentRoot,
    keys: MCP_ENVIRONMENT_KEYRING,
    applicationVersion: app.getVersion(),
    feedUrl: process.env.ZEROWALL_PYTHON_DEPENDENCY_MANIFEST ?? 'https://zerowall.chengxunkeji.cn/stable/zerowall-science-python/windows-x64/latest.json',
    bundledManifestPath: app.isPackaged ? join(process.resourcesPath, 'python', 'dependency-manifest.json') : resolveWorkspaceResourcePath(findWorkspaceRoot(), 'python', 'dependency-manifest.json'),
    bundledCoreManifestPath: app.isPackaged ? join(process.resourcesPath, 'python', 'core-dependency-manifest.json') : resolveWorkspaceResourcePath(findWorkspaceRoot(), 'python', 'core-dependency-manifest.json'),
    coreFeedUrl: process.env.ZEROWALL_PYTHON_CORE_MANIFEST ?? process.env.ZEROWALL_PYTHON_DEPENDENCY_MANIFEST ?? 'https://zerowall.chengxunkeji.cn/stable/zerowall-science-python/windows-x64/core.json',
  })
  const pythonApi = new PythonEnvironmentApi(mcpEnvironmentRoot, mcpEnvironment, pythonSync, pythonLocation.locationPath, app.isPackaged ? dirname(process.execPath) : undefined, pythonLocation.runtimeRoot)
  pythonEnvironmentApi = pythonApi
  mcpEnvironment.setEnvironmentHandler(request => pythonApi.request(request))
  const commandRoot = app.isPackaged ? join(process.resourcesPath, 'commands') : join(findWorkspaceRoot(), 'tools/commands')
  const { initializeProfile, inspectProfile } = await import(pathToFileURL(join(commandRoot, 'profile.mjs')).href)
  const defaults = JSON.parse(await readFile(app.isPackaged ? join(commandRoot, 'default-plugins.json') : developmentStagePath('commands', 'default-plugins.json'), 'utf8')) as string[]
  const bundledPlugins = JSON.parse(await readFile(app.isPackaged ? join(commandRoot, 'bundled-plugins.json') : developmentStagePath('commands', 'bundled-plugins.json'), 'utf8')) as Array<{ id: string; version?: string; managed?: boolean; core?: boolean; desktop?: { min?: string; max?: string }; dsh?: { min?: string; max?: string } }>
  const dshHome = join(userData, 'harness')
  const dshIdentity = JSON.parse(await readFile(app.isPackaged ? join(process.resourcesPath, 'licenses/deepseek-harness.version.json') : join(findWorkspaceRoot(), 'config/deepseek-harness/upstream.json'), 'utf8')) as { version: string; commit: string }
  // Core DSH overlays are already inserted by zerowall.patch.yml. Only
  // managed ZeroWall plugins belong in the user profile; loading both layers
  // would register Univer/Sidebar services twice after a 7.5 migration.
  await initializeProfile(dshHome, defaults, bundledPlugins)
  const profileDoctor = () => inspectProfile(dshHome, bundledPlugins, { desktopVersion: app.getVersion(), dshVersion: dshIdentity.version })
  const callHost = (operation: string, args: unknown[]): Promise<unknown> => {
    if (!managementChild?.connected) return Promise.reject(new Error('Host is not ready'))
    const child = managementChild
    return new Promise((accept, reject) => {
      const id = randomUUID()
      const timer = setTimeout(() => { managementRequests.delete(id); reject(new Error('Plugin management timed out')) }, operation === 'host.health' || /\.(?:list|sources|get)$/u.test(operation) ? 4_500 : 30_000)
      managementRequests.set(id, { resolve: result => { clearTimeout(timer); accept(result) }, reject: error => { clearTimeout(timer); reject(error) } })
      child.send({ type: 'zerowall:management', id, operation, args })
    })
  }
  const startHost = async (): Promise<void> => {
    await harnessRuntime.start(join(userData, 'workspace'))
    if (harnessRuntime.snapshot().phase !== 'ready') throw new Error('Host activation failed')
    const deadline = Date.now() + 30_000
    do {
      const health = await callHost('host.health', []) as { ready: boolean; entries: Array<{ state: number }> }
      if (health.ready) return
      if (health.entries.some(entry => entry.state === 3)) break
      await new Promise(accept => setTimeout(accept, 250))
    } while (Date.now() < deadline)
    throw new Error('A configured ZeroWall plugin could not activate; restoring the previous profile')
  }
  const runPlugin = (args: string[], profile = 'web'): Promise<unknown> => new Promise((accept, reject) => {
    const child = spawn(nodeExecutablePath(), ['--expose-internals', join(commandRoot, 'dsh.mjs'), 'plugin', '--profile', profile, ...args], {
      windowsHide: true, env: { ...process.env, DSH_HOME: dshHome, ...(app.isPackaged ? { ELECTRON_RUN_AS_NODE: '1' } : {}) }, stdio: 'pipe',
    })
    let output = ''
    child.stdout.on('data', chunk => { output = (output + String(chunk)).slice(-65536) })
    child.stderr.resume()
    child.on('error', reject)
    child.on('exit', code => code === 0 ? accept({ code, output }) : reject(new Error('DSH package operation failed; inspect profile diagnostics')))
  })
  const { createResourceManager } = await import(pathToFileURL(join(commandRoot, 'resource-manager.mjs')).href)
  const keys = JSON.parse(await readFile(app.isPackaged ? join(commandRoot, 'trusted-keys.json') : join(findWorkspaceRoot(), 'config/catalogs/trusted-keys.json'), 'utf8'))
  const resources = createResourceManager({ home: dshHome, keys, defaultPlugins: defaults, bundledPlugins, runtimeModules: app.isPackaged ? join(process.resourcesPath, 'app.asar/node_modules') : developmentStagePath('runtime', 'node_modules'), target: { desktopVersion: app.getVersion(), dshVersion: dshIdentity.version, dshCommit: dshIdentity.commit, platform: process.platform, architecture: process.arch }, runPlugin,
    applyPython: async (entry: { role: string }, file: string) => {
      if (entry.role !== 'dependency-manifest') throw new Error('Unsupported Python resource')
      await mcpEnvironment.ensureReady()
      await pythonSync.importManifest(file)
      const plan = await pythonSync.previewSync()
      return pythonSync.applySync(plan.planId, plan.manifestRevision, true)
    },
    stopHost: () => harnessRuntime.stop(), startHost, callHost, yaml: createRequire(app.isPackaged ? join(process.resourcesPath, 'app.asar/package.json') : join(findWorkspaceRoot(), 'package.json'))('yaml') })
  await resources.recover()
  type ResourceKind = 'plugin' | 'skill' | 'mcp'
  type ResourceJob = { taskId: string; kind: ResourceKind; id?: string; action: string; source?: string; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'; phase?: string; progress?: number; oldVersion?: string; newVersion?: string; retries: number; retryOf?: string; cancelRequested?: boolean; error?: string; result?: unknown; createdAt: string; updatedAt: string }
  const resourceJobRoot = join(userData, 'harness', 'resources', 'jobs')
  const resourceJobs = new Map<string, ResourceJob>()
  const safeResourceError = (error: unknown): string => {
    const message = error instanceof Error ? error.message : 'Resource operation failed'
    return message.replace(/(token|secret|password|authorization|api[-_]?key)\s*[:=]\s*[^\s,;]+/giu, '$1=[redacted]').slice(0, 500)
  }
  const persistResourceJob = async (job: ResourceJob): Promise<void> => {
    resourceJobs.set(job.taskId, job)
    await mkdir(resourceJobRoot, { recursive: true })
    const file = join(resourceJobRoot, `${job.taskId}.json`)
    const tmp = `${file}.${randomUUID()}.tmp`
    await writeFile(tmp, JSON.stringify(job, null, 2), { mode: 0o600 })
    await rename(tmp, file)
    if (mainWindow !== undefined && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:resource-job', job)
  }
  const resourceAction = async (kind: ResourceKind, action: string, id?: string, source?: string): Promise<unknown> => {
    if (action === 'check') return resources.check(kind, source)
    if (action === 'list') return resources.list(kind)
    if (action === 'update') {
      if (id === undefined) return resources.update(kind, source)
      if (kind === 'plugin') return resources.plugin(id, source)
      return resources.resource(kind, id, source)
    }
    if (action === 'rollback') {
      if (kind === 'plugin') return resources.rollbackPlugin(id)
      if (kind === 'mcp') return resources.rollbackMcp(id)
      return callHost('skill.rollback', [id])
    }
    if (kind === 'plugin' && ['install', 'import', 'remove', 'enable', 'disable', 'repair', 'pin', 'unpin'].includes(action)) {
      if ((action === 'install' || action === 'import') && id !== undefined) {
        if (source && !/^https?:\/\//u.test(source) && /\.(?:tgz|tar\.gz|tar)$/iu.test(source)) return resources.mutate(['add', source])
        return resources.plugin(id, source)
      }
      if (action === 'repair') return resources.mutate(['install'])
      if (id === undefined) throw new Error('Resource identity is required')
      if (action === 'pin' || action === 'unpin') return resources.pinPlugin(id, action === 'pin')
      const acknowledgment = source && ['disable', 'remove'].includes(action) ? JSON.parse(source) as { dependents?: unknown } : undefined
      const dependents = Array.isArray(acknowledgment?.dependents) && acknowledgment.dependents.every(value => typeof value === 'string') ? acknowledgment.dependents as string[] : []
      if (action === 'enable') return resources.setPluginEnabled(id, true)
      if (action === 'disable') return resources.setPluginEnabled(id, false, dependents)
      return resources.mutate([action, id], dependents)
    }
    if (kind === 'skill') {
      if (action === 'list') return callHost('skill.list', [])
      if (action === 'remove') return callHost('skill.remove', [id])
      if (action === 'import') return callHost('skill.import', [{ sourcePath: source ?? id }])
      if (action === 'enable' || action === 'disable') return callHost('skill.enable', [id, action === 'enable'])
    }
    if (kind === 'mcp') {
      if (action === 'list') return callHost('mcp.list', [])
      if (action === 'remove') return callHost('mcp.remove', [id])
      if (action === 'import' && source) {
        const template = JSON.parse(await readFile(source, 'utf8'))
        return callHost('mcp.add', [template])
      }
      if (action === 'restart') return callHost('mcp.restart', [id])
      if (action === 'enable' || action === 'disable') return callHost('mcp.edit', [{ id, changes: { enabled: action === 'enable' } }])
    }
    throw new Error(`Unsupported resource action: ${kind}/${action}`)
  }
  const startResourceJob = async (kind: ResourceKind, action: string, id?: string, source?: string, retryOf?: string, retries = 0): Promise<{ taskId: string }> => {
    if (!['plugin', 'skill', 'mcp'].includes(kind) || !/^[a-z][a-z-]{1,30}$/u.test(action)) throw new Error('Invalid resource job')
    const now = new Date().toISOString()
    const taskId = randomUUID()
    const oldVersion = id ? (await resources.list(kind).catch(() => undefined))?.resources.find((item: { id: string; installedVersion?: string }) => item.id === id)?.installedVersion : undefined
    const job: ResourceJob = { taskId, kind, ...(id === undefined ? {} : { id }), ...(source === undefined ? {} : { source }), action, status: 'queued', phase: 'queued', progress: 0, oldVersion, retries, ...(retryOf === undefined ? {} : { retryOf }), createdAt: now, updatedAt: now }
    await persistResourceJob(job)
    void (async () => {
      const queued = resourceJobs.get(taskId)
      if (queued?.cancelRequested || queued?.status === 'cancelled') { await persistResourceJob({ ...job, status: 'cancelled', phase: 'cancelled', updatedAt: new Date().toISOString() }); return }
      const running: ResourceJob = { ...job, status: 'running', phase: 'preparing', progress: 10, updatedAt: new Date().toISOString() }
      await persistResourceJob(running)
      try {
        await persistResourceJob({ ...running, phase: 'applying', progress: 35, updatedAt: new Date().toISOString() })
        const result = await resourceAction(kind, action, id, source)
        const latest = resourceJobs.get(taskId)
        const newVersion = id ? (await resources.list(kind).catch(() => undefined))?.resources.find((item: { id: string; installedVersion?: string }) => item.id === id)?.installedVersion : undefined
        await persistResourceJob({ ...running, status: 'succeeded', phase: 'health-check', progress: 90, newVersion, result, updatedAt: new Date().toISOString() })
        if (latest?.cancelRequested) await persistResourceJob({ ...running, status: 'succeeded', phase: 'complete', progress: 100, newVersion, result, error: 'Cancellation requested after activation; result retained', updatedAt: new Date().toISOString() })
        else await persistResourceJob({ ...running, status: 'succeeded', phase: 'complete', progress: 100, newVersion, result, updatedAt: new Date().toISOString() })
      } catch (error) {
        const latest = resourceJobs.get(taskId)
        if (latest?.status === 'cancelled') return
        await persistResourceJob({ ...running, status: 'failed', phase: 'failed', progress: 100, error: safeResourceError(error), updatedAt: new Date().toISOString() })
      }
    })()
    return { taskId }
  }
  const retryResourceJob = async (taskId: string): Promise<{ taskId: string }> => {
    const previous = resourceJobs.get(taskId)
    if (previous === undefined || !['failed', 'cancelled'].includes(previous.status)) throw new Error('Only failed or cancelled resource tasks can be retried')
    return startResourceJob(previous.kind, previous.action, previous.id, previous.source, previous.taskId, (previous.retries ?? 0) + 1)
  }
  const loadResourceJobs = async (): Promise<void> => {
    const entries = await readdir(resourceJobRoot, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      try {
        const job = JSON.parse(await readFile(join(resourceJobRoot, entry.name), 'utf8')) as ResourceJob
        if (job.status === 'queued' || job.status === 'running') { job.status = 'failed'; job.phase = 'interrupted'; job.error = 'Desktop restarted before the resource task completed'; job.retries = job.retries ?? 0; job.updatedAt = new Date().toISOString(); await persistResourceJob(job) }
        resourceJobs.set(job.taskId, job)
      } catch { /* incomplete receipt */ }
    }
  }
  await loadResourceJobs()
  let commandQueue: Promise<unknown> = Promise.resolve()
  const dispatchCommand = async (request: { operation: string; args: unknown[] }): Promise<unknown> => {
    if (request.operation === 'profile.doctor') return profileDoctor()
    if (request.operation === 'python.status') return mcpEnvironment.pythonInfo()
    if (request.operation === 'python.install') return mcpEnvironment.updateForUser()
    if (request.operation === 'python.update') return resources.resource('python', 'science-dependencies', request.args[0])
    if (request.operation === 'python.rollback') return mcpEnvironment.rollback()
    if (request.operation === 'update') return autoUpdater.checkForUpdates().then(result => ({ updateInfo: result?.updateInfo }))
    if (request.operation === 'resource.plugin') return resources.plugin(String(request.args[0]), request.args[1] === undefined ? undefined : String(request.args[1]))
    if (request.operation === 'resource.catalog.check') return resources.check(String(request.args[0]) as ResourceKind, request.args[1] === undefined ? undefined : String(request.args[1]))
    if (request.operation === 'resource.catalog.status') return Promise.all((['plugin', 'skill', 'mcp'] as ResourceKind[]).map(kind => resources.list(kind)))
    if (request.operation === 'resource.catalog.check-all') return Promise.all((['plugin', 'skill', 'mcp'] as ResourceKind[]).map(kind => resources.check(kind)))
    if (request.operation === 'resource.job.start') return startResourceJob(String(request.args[0]) as ResourceKind, String(request.args[1]), request.args[2] === undefined ? undefined : String(request.args[2]), request.args[3] === undefined ? undefined : String(request.args[3]))
    if (request.operation === 'resource.job.get' || request.operation === 'resource.job.status') return resourceJobs.get(String(request.args[0]))
    if (request.operation === 'resource.job.list') return [...resourceJobs.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    if (request.operation === 'resource.job.retry') return retryResourceJob(String(request.args[0]))
    if (request.operation === 'resource.job.cancel') {
      const job = resourceJobs.get(String(request.args[0]))
      if (job?.status === 'queued') await persistResourceJob({ ...job, status: 'cancelled', phase: 'cancelled', updatedAt: new Date().toISOString() })
      else if (job?.status === 'running') await persistResourceJob({ ...job, phase: 'cancellation-requested', cancelRequested: true, updatedAt: new Date().toISOString() })
      return resourceJobs.get(String(request.args[0]))
    }
    if (request.operation === 'resource.rollback') return request.args[0] === 'plugin' ? resources.rollbackPlugin(String(request.args[1])) : resources.rollback()
    if (request.operation === 'resource.mcp.rollback') return resources.rollbackMcp(request.args[0])
    if (request.operation === 'resource.import') return resources.resource(...request.args)
    if (request.operation === 'resource.update') return resourceAction(String(request.args[0]) as ResourceKind, 'update', request.args[1] === undefined ? undefined : String(request.args[1]))
    if (request.operation.startsWith('resource.plugin.')) {
      const action = request.operation.slice('resource.plugin.'.length)
      const id = request.args[0] === undefined ? undefined : String(request.args[0])
      if (action === 'list') return resources.list('plugin')
      if (action === 'install') return resources.plugin(id ?? (() => { throw new Error('Plugin identity is required') })(), request.args[1] === undefined ? undefined : String(request.args[1]))
      if (action === 'update') return id === undefined ? resources.update('plugin', request.args[1] === undefined ? undefined : String(request.args[1])) : resources.plugin(id, request.args[1] === undefined ? undefined : String(request.args[1]))
      if (action === 'rollback') return resources.rollbackPlugin(id ?? (() => { throw new Error('Plugin identity is required') })())
      return resourceAction('plugin', action, id)
    }
    if (request.operation.startsWith('resource.skill.')) {
      const action = request.operation.slice('resource.skill.'.length)
      const id = request.args[0] === undefined ? undefined : String(request.args[0])
      if (action === 'list') return callHost('skill.list', [])
      if (action === 'import') return resourceAction('skill', 'import', id, request.args[1] === undefined ? undefined : String(request.args[1]))
      if (action === 'update') return id === undefined ? resources.update('skill', request.args[1] === undefined ? undefined : String(request.args[1])) : resources.resource('skill', id, request.args[1] === undefined ? undefined : String(request.args[1]))
      if (action === 'rollback') return callHost('skill.rollback', [id])
      return resourceAction('skill', action, id)
    }
    if (request.operation.startsWith('resource.mcp.')) {
      const action = request.operation.slice('resource.mcp.'.length)
      const id = request.args[0] === undefined ? undefined : String(request.args[0])
      if (action === 'list') return callHost('mcp.list', [])
      if (action === 'import') return resourceAction('mcp', 'import', id, request.args[1] === undefined ? undefined : String(request.args[1]))
      if (action === 'update') return id === undefined ? resources.update('mcp', request.args[1] === undefined ? undefined : String(request.args[1])) : resources.resource('mcp', id, request.args[1] === undefined ? undefined : String(request.args[1]))
      if (action === 'rollback') return resources.rollbackMcp(id ?? (() => { throw new Error('MCP identity is required') })())
      return resourceAction('mcp', action, id)
    }
    if (request.operation === 'mcp.logs') {
      const log = await readFile(join(userData, 'logs/harness.log'), 'utf8').catch(() => '')
      return { logFile: join(userData, 'logs/harness.log'), events: log.split(/\r?\n/).filter(line => line.includes('[zws-mcp]')).slice(-100).flatMap(line => { try { const event = JSON.parse(line.split('[zws-mcp] ')[1]!); return [{ operation: event.operation, status: event.status, time: event.time }] } catch { return [] } }) }
    }
    if (request.operation === 'host.restart') { await harnessRuntime.start(join(userData, 'workspace')); return { restarted: true } }
    if (request.operation === 'plugin.run') {
      const args = request.args
      if (!args.every(value => typeof value === 'string') || !['list', 'add', 'remove', 'update', 'install'].includes(String(args[0]))) throw new Error('Invalid plugin command')
      const file = join(dshHome, 'profiles/web/package.json')
      const manifest = JSON.parse(await readFile(file, 'utf8'))
      if (args[0] === 'list') {
        const selectionFile = join(dshHome, 'resources/plugins/selection.json')
        let selection: { removed?: unknown[]; disabled?: unknown[] } = {}
        try { selection = JSON.parse(await readFile(selectionFile, 'utf8')) as typeof selection } catch { /* optional selection state */ }
        const removed = new Set((selection.removed ?? []).filter((id): id is string => typeof id === 'string'))
        const known = [...new Set([...(manifest.dsh?.profile?.bundles ?? []), ...defaults, ...bundledPlugins.map(item => item.id)])].filter(id => !removed.has(id))
        const profileBundles = new Set(manifest.dsh?.profile?.bundles ?? [])
        const bundledIds = new Set(bundledPlugins.map(item => item.id))
        return { bundles: known, dependencies: manifest.dependencies ?? {}, resources: known.map(id => ({ id, source: profileBundles.has(id) ? 'profile' : bundledIds.has(id) ? 'bundled' : 'runtime', enabled: !(selection.disabled ?? []).includes(id) })) }
      }
      return resources.mutate(args as string[])
    }
    return callHost(request.operation, request.args)
  }
  const stopCommandServer = await startCommandServer(userData, request => {
    const result = commandQueue.then(() => dispatchCommand(request))
    commandQueue = result.catch(() => {})
    return result
  })
  app.once('before-quit', () => { void stopCommandServer() })
  const updates = new DesktopUpdateController({
    updater: autoUpdater,
    enabled: app.isPackaged && identity.channel === 'stable',
    currentVersion: app.getVersion(),
    validateInstaller: process.platform === 'win32' ? info => verifyDownloadedArtifact(info, app.getVersion()) : undefined,
    beforeInstall: async () => {
      await stopBeforeExit(() => runtime?.stop() ?? Promise.resolve(), 6_000)
      restarting = false
      quitting = true
      tray?.destroy()
      tray = undefined
    },
    publish: status => {
      const window = mainWindow
      if (window !== undefined && !window.isDestroyed()) window.webContents.send('desktop:update-status', status)
    },
  })

  // The stable channel is the only user-facing update channel. Configure it
  // before the first scheduled/manual check so both installer and unpacked
  // desktop builds use the same Qiniu metadata path.
  if (app.isPackaged && identity.channel === 'stable') {
    autoUpdater.setFeedURL({ provider: 'generic', url: STABLE_UPDATE_FEED_URL })
    if (process.platform === 'win32' && autoUpdater instanceof updaterPackage.NsisUpdater) {
      autoUpdater.installDirectory = dirname(process.execPath)
    }
  }

  ipcMain.handle('desktop:info', (): DesktopInfo => ({ version: app.getVersion(), platform: process.platform, architecture: process.arch }))
  const notifications = new DesktopNotifications({
    supported: () => Notification.isSupported(),
    create: options => new Notification(options),
    icon: desktopIconPath(),
    activate: sessionId => {
      showMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:notification-activated', sessionId)
    },
    failed: message => {
      console.warn('[desktop-notification]', message)
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:notification-failed', message)
    },
  })
  ipcMain.handle('desktop:show-notification', (event, input: unknown) => {
    const window = mainWindow
    if (!window || window.isDestroyed() || event.sender !== window.webContents
      || event.senderFrame !== window.webContents.mainFrame) return false
    const snapshot = harnessRuntime.snapshot()
    if (snapshot.phase !== 'ready' || !snapshot.url) return false
    try {
      if (new URL(event.senderFrame.url).origin !== new URL(snapshot.url).origin) return false
    } catch { return false }
    return notifications.show(input)
  })
  ipcMain.handle('desktop:choose-directory', async () => {
    const options: OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] }
    const result = mainWindow && !mainWindow.isDestroyed()
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  ipcMain.handle('desktop:choose-science-file', async (_event, requested: unknown) => {
    const all = ['png', 'jpg', 'jpeg', 'pgm', 'tif', 'tiff', 'svs', 'ndpi', 'fasta', 'fa', 'fna', 'ffn', 'frn', 'gb', 'gbk', 'scf', 'ab1', 'pdb', 'cif', 'mmcif', 'sdf', 'fcs', 'h5ad']
    const extensions = Array.isArray(requested)
      ? [...new Set(requested.map(value => String(value).replace(/^\./u, '').toLowerCase()).filter(value => all.includes(value)))]
      : all
    const options: OpenDialogOptions = { properties: ['openFile'], filters: [
      { name: '当前查看器支持的科研文件', extensions: extensions.length ? extensions : all },
    ] }
    const result = mainWindow && !mainWindow.isDestroyed() ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  ipcMain.handle('desktop:reveal-path', (_event, path: unknown) => {
    shell.showItemInFolder(resolveRevealPath(path))
    return true
  })
  ipcMain.handle('desktop:open-folder', async (_event, value: unknown) => {
    if (typeof value !== 'string' || !isAbsolute(value)) return false
    try {
      const canonical = await realpath(value)
      if (!(await stat(canonical)).isDirectory()) return false
      const error = await shell.openPath(canonical)
      return error === ''
    } catch {
      return false
    }
  })
  ipcMain.handle('desktop:open-python-terminal', async event => {
    if (process.platform !== 'win32' || event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame) return false
    try {
      const info = await mcpEnvironment?.pythonInfo()
      // The interpreter can be useful for diagnosis and pip repair even when
      // the asynchronous core dependency layer has not completed yet.
      const target = managedPythonTerminalPaths(info, pythonLocation.runtimeRoot)
      const runtimeRoot = await realpath(target.runtimeRoot)
      const executable = await realpath(target.executable)
      const relativeExecutable = relative(runtimeRoot, executable)
      if (!relativeExecutable || relativeExecutable.startsWith('..') || isAbsolute(relativeExecutable) || basename(executable).toLowerCase() !== 'python.exe' || !(await stat(executable)).isFile()) return false
      const launch = createPythonTerminalLaunch(runtimeRoot, executable, process.env)
      // Electron has no interactive stdin. Write a tiny, user-scoped launcher
      // under the canonical runtime and let Windows create a real console for
      // it. The PowerShell script sets PATH and defines pip/python wrappers,
      // so the terminal remains bound to this managed interpreter after the
      // initial REPL is closed.
      const shellDirectory = join(runtimeRoot, '.zerowall')
      await mkdir(shellDirectory, { recursive: true })
      const scriptPath = join(shellDirectory, 'python-shell.ps1')
      const commandPath = join(shellDirectory, 'python-shell.cmd')
      // Windows PowerShell 5 treats UTF-8 without a BOM as the active ANSI
      // code page. Include a BOM so managed paths containing non-ASCII user
      // names survive script parsing.
      await writeFile(scriptPath, `\uFEFF${launch.args[3] ?? ''}\r\n`, { encoding: 'utf8' })
      const quote = (value: string): string => `"${value.replaceAll('"', '""')}"`
      const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      await writeFile(commandPath, `@echo off\r\nstart "ZeroWall Science Python" ${quote(powershell)} -NoLogo -NoProfile -NoExit -ExecutionPolicy Bypass -File ${quote(scriptPath)}\r\n`, { encoding: 'utf8' })
      const error = await shell.openPath(commandPath)
      return error === ''
    } catch { return false }
  })
  ipcMain.handle('desktop:open-pptx', async (_event, value: unknown) => {
    if (typeof value !== 'string' || !isAbsolute(value) || extname(value).toLocaleLowerCase() !== '.pptx') return false
    try {
      const canonical = await realpath(value)
      const info = await stat(canonical)
      if (!info.isFile() || info.size === 0 || info.size > 500 * 1024 * 1024) return false
      const normalized = canonical.replaceAll('\\', '/').toLocaleLowerCase()
      if (!normalized.includes('/.zerowall/')) return false
      return (await shell.openPath(canonical)) === ''
    } catch { return false }
  })
  ipcMain.handle('desktop:clipboard-copy-file', async (_event, input: DesktopClipboardFile) => {
    if (process.platform !== 'win32') return false
    if (typeof input?.name !== 'string' || typeof input?.mediaType !== 'string' || typeof input?.data !== 'string') return false
    const data = Buffer.from(input.data, 'base64')
    if (data.byteLength === 0 || data.byteLength > 50 * 1024 * 1024 || data.toString('base64') !== input.data) return false
    const name = input.name.slice(Math.max(input.name.lastIndexOf('/'), input.name.lastIndexOf('\\')) + 1)
      .replace(/[\u0000-\u001f<>:"/\\|?*]/gu, '_').trim().slice(0, 180) || 'attachment'
    const directory = join(app.getPath('temp'), 'ZeroWall Science Clipboard', randomUUID())
    await mkdir(directory, { recursive: true })
    const path = join(directory, name)
    await writeFile(path, data, { flag: 'wx' })
    return copyWindowsFile(path)
  })
  const deletingSessions = new Map<string, Promise<boolean>>()
  ipcMain.handle('desktop:delete-session', async (event, input: { sessionId?: unknown; title?: unknown; language?: unknown }) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame || !validSessionId(input?.sessionId) || !runtime) return false
    const pending = deletingSessions.get(input.sessionId)
    if (pending) return pending
    const sessionId = input.sessionId
    const window = mainWindow
    const activeRuntime = runtime
    const zh = input.language !== 'en'
    const title = typeof input.title === 'string' ? input.title.slice(0, 200) : input.sessionId
    const label = (cn: string, en: string) => zh ? cn : en
    const rpc = <T>(method: string, request: object): Promise<T> =>
      sessionDeleteRpc<T>(window, activeRuntime, method, request, label('会话操作失败。', 'Session operation failed.'))
    const operation = (async () => {
    try {
      return await deleteStoredSession({
        root: join(userData, 'harness', 'sessions'), sessionId,
        prepare: () => rpc('prepareDelete', { sessionId }),
        commit: async token => { await rpc('commitDelete', { sessionId, token }) },
        abort: async token => { await rpc('abortDelete', { sessionId, token }) },
        journal: sessionDeletionJournal(join(userData, 'harness', 'session-delete-pending')),
        confirm: async () => (await dialog.showMessageBox(window, {
          type: 'warning', title: label('删除会话', 'Delete session'),
          message: label(`确定删除“${title}”？`, `Delete “${title}”?`),
          detail: label('此会话的本地记录将移至系统回收站。工作区文件和其他会话不会删除。', 'This session’s local records will move to the Recycle Bin. Workspace files and other sessions are kept.'),
          buttons: [label('取消', 'Cancel'), label('删除会话', 'Delete session')], defaultId: 0, cancelId: 0, noLink: true,
        })).response === 1,
        trash: path => shell.trashItem(path),
      })
    } catch (error) {
      await dialog.showMessageBox(window, { type: 'error', message: label('无法删除会话', 'Could not delete session'), detail: error instanceof Error ? error.message : String(error) })
      return false
    } finally { deletingSessions.delete(sessionId) }
    })()
    deletingSessions.set(sessionId, operation)
    return operation
  })
  ipcMain.handle('desktop:clipboard-copy-text', async (_event, value: unknown) => {
    if (typeof value !== 'string' || value.length > 2_000_000) return false
    try {
      await clipboard.writeText(value)
      return await clipboard.readText() === value
    } catch { return false }
  })
  ipcMain.handle('desktop:open-zotero', async (event, url: unknown) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame || !isZoteroOpenUrl(url)) return false
    try { await shell.openExternal(url); return true } catch {
      await dialog.showMessageBox(mainWindow, { type: 'error', message: '无法打开 Zotero / Could not open Zotero', detail: '请确认 Zotero 已安装，并已注册 zotero:// 链接。 / Check that Zotero is installed and handles zotero:// links.' })
      return false
    }
  })
  ipcMain.handle('desktop:save-text-file', async (event, input: { name?: unknown; text?: unknown }) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame) return false
    if (typeof input?.name !== 'string' || !/^[\w-]+\.(bib|ris|json|txt)$/.test(input.name) || typeof input.text !== 'string' || input.text.length > 2_000_000) return false
    try {
      let defaultPath = input.name
      try { defaultPath = join(app.getPath('downloads'), input.name) } catch { /* Windows may not have a Downloads known-folder mapping. */ }
      const result = await dialog.showSaveDialog(mainWindow, { defaultPath })
      if (result.canceled || !result.filePath) return false
      await writeFile(result.filePath, input.text, 'utf8')
      return true
    } catch { return false }
  })
  ipcMain.handle('desktop:clipboard-copy-image', (_event, input: { data?: unknown }) => {
    if (typeof input?.data !== 'string' || input.data.length === 0 || input.data.length > 70_000_000) return false
    try {
      const image = nativeImage.createFromBuffer(Buffer.from(input.data, 'base64'))
      if (image.isEmpty()) return false
      clipboard.writeImage(image)
      return true
    } catch { return false }
  })
  ipcMain.handle('desktop:get-update-status', () => updates.current())
  ipcMain.handle('desktop:check-for-updates', () => updates.check())
  ipcMain.handle('desktop:download-update', () => updates.download())
  ipcMain.handle('desktop:install-update', () => updates.install())
  ipcMain.handle('desktop:resource-check', (_event, kind: unknown, localOnly: unknown) => resources.check(String(kind) as ResourceKind, undefined, { localOnly: localOnly === true }))
  ipcMain.handle('desktop:resource-list', (_event, kind: unknown) => resources.list(String(kind) as ResourceKind))
  ipcMain.handle('desktop:resource-dependents', (_event, id: unknown) => resources.dependents(String(id)))
  ipcMain.handle('desktop:resource-status', async () => ({ checkedAt: new Date().toISOString(), results: await Promise.all((['plugin', 'skill', 'mcp'] as ResourceKind[]).map(kind => resources.list(kind))) }))
  ipcMain.handle('desktop:resource-update', (_event, kind: unknown, id?: unknown) => resourceAction(String(kind) as ResourceKind, 'update', typeof id === 'string' ? id : undefined))
  ipcMain.handle('desktop:resource-rollback', (_event, kind: unknown, id: unknown) => resourceAction(String(kind) as ResourceKind, 'rollback', String(id)))
  ipcMain.handle('desktop:resource-job-start', (_event, kind: unknown, action: unknown, id?: unknown, source?: unknown) => startResourceJob(String(kind) as ResourceKind, String(action), typeof id === 'string' ? id : undefined, typeof source === 'string' ? source : undefined))
  ipcMain.handle('desktop:resource-job-get', (_event, taskId: unknown) => resourceJobs.get(String(taskId)))
  ipcMain.handle('desktop:resource-job-status', (_event, taskId: unknown) => resourceJobs.get(String(taskId)))
  ipcMain.handle('desktop:resource-job-list', () => [...resourceJobs.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
  ipcMain.handle('desktop:resource-job-retry', (_event, taskId: unknown) => retryResourceJob(String(taskId)))
  ipcMain.handle('desktop:resource-job-cancel', async (_event, taskId: unknown) => {
    const job = resourceJobs.get(String(taskId))
    if (job?.status === 'queued') await persistResourceJob({ ...job, status: 'cancelled', phase: 'cancelled', updatedAt: new Date().toISOString() })
    else if (job?.status === 'running') await persistResourceJob({ ...job, phase: 'cancellation-requested', cancelRequested: true, updatedAt: new Date().toISOString() })
    return resourceJobs.get(String(taskId))
  })
    ipcMain.handle('desktop:mcp-environment:pause', () => mcpEnvironment.pause())
    ipcMain.handle('desktop:mcp-environment:rollback', () => mcpEnvironment.rollback())
    ipcMain.handle('desktop:mcp-python:preview', (_event, names: string[]) => mcpEnvironment.previewPackages(names))
    ipcMain.handle('desktop:mcp-python:apply-plan', (_event, planId: string) => mcpEnvironment.applyPackagePlan(planId))
    ipcMain.handle('desktop:mcp-environment:get-status', () => mcpEnvironment.current())
    ipcMain.handle('desktop:mcp-environment:check', () => mcpEnvironment.checkForUpdates())
    ipcMain.handle('desktop:mcp-environment:update', () => mcpEnvironment.updateForUser())
    ipcMain.handle('desktop:mcp-python:info', (_event, query?: unknown) => mcpEnvironment.pythonInfo(typeof query === 'string' ? query : ''))
  ipcMain.handle('desktop:mcp-python:install', (_event, spec?: unknown) => mcpEnvironment.installPythonPackage(typeof spec === 'string' ? spec : ''))
  ipcMain.handle('desktop:mcp-python:check-updates', (_event, names?: string[]) => mcpEnvironment.checkPythonPackageUpdates(Array.isArray(names) ? names : []))
  ipcMain.handle('desktop:mcp-python:update', (_event, names?: unknown) => mcpEnvironment.updatePythonPackages(Array.isArray(names) ? names.filter((name): name is string => typeof name === 'string') : []))
  ipcMain.handle('desktop:python-environment', (_event, request: PythonEnvironmentRequest) => pythonApi.request(request))
  ipcMain.handle('desktop:python-layer-check', (_event, layer: unknown) => {
    if (layer !== 'core' && layer !== 'science' && layer !== 'capability') throw new Error('Invalid Python dependency layer.')
    return pythonSync.checkManifest(layer as PythonDependencyLayer)
  })
  ipcMain.handle('desktop:python-layer-list', (_event, layer: unknown) => {
    if (layer !== 'core' && layer !== 'science' && layer !== 'capability') throw new Error('Invalid Python dependency layer.')
    return pythonSync.listLocal(layer as PythonDependencyLayer)
  })
  ipcMain.handle('desktop:python-layer-update', (_event, layer: unknown, capabilityId?: unknown) => {
    if (layer !== 'core' && layer !== 'science' && layer !== 'capability') throw new Error('Invalid Python dependency layer.')
    if (layer === 'capability' && (typeof capabilityId !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/u.test(capabilityId))) throw new Error('A valid capability ID is required.')
    if (layer !== 'capability' && capabilityId !== undefined) throw new Error('Capability IDs are only valid for the capability layer.')
    return pythonApi.request({ action: 'sync', layer, ...(typeof capabilityId === 'string' ? { capabilityId } : {}), confirm: true, requestId: randomUUID() })
  })
  ipcMain.handle('desktop:python-layer-task-status', (_event, taskId: unknown) => {
    if (typeof taskId !== 'string' || !/^[a-f0-9-]{36}$/u.test(taskId)) throw new Error('Invalid Python task ID.')
    return pythonApi.request({ action: 'task_status', taskId, requestId: randomUUID() })
  })
  ipcMain.handle('desktop:mcp-environment:retry', () => mcpEnvironment.retry())
  ipcMain.handle('desktop:mcp-environment:select-path', async () => {
    const result = await dialog.showOpenDialog(mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined as never, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths[0] === undefined) return mcpEnvironment.current()
    return mcpEnvironment.selectManual(result.filePaths[0])
  })

  const repair = await resources.repairOffline(app.isPackaged ? join(process.resourcesPath, 'offline-profile') : developmentStagePath('offline-profile'))
  if (repair.blocked?.length) notifications.show({ title: '默认插件需要修复', body: '固定版本缺失。请在扩展中心导入对应版本或明确解除固定；用户配置已保留。', tag: 'profile-repair' })
  await launch()
  await navigation
  const updateRecordPath = join(userData, 'updates', 'last-check.json')
  const runScheduledUpdateCheck = async (): Promise<void> => {
    const record = await readUpdateCheckRecord(updateRecordPath)
    if (!isUpdateCheckDue(record.lastCheckedAt)) return
    // Persist the attempt before contacting the feed. A failed background
    // check remains retryable manually, but cannot retry-loop on startup.
    await writeUpdateCheckRecord(updateRecordPath, Date.now())
    await updates.check()
  }
  const updateTimer = setTimeout(() => { if (startup.phase === 'ready') void runScheduledUpdateCheck().catch(() => undefined) }, 15_000)
  updateTimer.unref()
  const updateInterval = setInterval(() => { void runScheduledUpdateCheck().catch(() => undefined) }, UPDATE_CHECK_INTERVAL_MS)
  updateInterval.unref()
  // Extension resource catalogs are checked only by explicit user action.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && runtime !== undefined) void showHarness(runtime.snapshot())
    else showMainWindow()
  })
}).catch(failStartup)

app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  const activeRuntime = runtime
  void stopBeforeExit(() => activeRuntime?.stop() ?? Promise.resolve(), 6_000).then(async () => {
    await pythonEnvironmentApi?.shutdown()
  }).catch(error => {
    console.warn('Python task flush during shutdown:', error instanceof Error ? error.message : String(error))
  }).finally(() => {
    tray?.destroy()
    tray = undefined
    if (restarting) app.relaunch()
    app.exit(0)
  })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
