import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { appendFile, cp, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, nativeTheme, Notification, safeStorage, shell, Tray, type OpenDialogOptions } from 'electron'
import { DesktopNotifications } from './notifications.js'
import updaterPackage from 'electron-updater'
import { HarnessRuntime, type HarnessChildProcess } from './runtime/harness-runtime.js'
import { attachCredentialBroker } from './credentials/broker.js'
import { CredentialVault } from './credentials/vault.js'
import { secureWindow } from './security.js'
import { isZoteroOpenUrl } from './security-policy.js'
import { resolveDesktopIdentity } from './identity.js'
import { findDesktopWorkspaceRoot, resolveDesktopIconPath, resolveDesktopResourcePath } from './paths.js'
import { stopBeforeExit } from './shutdown.js'
import { PythonUpdaterService } from './python-updater-service.js'
import { mcpEnvironmentDiagnostic, MCP_ENVIRONMENT_KEYRING } from './mcp-environment.js'
import { hideWindowToTray, showWindowFromTray } from './tray-window.js'
import { registerWindowControls } from './window-controls.js'
import { DesktopUpdateController, isUpdateCheckDue, UPDATE_CHECK_INTERVAL_MS } from './updater.js'
import { verifyDownloadedArtifact } from './update-artifact.js'
import { resolveRevealPath } from './reveal-path.js'
import { copyWindowsFile } from './clipboard-files.js'
import { deleteStoredSession, validSessionId } from './session-delete.js'
import type { DesktopClipboardFile, DesktopInfo, RuntimeSnapshot, StartupStatus } from '../shared/contracts.js'

const { autoUpdater } = updaterPackage
/** Stable updates are served from the Qiniu-backed generic feed. Keeping this
 * explicit also makes the unpacked `win-unpacked` build testable, because
 * electron-builder only emits app-update.yml for installer targets. */
