import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, mkdtemp, readFile, readdir, stat } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { extractFile, listPackage } from '@electron/asar'
import { chromium } from 'playwright'

const MIB = 1024 * 1024
const packageRoot = resolve(import.meta.dirname, '..')
const repositoryRoot = resolve(packageRoot, '..')

if (process.argv.includes('--audit-source')) {
  await verifySourceRuntimePolicy()
  console.log('ZeroWall source runtime policy verified for DSH rc1 and iLink-only WeChat.')
  process.exit(0)
}

const packaged = await locatePackagedApp()
const asarPath = resolve(packaged.resourcesRoot, 'app.asar')
await access(asarPath)

const archiveEntries = listPackage(asarPath, { isPack: false })
const archiveFiles = archiveEntries.map(normalizeArchivePath)
const archiveEntryByPath = new Map(archiveEntries.map(entry => [normalizeArchivePath(entry), entry.replace(/^[/\\]+/, '')]))
const archiveSet = new Set(archiveFiles)
const packagedManifest = JSON.parse(readArchiveFile('package.json').toString('utf8'))
const requiredArchivePaths = [
  'out/main/index.js',
  'out/preload/index.cjs',
  'runtime/harness-node-entry.mjs',
  'runtime/runtime-esm-register.mjs',
  'runtime/runtime-esm-loader.mjs',
  'node_modules/@deepseek-ai/dsh/lib/bin.js',
  'node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js',
  'node_modules/@deepseek-ai/schemastery/lib/index.mjs',
  'node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js',
  'node_modules/@earendil-works/pi-ai/dist/index.js',
  'node_modules/@pdf-lib/fontkit/dist/fontkit.es.js',
  'node_modules/@deepseek-ai/cordis-plugin-group/lib/index.js',
  'node_modules/@zerowallscience/plugin-base/lib/client.js',
  'node_modules/@zerowallscience/plugin-projects/lib/index.js',
  'node_modules/@zerowallscience/plugin-files/lib/index.js',
  'node_modules/@zerowallscience/plugin-images/lib/client.js',
  'node_modules/@zerowallscience/plugin-wechat/lib/index.js',
  'node_modules/@zerowallscience/plugin-wechat/lib/client.js',
  'node_modules/@zerowallscience/research-store/lib/index.js',
  'node_modules/jszip/lib/index.js',
  'node_modules/pdf-lib/es/index.js',
  'node_modules/pptxgenjs/dist/pptxgen.es.js',
]
for (const path of requiredArchivePaths) {
  if (!archiveSet.has(path)) throw new Error(`Required ASAR runtime file is missing: ${path}`)
}

for (const path of [
  resolve(packaged.resourcesRoot, 'zerowall.patch.yml'),
  resolve(packaged.resourcesRoot, 'skills', 'literature-review', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'skills', 'academic-ppt-studio', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'licenses', 'THIRD_PARTY_NOTICES.md'),
  resolve(packaged.resourcesRoot, 'licenses', 'deepseek-harness.version.json'),
]) await access(path)

verifyArchivePolicy()
await verifyExternalPolicy()
await verifySizePolicy()
await verifyImports()
await verifyNativeRuntime()
await verifyDirectoryPickerWorker()
await verifyHostStartup()
await verifyDesktopStartup()

console.log('Packaged ZeroWall ASAR runtime, package policy, and Host startup verified.')

