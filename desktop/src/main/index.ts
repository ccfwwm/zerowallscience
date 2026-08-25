import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, nativeTheme, safeStorage, Tray, type OpenDialogOptions } from 'electron'
import updaterPackage from 'electron-updater'
import { HarnessRuntime, type HarnessChildProcess } from './runtime/harness-runtime.js'
import { attachCredentialBroker } from './credentials/broker.js'
import { CredentialVault } from './credentials/vault.js'
import { secureWindow } from './security.js'
import { resolveDesktopIdentity } from './identity.js'
import { findDesktopWorkspaceRoot, resolveDesktopIconPath, resolveDesktopResourcePath } from './paths.js'
import { stopBeforeExit } from './shutdown.js'
import { McpEnvironmentController, MCP_ENVIRONMENT_KEYRING } from './mcp-environment.js'
import { hideWindowToTray, showWindowFromTray } from './tray-window.js'
import { DesktopUpdateController, isUpdateCheckDue, UPDATE_CHECK_INTERVAL_MS } from './updater.js'
import type { DesktopClipboardFile, DesktopInfo, RuntimeSnapshot } from '../shared/contracts.js'

const { autoUpdater } = updaterPackage
// Update pointers are mutable objects on the CDN; always revalidate them.
autoUpdater.requestHeaders = { 'Cache-Control': 'no-cache' }
const MCP_ENVIRONMENT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAu8wAGfgRWqQBdIGcbkwPlBq01SjgEMybgNh3xVv0ej4=\n-----END PUBLIC KEY-----`

let mainWindow: BrowserWindow | undefined
let runtime: HarnessRuntime | undefined
let tray: Tray | undefined
let quitting = false
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
  const userDataOverride = process.env.ZEROWALL_USER_DATA_DIR
  app.setPath('userData', userDataOverride ? resolve(userDataOverride) : join(app.getPath('appData'), identity.userDataDirectory))
}

async function migrateLegacyUserData(): Promise<void> {
  const target = app.getPath('userData')
  const legacyNames = identity.channel === 'stable'
    ? ['zerowall-science-3']
    : ['zerowall-science-3-preview']
  for (const name of legacyNames) {
    const legacy = join(app.getPath('appData'), name)
    if (legacy === target) continue
    try {
      await cp(legacy, target, { recursive: true, force: false, errorOnExist: false })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'EEXIST') throw error
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

function attachDesktopBridge(child: HarnessChildProcess): void {
  child.on('message', (message: unknown) => {
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
  })
}

function dshEntryPath(): string {
  if (app.isPackaged) return join(app.getAppPath(), 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  return join(findWorkspaceRoot(), 'dsh', 'source', 'apps', 'cli', 'lib', 'bin.js')
}

function nodeExecutablePath(): string {
  if (app.isPackaged) return process.execPath
  return process.env.npm_node_execpath ?? process.execPath
}

function nodeEntryPath(): string {
  return app.isPackaged ? join(app.getAppPath(), 'runtime', 'harness-node-entry.mjs') : resourcePath('harness-node-entry.mjs')
}

function nodeResolverPath(): string | undefined {
  return app.isPackaged ? join(app.getAppPath(), 'runtime', 'runtime-esm-register.mjs') : undefined
}

function runtimeModulesPath(): string | undefined {
  return app.isPackaged ? join(app.getAppPath(), 'node_modules') : undefined
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
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
  window.on('closed', () => { if (mainWindow === window) mainWindow = undefined })
  mainWindow = window
  return window
}

function showMainWindow(): void {
  const window = mainWindow
  if (window === undefined || window.isDestroyed()) return
  showWindowFromTray(window, process.platform)
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
  await window.loadFile(resourcePath('splash.html'), { query: { icon: pathToFileURL(desktopIconPath()).href } })
  if (!window.isDestroyed()) window.show()
}

async function showHarness(snapshot: RuntimeSnapshot): Promise<void> {
  if (snapshot.phase !== 'ready' || snapshot.url === undefined) return
  const window = mainWindow ?? createWindow()
  await window.loadURL(snapshot.url)
  if (!window.isDestroyed()) {
    window.show()
    window.focus()
  }
}

async function launch(): Promise<void> {
  await showSplash()
  await runtime?.start(join(app.getPath('userData'), 'workspace'))
}

app.commandLine.appendSwitch('lang', 'zh-CN')
configureIdentity()

app.whenReady().then(async () => {
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
  const userData = app.getPath('userData')
  await migrateLegacyUserData()
  const mcpEnvironmentRoot = join(userData, 'mcp-environments')
  await mkdir(mcpEnvironmentRoot, { recursive: true })
  process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT = mcpEnvironmentRoot
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Operating-system credential encryption is unavailable. ZeroWallScience will not store account secrets without it.')
  }
  const credentialVault = new CredentialVault(join(userData, 'credentials', 'vault.json'), {
    encrypt: (value) => safeStorage.encryptString(value),
    decrypt: (value) => safeStorage.decryptString(value),
  })
  const harnessRuntime = new HarnessRuntime({
    dshEntryPath: dshEntryPath(),
    nodeExecutablePath: nodeExecutablePath(),
    nodeEntryPath: nodeEntryPath(),
    nodeResolverPath: nodeResolverPath(),
    runtimeModulesPath: runtimeModulesPath(),
    runAsNode: app.isPackaged,
    dshPatchPath: resourcePath('zerowall.patch.yml'),
    dshHome: join(userData, 'harness'),
    userSkillsPath: join(userData, 'harness', 'zerowall-skills', 'enabled'),
    researchDbPath: join(userData, 'research', 'zerowall-research.sqlite'),
    bundledSkillsPath: bundledSkillsPath(),
    brandIconPath: brandIconPath(),
    logPath: join(app.getPath('logs'), 'harness.log'),
    portPath: join(userData, 'harness', 'endpoint-port.txt'),
    launchProcess: (executable, args, options) => spawn(executable, args, options) as HarnessChildProcess,
    onChildStarted: (child) => { attachCredentialBroker(child, credentialVault); attachDesktopBridge(child) },
    onChanged: (snapshot) => {
      if (snapshot.phase === 'ready') void showHarness(snapshot)
      if (snapshot.phase === 'failed' && !quitting) dialog.showErrorBox('ZeroWallScience could not start', snapshot.message)
    },
  })
  runtime = harnessRuntime

  const mcpEnvironment = new McpEnvironmentController({
    root: mcpEnvironmentRoot,
    manifestUrl: process.env.ZEROWALL_MCP_ENVIRONMENT_MANIFEST ?? 'https://zerowall.chengxunkeji.cn/stable/mcp-environments/windows-x64/latest.json',
    publicKey: process.env.ZEROWALL_MCP_ENVIRONMENT_PUBLIC_KEY ?? MCP_ENVIRONMENT_PUBLIC_KEY,
    publicKeys: MCP_ENVIRONMENT_KEYRING,
    publish: status => {
      const window = mainWindow
      if (window !== undefined && !window.isDestroyed()) window.webContents.send('desktop:mcp-environment:status-changed', status)
    },
  })

  const updates = new DesktopUpdateController({
    updater: autoUpdater,
    enabled: app.isPackaged && identity.channel === 'stable',
    currentVersion: app.getVersion(),
    publish: status => {
      const window = mainWindow
      if (window !== undefined && !window.isDestroyed()) window.webContents.send('desktop:update-status', status)
    },
  })

  ipcMain.handle('desktop:info', (): DesktopInfo => ({ version: app.getVersion(), platform: process.platform, architecture: process.arch }))
  ipcMain.handle('desktop:choose-directory', async () => {
    const options: OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] }
    const result = mainWindow && !mainWindow.isDestroyed()
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0] ?? null
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
    clipboard.clear()
    clipboard.writeText(path)
    clipboard.writeBuffer('FileNameW', Buffer.from(`${path}\0`, 'ucs2'))
    clipboard.writeBuffer('Preferred DropEffect', Buffer.from([5, 0, 0, 0]))
    return true
  })
  ipcMain.handle('desktop:get-update-status', () => updates.current())
  ipcMain.handle('desktop:check-for-updates', () => updates.check())
  ipcMain.handle('desktop:download-update', () => updates.download())
  ipcMain.handle('desktop:install-update', async () => {
    if (updates.current().phase !== 'downloaded') return false
    await stopBeforeExit(() => runtime?.stop() ?? Promise.resolve(), 6_000)
    quitting = true
    tray?.destroy()
    tray = undefined
    return updates.install()
  })
  ipcMain.handle('desktop:mcp-environment:get-status', () => mcpEnvironment.current())
  ipcMain.handle('desktop:mcp-environment:retry', () => mcpEnvironment.retry())
  ipcMain.handle('desktop:mcp-environment:select-path', async () => {
    const result = await dialog.showOpenDialog(mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined as never, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths[0] === undefined) return mcpEnvironment.current()
    return mcpEnvironment.selectManual(result.filePaths[0])
  })

  await launch()
  void mcpEnvironment.initialize()
  const updateRecordPath = join(userData, 'updates', 'last-check.json')
  const runScheduledUpdateCheck = async (): Promise<void> => {
    const record = await readUpdateCheckRecord(updateRecordPath)
    if (!isUpdateCheckDue(record.lastCheckedAt)) return
    // Persist the attempt before contacting the feed. A failed background
    // check remains retryable manually, but cannot retry-loop on startup.
    await writeUpdateCheckRecord(updateRecordPath, Date.now())
    await updates.check()
  }
  const updateTimer = setTimeout(() => { void runScheduledUpdateCheck().catch(() => undefined) }, 5_000)
  updateTimer.unref()
  const updateInterval = setInterval(() => { void runScheduledUpdateCheck().catch(() => undefined) }, UPDATE_CHECK_INTERVAL_MS)
  updateInterval.unref()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && runtime !== undefined) void showHarness(runtime.snapshot())
    else showMainWindow()
  })
}).catch((error: unknown) => dialog.showErrorBox('ZeroWall Science startup failed', error instanceof Error ? error.stack ?? error.message : String(error)))

app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  const activeRuntime = runtime
  void stopBeforeExit(() => activeRuntime?.stop() ?? Promise.resolve(), 6_000).finally(() => {
    tray?.destroy()
    tray = undefined
    app.exit(0)
  })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