export const STABLE_UPDATE_FEED_URL = 'https://zerowall.chengxunkeji.cn/stable/'
// Update pointers are mutable objects on the CDN; always revalidate them.
autoUpdater.requestHeaders = { 'Cache-Control': 'no-cache' }
const MCP_ENVIRONMENT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAu8wAGfgRWqQBdIGcbkwPlBq01SjgEMybgNh3xVv0ej4=\n-----END PUBLIC KEY-----`

let mainWindow: BrowserWindow | undefined
let runtime: HarnessRuntime | undefined
let tray: Tray | undefined
let quitting = false
let restarting = false
let startup: StartupStatus = { phase: 'starting', progress: 5, message: '正在准备本地工作台', startedAt: Date.now() }
let navigation: Promise<void> | undefined
const desktopPluginProcesses = new Map<string, ReturnType<typeof spawn>>()

function readPackagedChannel(): unknown {
  try {
    const manifest = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as { zerowallChannel?: unknown }
    return manifest.zerowallChannel
  } catch {
    return process.env.ZEROWALL_RELEASE_CHANNEL
  }
}

const identity = resolveDesktopIdentity(readPackagedChannel())

function configureIdentity(): void {
  app.setName(identity.productName)
  if (process.platform === 'win32') app.setAppUserModelId(identity.channel === 'stable' ? 'com.zerowall.science' : 'com.zerowall.science.preview')
  const userDataOverride = process.env.ZEROWALL_USER_DATA_DIR
  app.setPath('userData', userDataOverride ? resolve(userDataOverride) : join(app.getPath('appData'), identity.userDataDirectory))
}

async function migrateLegacyUserData(): Promise<void> {
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
      await cp(legacy, target, { recursive: true, force: false, errorOnExist: false })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'EEXIST') throw error
    }
  }
}

/** Move the user-visible managed runtime to its product name once, while
 * keeping the old directory intact as a rollback/source of truth. */
async function migrateLegacyPythonRoot(userData: string, target: string): Promise<void> {
  const legacy = join(userData, 'mcp-environments')
  if (resolve(legacy) === resolve(target)) return
  try { await stat(legacy) } catch { return }
  try { await stat(target); return } catch { /* first launch after rename */ }
  await cp(legacy, target, { recursive: true, force: false, errorOnExist: false })
  const currentPath = join(target, 'current.json')
  try {
    const record = JSON.parse(await readFile(currentPath, 'utf8')) as Record<string, unknown>
    const rewrite = (value: unknown): unknown => {
      if (typeof value !== 'string') return value
      const rel = relative(resolve(legacy), resolve(value))
      return rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel) ? value : join(target, rel)
    }
    if (record.root !== undefined) record.root = rewrite(record.root)
    if (record.rollbackRoot !== undefined) record.rollbackRoot = rewrite(record.rollbackRoot)
    await writeFile(currentPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
  } catch {
    // A corrupt legacy record is handled by the normal signed installer.
  }
}

function resourcePath(name: string): string {
  return resolveDesktopResourcePath({ appPath: app.getAppPath(), isPackaged: app.isPackaged, name, resourcesPath: process.resourcesPath })
}

function desktopIconPath(): string {
  return resolveDesktopIconPath({ appPath: app.getAppPath(), isPackaged: app.isPackaged, resourcesPath: process.resourcesPath })
}

function bundledSkillsPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'skills') : join(findWorkspaceRoot(), 'resources', 'skills')
}

function brandIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'zerowall-icon.png')
    : join(findWorkspaceRoot(), 'resources', 'brand', 'zerowall', 'zerowall-icon.png')
}

interface UpdateCheckRecord { lastCheckedAt?: number }

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

function findWorkspaceRoot(): string {
  return findDesktopWorkspaceRoot(app.getAppPath())
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
    const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
    let operation: ReturnType<typeof spawn>
    try {
      operation = spawn(command, args, { cwd: invokingDir, env: process.env, windowsHide: true, shell: false })
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
  return app.isPackaged ? join(app.getAppPath(), 'node_modules') : join(findWorkspaceRoot(), '.build', 'runtime', 'node_modules')
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
  registerWindowControls(window, () => runtime?.snapshot().url, pathToFileURL(resourcePath('splash.html')).href)
  window.on('closed', () => { if (mainWindow === window) mainWindow = undefined })
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
  await window.loadURL(snapshot.url)
  // Wait for the actual shell, not just the HTML load. This also surfaces a
  // renderer plugin failure instead of silently abandoning the startup page.
  const deadline = Date.now() + 45_000
  while (!window.isDestroyed() && !quitting) {
    const mounted = await window.webContents.executeJavaScript('Boolean(document.querySelector("[data-dsh-better-sidebar], [data-zerowall-conversation], [contenteditable]"))')
    if (mounted) break
    if (Date.now() >= deadline) throw new Error('工作台界面加载超时，请打开日志检查客户端插件。')
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  if (!window.isDestroyed()) {
    publishStartup({ phase: 'ready', progress: 100, message: '工作台已就绪' })
    runtime?.workbenchReady()
    window.show()
    window.focus()
  }
}

async function launch(): Promise<void> {
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
  const mcpEnvironmentRoot = join(userData, 'zerowall-python')
  await migrateLegacyPythonRoot(userData, mcpEnvironmentRoot)
  publishStartup({ progress: 25, message: '正在准备本地运行环境' })
  await mkdir(mcpEnvironmentRoot, { recursive: true })
  process.env.ZEROWALL_PYTHON_ROOT = mcpEnvironmentRoot
  // Compatibility for older bundled plugins and already-running sessions.
  process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT = mcpEnvironmentRoot
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
  let mcpEnvironmentStartTimer: NodeJS.Timeout | undefined
  const scheduleMcpEnvironmentUpdate = (): void => {
    if (mcpEnvironmentStartTimer !== undefined) return
    mcpEnvironmentStartTimer = setTimeout(() => {
      void mcpEnvironment.autoUpdate().catch(() => undefined)
    }, 5_000)
    mcpEnvironmentStartTimer.unref()
  }
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
    dshPatchPath: resourcePath('zerowall.patch.yml'),
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
      const disposeCredential = attachCredentialBroker(child, credentialVault)
      const disposeDesktop = attachDesktopBridge(child)
      return () => { disposeCredential(); disposeDesktop() }
    },
    onChanged: (snapshot) => {
      if (snapshot.phase === 'ready' && navigation === undefined) {
        navigation = showHarness(snapshot).then(scheduleMcpEnvironmentUpdate).catch(failStartup).finally(() => { navigation = undefined })
      }
      if (snapshot.phase === 'failed' && !quitting) void failStartup(snapshot.message)
    },
  })
  runtime = harnessRuntime

  const mcpEnvironmentLogPath = join(app.getPath('logs'), 'mcp-environment.log')
  await mkdir(dirname(mcpEnvironmentLogPath), { recursive: true })
  let notifiedPythonSnapshot: string | undefined
  mcpEnvironment = new PythonUpdaterService({
    coordinateHost: true,
    root: mcpEnvironmentRoot,
    manifestUrl: process.env.ZEROWALL_PYTHON_MANIFEST ?? process.env.ZEROWALL_MCP_ENVIRONMENT_MANIFEST ?? 'https://zerowall.chengxunkeji.cn/stable/zerowall-python/windows-x64/latest.json',
    publicKey: process.env.ZEROWALL_MCP_ENVIRONMENT_PUBLIC_KEY ?? MCP_ENVIRONMENT_PUBLIC_KEY,
    publicKeys: MCP_ENVIRONMENT_KEYRING,
    diagnosticPath: mcpEnvironmentLogPath,
    publish: status => {
      void appendFile(mcpEnvironmentLogPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...mcpEnvironmentDiagnostic(status) })}\n`, 'utf8').catch(() => undefined)
      const window = mainWindow
      if (window !== undefined && !window.isDestroyed()) window.webContents.send('desktop:mcp-environment:status-changed', status)
      const snapshot = status.packageInventory?.snapshotId
      if (status.updated && snapshot && snapshot !== notifiedPythonSnapshot) {
        notifiedPythonSnapshot = snapshot
        if (Notification.isSupported()) new Notification({ title: 'Python 环境已更新', body: `科研环境 ${status.activeEnvironment?.environmentVersion ?? ''} 已生效，依赖清单已同步。`, silent: true }).show()
      }
    },
  })

  app.once('before-quit', () => mcpEnvironment.stop())

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
    async function sessionDeleteRpc<T>(method: string, request: object): Promise<T> {
      if (activeRuntime.snapshot().phase !== 'ready') throw new Error(label('工作台尚未就绪。', 'The workbench is not ready.'))
      const body = { type: 'client-request', rpcId: crypto.randomUUID(), method: `session/${method}`, payload: { args: { request } } }
      const result = await window.webContents.executeJavaScript(`(async () => {
        const response = await fetch(${JSON.stringify(`/api/session/${method}`)}, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(body))} });
        return response.json();
      })()`)
      if (!result?.result?.ok) throw new Error(result?.result?.error?.message ?? label('会话操作失败。', 'Session operation failed.'))
      return result.result.value as T
    }
    const operation = (async () => {
    try {
      return await deleteStoredSession({
        root: join(userData, 'harness', 'sessions'), sessionId,
        prepare: () => sessionDeleteRpc('prepareDelete', { sessionId: input.sessionId }),
        commit: token => sessionDeleteRpc('commitDelete', { sessionId: input.sessionId, token }),
        abort: token => sessionDeleteRpc('abortDelete', { sessionId: input.sessionId, token }),
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
  ipcMain.handle('desktop:mcp-environment:retry', () => mcpEnvironment.retry())
  ipcMain.handle('desktop:mcp-environment:select-path', async () => {
    const result = await dialog.showOpenDialog(mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined as never, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths[0] === undefined) return mcpEnvironment.current()
    return mcpEnvironment.selectManual(result.filePaths[0])
  })

  await launch()
  await navigation
  // Environment updates run independently from desktop updates. Startup and
  // hourly checks both install a newer signed revision automatically. The
  // first update begins only after the authenticated workbench is visible so
  // a large archive cannot delay the first usable window.
  const mcpEnvironmentInterval = setInterval(() => { void mcpEnvironment.autoUpdate().catch(() => undefined) }, UPDATE_CHECK_INTERVAL_MS)
  mcpEnvironmentInterval.unref()
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
  void stopBeforeExit(() => activeRuntime?.stop() ?? Promise.resolve(), 6_000).finally(() => {
    tray?.destroy()
    tray = undefined
    if (restarting) app.relaunch()
    app.exit(0)
  })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