function verifyArchivePolicy() {
  const forbidden = archiveFiles.filter(path => path.startsWith('node_modules/') && (
    /\.(?:d\.ts|ts|tsx|mts|cts|map|pdb|tsbuildinfo)$/i.test(path)
    || hasForbiddenRuntimeDirectory(path)
  ))
  if (forbidden.length > 0) throw new Error(`Forbidden production runtime files found in ASAR:\n${forbidden.slice(0, 50).join('\n')}`)

  const nativeMismatch = archiveFiles.filter(path => /\.(?:node|dll|exe)$/i.test(path)
    && /(darwin|linux|android|arm64|ia32|x86)/i.test(path)
    && !/(win32|windows).*(x64|amd64)/i.test(path))
  if (nativeMismatch.length > 0) throw new Error(`Non-Windows-x64 native files found in ASAR:\n${nativeMismatch.join('\n')}`)

  const pluginNames = [
    'base', 'desktop-compat', 'secrets', 'projects', 'account', 'ai-cloud', 'files', 'images', 'mcp',
    'skills', 'reviewer', 'research', 'execution', 'runs', 'publications', 'presentations', 'web-search', 'wechat',
  ]
  for (const name of [...pluginNames.map(value => `plugin-${value}`), 'research-store']) {
    const packagePaths = archiveFiles.filter(path => path.endsWith(`@zerowallscience/${name}/package.json`))
    if (packagePaths.length !== 1) throw new Error(`@zerowallscience/${name} must be packaged exactly once; found ${packagePaths.length}.`)
  }
  for (const name of ['platform-client', 'platform-host']) {
    if (archiveFiles.some(path => path.includes(`@zerowallscience/${name}/`))) throw new Error(`Legacy package @zerowallscience/${name} must not be packaged.`)
  }
  const forbiddenWechat = archiveFiles.filter(path => /node_modules\/(?:wechaty|wechaty-puppet-|@juzi-bot\/wechaty)/iu.test(path))
  if (forbiddenWechat.length > 0) throw new Error(`Non-iLink WeChat runtime found in ASAR:\n${forbiddenWechat.slice(0, 20).join('\n')}`)

  if (!/^4\.\d+\.\d+$/u.test(packagedManifest.version)) throw new Error(`Packaged desktop version must be a 4.x release; found ${packagedManifest.version}.`)
  const dshManifest = JSON.parse(readArchiveFile('node_modules/@deepseek-ai/dsh/package.json').toString('utf8'))
  if (dshManifest.version !== '0.1.1-rc.1') throw new Error(`Packaged DSH must be 0.1.1-rc.1; found ${dshManifest.version}.`)
}

function hasForbiddenRuntimeDirectory(path) {
  const forbidden = new Set(['src', 'test', 'tests', '__tests__', 'example', 'examples', 'docs'])
  const segments = path.split('/')
  return segments.some((segment, index) => forbidden.has(segment.toLowerCase())
    && !(segment.toLowerCase() === 'src' && segments[index - 1]?.toLowerCase() === 'build'))
}

async function verifyExternalPolicy() {
  const externalFiles = await listDiskFiles(packaged.resourcesRoot)
  const forbiddenSkills = externalFiles.filter(path => path.startsWith('skills/') && (
    /(?:^|\/)(?:__pycache__|tests?|outputs?|rendered|screenshots|test-results)(?:\/|$)/i.test(path)
    || /\.pyc$/i.test(path)
    || path.startsWith('skills/gpt-image2-ppt/docs/assets/')
    || path.startsWith('skills/gpt-image2-ppt/examples/editable-pptx/')
  ))
  if (forbiddenSkills.length > 0) throw new Error(`Forbidden runtime Skill artifacts found:\n${forbiddenSkills.slice(0, 50).join('\n')}`)
  if (externalFiles.length > 3_000) throw new Error(`ASAR-external file count ${externalFiles.length} exceeds the 3,000-file gate.`)

  const nodeExecutables = (await listDiskFiles(packaged.root)).filter(path => /(?:^|\/)node\.exe$/i.test(path))
  if (nodeExecutables.length > 0) throw new Error(`Standalone Node runtime is forbidden:\n${nodeExecutables.join('\n')}`)
  try {
    await access(resolve(packaged.resourcesRoot, 'app', 'node_modules'))
    throw new Error('A loose resources/app/node_modules tree is forbidden; production dependencies must live in app.asar.')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

async function verifySizePolicy() {
  const installedBytes = await directorySize(packaged.root)
  // 3.0.8 bundles the local PDF.js, OOXML, and XLSX parsers so installed
  // runtime remains self-contained on clean machines. Keep a bounded gate,
  // but account for those offline parser assets.
  // The stable profile now ships the opt-in Claude Code bridge and its signed
  // Windows SDK runtime. Keep a hard ceiling, but account for that provider's
  // ~250 MiB native payload instead of failing every release at 600 MiB.
  if (installedBytes > 900 * MIB) throw new Error(`Installed output ${(installedBytes / MIB).toFixed(1)} MiB exceeds the 900 MiB gate.`)

  const installers = (await readdir(resolve(packageRoot, 'dist'), { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.includes(`-${packagedManifest.version}-`) && entry.name.endsWith('.exe') && !entry.name.toLowerCase().includes('uninstall'))
  for (const installer of installers) {
    const size = (await stat(resolve(packageRoot, 'dist', installer.name))).size
    if (size > 240 * MIB) throw new Error(`Installer ${installer.name} ${(size / MIB).toFixed(1)} MiB exceeds the 240 MiB gate.`)
  }
}

async function verifyImports() {
  const expression = `
    await import('@deepseek-ai/dsh-mcp-client');
    await import('@deepseek-ai/dsh-session-telemetry-otel');
    await import('@deepseek-ai/schemastery');
    const expectedInject = new Map([
      ['@zerowallscience/plugin-base', ['webServer']],
      ['@zerowallscience/plugin-files', ['tools']],
      ['@zerowallscience/plugin-skills', ['skills', 'systemPrompt']],
    ]);
    for (const name of [
      '@zerowallscience/plugin-base',
      '@zerowallscience/plugin-projects',
      '@zerowallscience/plugin-account',
      '@zerowallscience/plugin-files',
      '@zerowallscience/plugin-images',
      '@zerowallscience/plugin-mcp',
      '@zerowallscience/plugin-skills',
      '@zerowallscience/plugin-wechat',
    ]) {
      const module = await import(name);
      const plugin = module.default ?? module;
      if (typeof plugin !== 'object' || typeof plugin.apply !== 'function') {
        throw new Error(name + ' did not preserve its Cordis plugin object during packaging.');
      }
      const required = expectedInject.get(name) ?? [];
      for (const service of required) {
        if (!Array.isArray(plugin.inject) || !plugin.inject.includes(service)) {
          throw new Error(name + ' lost required Cordis inject metadata: ' + service);
        }
      }
    }
  `
  await runEmbeddedNode([
    '--import', pathToFileURL(resolve(asarPath, 'runtime', 'runtime-esm-register.mjs')).href,
    '--input-type=module', '--eval', expression,
  ], { cwd: packaged.root })
}

async function verifyNativeRuntime() {
  const unpackedModules = resolve(packaged.resourcesRoot, 'app.asar.unpacked', 'node_modules')
  const ptyRoot = resolve(unpackedModules, 'node-pty', 'prebuilds', 'win32-x64')
  // node-pty 1.2 split the Windows native module into
  // conpty.node; older releases exposed pty.node. Accept either ABI layout,
  // then let the smoke test below validate the loaded package.
  const ptyCandidates = [
    resolve(ptyRoot, 'pty.node'),
    resolve(ptyRoot, 'conpty.node'),
  ]
  const nativePaths = [
    resolve(unpackedModules, '@img', 'sharp-win32-x64', 'lib', 'sharp-win32-x64-0.35.3.node'),
    resolve(unpackedModules, '@koromix', 'koffi-win32-x64', 'win32_x64', 'koffi.node'),
  ]
  const ripgrepPath = resolve(unpackedModules, '@vscode', 'ripgrep-win32-x64', 'bin', 'rg.exe')
  if (!(await Promise.any(ptyCandidates.map(async path => { await access(path); return true })).catch(() => false))) {
    throw new Error(`node-pty native module is missing under ${ptyRoot}`)
  }
  for (const path of nativePaths) await access(path)
  await access(ripgrepPath)

  const expression = `
    (async () => {
    const pty = await import('node-pty');
    const { default: sharp } = await import('sharp');
    const { default: koffi } = await import('koffi');
    const { PDFDocument } = await import('pdf-lib');
    const { default: PptxGenJS } = await import('pptxgenjs');
    const terminal = pty.spawn(process.env.ComSpec, ['/d', '/s', '/c', 'echo ZEROWALL_PTY_OK'], { cols: 80, rows: 24, useConpty: false });
    const terminalOutput = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('PTY smoke timeout')), 10000);
      terminal.onData(data => { output += data; });
      terminal.onExit(() => { clearTimeout(timeout); resolve(output); });
    });
    if (!terminalOutput.includes('ZEROWALL_PTY_OK')) throw new Error('PTY smoke marker missing');
    const image = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#ffffffff' } }).png().toBuffer();
    if (image.length === 0 || typeof koffi.load !== 'function') throw new Error('Native image or Koffi smoke failed');
    const pdf = await PDFDocument.create(); pdf.addPage([10, 10]); if ((await pdf.save()).length === 0) throw new Error('PDF smoke failed');
    const pptx = new PptxGenJS(); pptx.addSlide();
    process.exit(0);
    })().catch(error => { console.error(error); process.exit(1); });
  `
  await runEmbeddedNode([
    '--import', pathToFileURL(resolve(asarPath, 'runtime', 'runtime-esm-register.mjs')).href,
    '--eval', expression,
  ], { cwd: packaged.root })

  const ripgrep = spawnSync(ripgrepPath, ['--version'], { encoding: 'utf8', windowsHide: true })
  if (ripgrep.status !== 0 || !ripgrep.stdout.includes('ripgrep')) throw new Error(`ripgrep smoke failed: ${ripgrep.stderr}`)
}

async function verifyDirectoryPickerWorker() {
  const workerPath = resolve(packaged.resourcesRoot, 'app.asar.unpacked', 'node_modules', '@deepseek-ai', 'dsh-host-directory-picker-native', 'lib', 'worker.cjs')
  await access(workerPath)
  const child = spawn(packaged.executablePath, [workerPath], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_PATH: resolve(asarPath, 'node_modules'),
      DSH_DIALOG_TITLE: 'ZeroWall packaged directory picker smoke',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk.toString('utf8') })
  child.stderr.on('data', chunk => { output += chunk.toString('utf8') })
  try {
    await new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Packaged directory picker worker did not start.\n${output}`)), 10_000)
      child.once('message', message => {
        if (message?.kind !== 'showing') return
        clearTimeout(timeout)
        resolvePromise()
      })
      child.once('error', error => {
        clearTimeout(timeout)
        reject(error)
      })
      child.once('exit', code => {
        clearTimeout(timeout)
        reject(new Error(`Packaged directory picker worker exited before showing (code ${code ?? 'unknown'}).\n${output}`))
      })
    })
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM')
  }
}

async function verifyHostStartup() {
  const root = await mkdtemp(resolve(tmpdir(), 'zerowall-packaged-host-'))
  const port = await reservePort()
  const url = `http://127.0.0.1:${port}`
  const dshEntry = resolve(asarPath, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const child = spawn(packaged.executablePath, [
    '--import', pathToFileURL(resolve(asarPath, 'runtime', 'runtime-esm-register.mjs')).href,
    '--expose-internals',
    resolve(asarPath, 'runtime', 'harness-node-entry.mjs'),
    dshEntry,
    'web',
    '--patch', resolve(packaged.resourcesRoot, 'zerowall.patch.yml'),
    '--host', '127.0.0.1',
    '--port', String(port),
  ], {
    cwd: root,
    env: hostEnvironment(root, dshEntry),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk.toString('utf8') })
  child.stderr.on('data', chunk => { output += chunk.toString('utf8') })

  try {
    const deadline = Date.now() + (process.platform === 'win32' ? 120_000 : 60_000)
    while (Date.now() < deadline && child.exitCode === null) {
      let response
      try {
        response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(1_000) })
      } catch {
        // Expected while the packaged Host binds its loopback endpoint.
      }
      if (response !== undefined && response.status >= 200 && response.status < 500) {
        await verifyWebBootManifest(url)
        await verifyPluginInventory(url)
        await verifyPlaintextSessionPersistence(url, root)
        // DSH binds the loopback server before every asynchronous Loader row
        // has settled. Keep the process alive long enough to catch a plugin
        // that briefly reports active and then fails during its apply phase.
        await new Promise(resolvePromise => setTimeout(resolvePromise, 2_000))
        if (child.exitCode !== null) throw new Error(`Packaged Host exited after becoming ready.\n${output.slice(-12_000)}`)
        await verifyWebBootManifest(url)
        await verifyPluginInventory(url)
        return
      }
      await new Promise(resolvePromise => setTimeout(resolvePromise, 250))
    }
    throw new Error(`Packaged Host did not become ready.\n${output.slice(-12_000)}`)
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM')
  }
}

async function verifyPluginInventory(url) {
  const rpcId = randomUUID()
  const response = await fetch(`${url}/api/pluginInventory/list`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId,
      method: 'pluginInventory/list',
      payload: { args: {} },
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Packaged Host pluginInventory/list returned HTTP ${response.status}.`)
  const envelope = await response.json()
  if (envelope?.rpcId !== rpcId || envelope?.result?.ok !== true || !Array.isArray(envelope.result.value?.entries)) {
    throw new Error(`Packaged Host plugin inventory is unavailable: ${JSON.stringify(envelope)}`)
  }
  const entries = envelope.result.value.entries
  const expected = [
    'base', 'desktop-compat', 'secrets', 'projects', 'account', 'ai-cloud', 'files', 'images', 'mcp',
    'skills', 'reviewer', 'research', 'execution', 'runs', 'publications', 'presentations', 'web-search', 'wechat',
  ].map(name => `@zerowallscience/plugin-${name}`)
  const byModule = new Map(entries.map(entry => [entry?.moduleName, entry]))
  const missing = expected.filter(name => !byModule.has(name))
  if (missing.length > 0) throw new Error(`Packaged Host plugin inventory is missing: ${missing.join(', ')}`)
  const inactive = expected.filter(name => byModule.get(name)?.enabled !== true || byModule.get(name)?.fiberPhase !== 'active')
  if (inactive.length > 0) throw new Error(`Packaged Host ZeroWall plugins are not active: ${inactive.map(name => `${name}=${JSON.stringify(byModule.get(name))}`).join('; ')}`)
}

async function verifyWebBootManifest(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`Packaged Host index returned HTTP ${response.status}.`)
  const html = await response.text()
  // DSH rc1 injects the boot graph as `globalThis["__DSH_BOOT__"]`; earlier
  // releases assigned `window.__DSH_BOOT__`. Accept either spelling, and take
  // everything up to the closing tag so a nested object is not truncated.
  const match = /(?:window\.__DSH_BOOT__|globalThis\[["']__DSH_BOOT__["']\])\s*=\s*(\{[\s\S]*?\})\s*;?<\/script>/u.exec(html)
  if (match?.[1] === undefined) throw new Error('Packaged Host index did not contain the __DSH_BOOT__ graph.')
  const graph = JSON.parse(match[1])
  const entries = Array.isArray(graph?.entries) ? graph.entries : []
  const ids = new Set(entries.map(entry => entry?.id).filter(id => typeof id === 'string'))
  const required = [
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-theme',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-layout',
    '@zerowallscience/plugin-base',
    '@zerowallscience/plugin-projects',
    '@zerowallscience/plugin-account',
    '@zerowallscience/plugin-images',
    '@zerowallscience/plugin-mcp',
    '@zerowallscience/plugin-skills',
    '@zerowallscience/plugin-reviewer',
    '@zerowallscience/plugin-research',
    '@zerowallscience/plugin-wechat',
  ]
  const missing = required.filter(id => !ids.has(id))
  if (missing.length > 0) {
    throw new Error(`Packaged Web boot manifest is incomplete. Missing: ${missing.join(', ')}. Found: ${[...ids].join(', ')}`)
  }
  for (const id of required) {
    const entry = entries.find(candidate => candidate?.id === id)
    const plugin = await fetch(new URL(entry.url, url), { signal: AbortSignal.timeout(10_000) })
    if (!plugin.ok) throw new Error(`Packaged client plugin ${id} returned HTTP ${plugin.status} at ${new URL(entry.url, url).href}: ${await plugin.text()}`)
  }
}

async function verifyDesktopStartup() {
  const root = await mkdtemp(resolve(tmpdir(), 'zerowall-packaged-desktop-'))
  const child = spawn(packaged.executablePath, ['--remote-debugging-port=0', `--user-data-dir=${resolve(root, 'chromium')}`], {
    cwd: packaged.root,
    env: { ...process.env, ZEROWALL_USER_DATA_DIR: resolve(root, 'user-data') },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let output = ''
  const endpoint = new Promise((resolveEndpoint, rejectEndpoint) => {
    const timeout = setTimeout(() => rejectEndpoint(new Error(`Packaged desktop DevTools endpoint timed out.\n${output.slice(-12_000)}`)), 120_000)
    const onData = chunk => {
      output = `${output}${chunk.toString('utf8')}`.slice(-20_000)
      const match = /DevTools listening on (ws:\/\/[^\s]+)/u.exec(output)
      if (match?.[1] === undefined) return
      clearTimeout(timeout)
      resolveEndpoint(match[1])
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.once('exit', code => {
      clearTimeout(timeout)
      rejectEndpoint(new Error(`Packaged desktop exited before DevTools was ready (exit ${String(code)}).\n${output.slice(-12_000)}`))
    })
  })
  let browser
  try {
    browser = await chromium.connectOverCDP(await endpoint)
    const context = browser.contexts()[0]
    if (context === undefined) throw new Error('Packaged desktop did not expose a browser context.')
    const deadline = Date.now() + 120_000
    let page
    while (Date.now() < deadline) {
      page = context.pages().find(candidate => candidate.url().startsWith('http://127.0.0.1:'))
      if (page !== undefined) break
      await new Promise(resolvePromise => setTimeout(resolvePromise, 250))
    }
    if (page === undefined) throw new Error(`Packaged desktop did not navigate to its Host.\n${output.slice(-12_000)}`)
    const browserErrors = []
    page.on('pageerror', error => browserErrors.push(`pageerror: ${error.message}`))
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`)
    })
    page.on('requestfailed', request => browserErrors.push(`request: ${request.url()} ${request.failure()?.errorText ?? 'failed'}`))
    await page.waitForFunction(() => Array.isArray(window.__DSH_BOOT__?.entries), undefined, { timeout: 120_000 })
    const ids = await page.evaluate(() => {
      const boot = window.__DSH_BOOT__
      return Array.isArray(boot?.entries) ? boot.entries.map(entry => entry.id) : []
    })
    for (const id of [
      '@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-layout', '@zerowallscience/plugin-base',
      '@zerowallscience/plugin-projects', '@zerowallscience/plugin-account', '@zerowallscience/plugin-images',
      '@zerowallscience/plugin-mcp', '@zerowallscience/plugin-skills', '@zerowallscience/plugin-reviewer',
      '@zerowallscience/plugin-research', '@zerowallscience/plugin-wechat',
    ]) {
      if (!ids.includes(id)) throw new Error(`Packaged desktop Web boot is missing ${id}.`)
    }
    try {
      await page.getByText('ZeroWallScience', { exact: false }).first().waitFor({ state: 'visible', timeout: 30_000 })
    } catch (error) {
      const snapshot = (await page.locator('body').innerText().catch(() => '')).slice(0, 4_000)
      throw new Error(`Packaged desktop did not render the ZeroWallScience brand. body=${JSON.stringify(snapshot)} errors=${JSON.stringify(browserErrors.slice(-20))}\n${error.message}`)
    }
    const bodyText = await page.locator('body').innerText()
    if (/Failed to load plugins|missed the module table|Cannot use import statement outside a module/iu.test(bodyText)) {
      throw new Error(`Packaged desktop rendered a plugin loading error: ${bodyText.slice(0, 4_000)}`)
    }
    const fatal = browserErrors.filter(error => /Failed to load plugins|missed the module table|Cannot use import statement outside a module/iu.test(error))
    if (fatal.length > 0) throw new Error(`Packaged desktop client errors:\n${fatal.join('\n')}`)
    const clientCss = await page.evaluate(() => {
      const markers = [...document.querySelectorAll('style[data-zerowall-plugin-css]')]
        .map(style => style.getAttribute('data-zerowall-plugin-css'))
      const update = document.querySelector('button[aria-label="检查应用更新"], button[aria-label="Check for app updates"]')
      const account = document.querySelector('button[aria-label="ZeroWall 云账户"], button[aria-label="ZeroWall Cloud account"]')
      const inspect = (element) => element instanceof HTMLElement
        ? { className: element.className, height: getComputedStyle(element).height, cursor: getComputedStyle(element).cursor }
        : undefined
      return { markers, update: inspect(update), account: inspect(account) }
    })
    for (const id of ['@zerowallscience/plugin-base', '@zerowallscience/plugin-account']) {
      if (!clientCss.markers.includes(id)) throw new Error(`Packaged desktop did not inject CSS for ${id}.`)
    }
    for (const [name, button] of [['update', clientCss.update], ['AI Cloud account', clientCss.account]]) {
      if (button === undefined || button.className === '' || button.height === '0px' || button.cursor !== 'pointer') {
        throw new Error(`Packaged desktop ${name} button is missing or unstyled: ${JSON.stringify(button)}`)
      }
    }
  } finally {
    await browser?.close().catch(() => undefined)
    if (child.exitCode === null && child.pid !== undefined) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
      else child.kill('SIGTERM')
    }
  }
}

function hostEnvironment(root, dshEntry) {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_PATH: resolve(asarPath, 'node_modules'),
    ZEROWALL_RUNTIME_ANCHOR: pathToFileURL(dshEntry).href,
    DSH_HOME: resolve(root, 'harness'),
    DSH_BUNDLED_SKILL_DIR: resolve(packaged.resourcesRoot, 'skills'),
    ZEROWALL_RESEARCH_DB: resolve(root, 'research', 'zerowall-research.sqlite'),
    ZEROWALL_BUNDLED_SKILLS: resolve(packaged.resourcesRoot, 'skills'),
    DSH_TELEMETRY_DISABLED: '1',
    NO_COLOR: '1',
  }
}

async function verifyPlaintextSessionPersistence(url, root) {
  const sessionId = randomUUID()
  const rpcId = randomUUID()
  const response = await fetch(`${url}/api/session.create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: 'session.create', payload: { cwd: root, sessionId } }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Packaged Host session.create returned HTTP ${response.status}.`)
  const envelope = await response.json()
  if (envelope?.rpcId !== rpcId || envelope?.result?.ok !== true || envelope.result.value?.sessionId !== sessionId) {
    throw new Error(`Packaged Host session.create returned an invalid response: ${JSON.stringify(envelope)}`)
  }

  const sessionsRoot = resolve(root, 'harness', 'sessions')
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const files = await listDiskFiles(sessionsRoot).catch(error => error?.code === 'ENOENT' ? [] : Promise.reject(error))
    if (files.some(path => path.endsWith('session.jsonl.zstd'))) throw new Error('Packaged Host wrote a compressed session.')
    const jsonl = files.find(path => path.endsWith('session.jsonl'))
    if (jsonl !== undefined) {
      const firstLine = (await readFile(resolve(sessionsRoot, jsonl), 'utf8')).split('\n', 1)[0]
      if (JSON.parse(firstLine).id !== sessionId) throw new Error('Packaged Host persisted the wrong session id.')
      return
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  throw new Error('Packaged Host did not persist the smoke session as plaintext JSONL.')
}

async function runEmbeddedNode(arguments_, options) {
  await new Promise((resolvePromise, reject) => {
    const dshEntry = resolve(asarPath, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    const child = spawn(packaged.executablePath, arguments_, {
      ...options,
      env: hostEnvironment(options.cwd, dshEntry),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk.toString('utf8') })
    child.stderr.on('data', chunk => { output += chunk.toString('utf8') })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0
      ? resolvePromise()
      : reject(new Error(`Embedded Electron Node verification failed (${signal ?? `exit ${code}`}).\n${output.slice(-12_000)}`)))
  })
}

async function listDiskFiles(root) {
  const result = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name)
    if (entry.isDirectory()) {
      for (const child of await listDiskFiles(path)) result.push(`${entry.name}/${child}`)
    } else result.push(entry.name)
  }
  return result
}

async function directorySize(root) {
  let size = 0
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name)
    size += entry.isDirectory() ? await directorySize(path) : (await stat(path)).size
  }
  return size
}

async function reservePort() {
  return await new Promise((resolvePromise, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      const address = server.address()
      if (address === null || typeof address === 'string') return reject(new Error('Could not reserve a loopback port.'))
      server.close(error => error === undefined ? resolvePromise(address.port) : reject(error))
    })
  })
}

function normalizeArchivePath(path) {
  return path.replaceAll('\\', '/').replace(/^\/+/, '')
}

function readArchiveFile(path) {
  const entry = archiveEntryByPath.get(path)
  if (entry === undefined) throw new Error(`ASAR file is missing: ${path}`)
  return extractFile(asarPath, entry)
}

async function verifySourceRuntimePolicy() {
  const upstream = JSON.parse(await readFile(resolve(repositoryRoot, 'dsh', 'lock', 'upstream.json'), 'utf8'))
  if (upstream.version !== '0.1.1-rc.1' || upstream.tag !== 'dsh-v0.1.1-rc.1') {
    throw new Error(`Pinned DSH must be rc1; found ${upstream.version ?? 'unknown'} (${upstream.tag ?? 'no tag'}).`)
  }
  const sourceDsh = JSON.parse(await readFile(resolve(repositoryRoot, 'dsh', 'source', 'package.json'), 'utf8'))
  if (sourceDsh.version !== '0.1.1-rc.1') throw new Error(`DSH source package must be rc1; found ${sourceDsh.version}.`)

  for (const oldPath of ['apps/desktop', 'vendor/deepseek-harness', 'packages/platform-host', 'packages/platform-client']) {
    try {
      await access(resolve(repositoryRoot, oldPath))
      throw new Error(`Legacy repository path still exists: ${oldPath}`)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }

  const manifests = [
    resolve(repositoryRoot, 'package.json'),
    resolve(repositoryRoot, 'desktop', 'package.json'),
    ...await pluginManifestPaths(),
  ]
  const manifestText = (await Promise.all(manifests.map(path => readFile(path, 'utf8')))).join('\n')
  for (const forbidden of ['0.1.0-rc.7', '@zerowallscience/platform-host', '@zerowallscience/platform-client']) {
    if (manifestText.includes(forbidden)) throw new Error(`Runtime manifests contain forbidden legacy reference: ${forbidden}`)
  }

  const wechat = JSON.parse(await readFile(resolve(repositoryRoot, 'plugins', 'wechat', 'package.json'), 'utf8'))
  const wechatDependencies = Object.keys({ ...wechat.dependencies, ...wechat.optionalDependencies })
  const forbiddenWechat = wechatDependencies.filter(name => /wechaty|puppet/iu.test(name))
  if (forbiddenWechat.length > 0) throw new Error(`WeChat plugin must be iLink-only; found ${forbiddenWechat.join(', ')}.`)
  await access(resolve(repositoryRoot, 'plugins', 'wechat', 'src', 'host', 'ilink.ts'))
  const stableProfile = await readFile(resolve(repositoryRoot, 'profiles', 'generated', 'stable.yml'), 'utf8')
  if (!stableProfile.includes("'@zerowallscience/plugin-wechat'")
    || !/wechat:[\s\S]*enabled:\s*true[\s\S]*autoConnect:\s*false[\s\S]*channel:\s*ilink/u.test(stableProfile)) {
    throw new Error('Stable profile must enable WeChat while keeping first-start autoConnect disabled.')
  }
}

async function pluginManifestPaths() {
  const root = resolve(repositoryRoot, 'plugins')
  return (await readdir(root, { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => resolve(root, entry.name, 'package.json'))
}

async function locatePackagedApp() {
  const outputRoot = resolve(packageRoot, 'dist')
  if (process.platform === 'win32') {
    const root = resolve(outputRoot, 'win-unpacked')
    const executable = (await readdir(root, { withFileTypes: true }))
      .find(entry => entry.isFile() && entry.name.endsWith('.exe') && !entry.name.toLowerCase().includes('uninstall'))
    if (executable === undefined) throw new Error(`No packaged Electron executable found under ${root}.`)
    return { root, resourcesRoot: resolve(root, 'resources'), executablePath: resolve(root, executable.name) }
  }

  const outputs = (await readdir(outputRoot, { withFileTypes: true })).filter(entry => entry.isDirectory() && entry.name.startsWith('mac'))
  const preferredNames = process.arch === 'arm64' ? ['mac-arm64', 'mac'] : ['mac', 'mac-x64']
  const output = preferredNames.map(name => outputs.find(entry => entry.name === name)).find(entry => entry !== undefined)
  if (output === undefined) throw new Error(`No macOS unpacked output found under ${outputRoot}.`)
  const app = (await readdir(resolve(outputRoot, output.name), { withFileTypes: true })).find(entry => entry.isDirectory() && entry.name.endsWith('.app'))
  if (app === undefined) throw new Error(`No macOS application bundle found under ${resolve(outputRoot, output.name)}.`)
  const root = resolve(outputRoot, output.name, app.name, 'Contents')
  return {
    root,
    resourcesRoot: resolve(root, 'Resources'),
    executablePath: resolve(root, 'MacOS', basename(app.name, '.app')),
  }
}
