import { contract } from '../../tools/build/paths.mjs'
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { locatePackagedApp } from '../scripts/packaged-app.mjs'
import { clipboardCapability } from '../scripts/clipboard-capability.mjs'
import { pcrTemplate, pcrForward, pcrReverse, pcrExpected } from '../../plugins/research/test/sequence-simulation-fixture.js'
import { moleculePdb } from '../../plugins/research/test/molecule-fixture.js'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const applicationVersion = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8')).version
const roots: string[] = []
let application: ChildProcessWithoutNullStreams
let browser: Browser
let page: Page
let root: string
let applicationOutput = ''
let markdownSessionId: string
const rendererOutput: string[] = []
const clipboardAccess = clipboardCapability()

beforeAll(async () => {
  mkdirSync(contract.verification, { recursive: true })
  writeFileSync(join(contract.verification, 'clipboard-capability.json'), JSON.stringify(clipboardAccess, null, 2))
  if (!clipboardAccess.available) console.log('Clipboard success checks unavailable in this Windows session:', clipboardAccess)
  root = mkdtempSync(join(tmpdir(), 'zerowall-electron-e2e-')); roots.push(root)
  mkdirSync(join(root, 'appdata'), { recursive: true })
  mkdirSync(join(root, 'localappdata'), { recursive: true })
  const pythonLocation = join(root, 'localappdata', 'ZeroWall Science', 'python-location.json')
  mkdirSync(dirname(pythonLocation), { recursive: true })
  writeFileSync(pythonLocation, JSON.stringify({ runtimeRoot: join(root, 'shared-python', 'Python') }))
  const packaged = await locatePackagedApp(desktopRoot)
  const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
  application = spawn(packaged.executablePath, ['--remote-debugging-port=0', `--user-data-dir=${join(root, 'chromium')}`], {
    cwd: packaged.root,
    env: {
      ...environment,
      APPDATA: join(root, 'appdata'),
      LOCALAPPDATA: join(root, 'localappdata'),
      ZEROWALL_USER_DATA_DIR: join(root, 'zerowall-user-data'),
      USERPROFILE: root,
      HOME: root,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'false',
    },
    stdio: 'pipe',
    windowsHide: true,
  })
  const captureApplicationOutput = (chunk: Buffer): void => {
    applicationOutput = `${applicationOutput}${chunk.toString()}`.slice(-40_000)
  }
  application.stdout.on('data', captureApplicationOutput)
  application.stderr.on('data', captureApplicationOutput)
  const endpoint = await waitForDevToolsEndpoint(application, 150_000)
  browser = await chromium.connectOverCDP(endpoint)
  const context = browser.contexts()[0]
  if (!context) throw new Error('Electron did not expose a browser context')
  page = await waitForMainPage(context, application, 150_000).catch(error => {
    let hostOutput = ''
    try { hostOutput = readFileSync(join(root, 'zerowall-user-data', 'logs', 'harness.log'), 'utf8').slice(-30_000) } catch { /* Host may not have created its log yet. */ }
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nElectron diagnostics:\n${applicationOutput}\nHost diagnostics:\n${hostOutput}`)
  })
  page.on('console', message => rendererOutput.push(`[console:${message.type()}] ${message.text()}`))
  page.on('pageerror', error => rendererOutput.push(`[pageerror] ${error.stack ?? error.message}`))
  try {
    await page.getByText('ZeroWall Science', { exact: true }).first().waitFor({ state: 'visible', timeout: 150_000 })
  } catch (error) {
    const body = await page.locator('body').innerText().catch(() => '(body unavailable)')
    throw new Error([
      error instanceof Error ? error.message : String(error),
      `Renderer URL: ${page.url()}`,
      `Renderer body:\n${body.slice(0, 20_000)}`,
      `Renderer diagnostics:\n${rendererOutput.slice(-100).join('\n')}`,
      `Electron diagnostics:\n${applicationOutput}`,
    ].join('\n\n'))
  }
  await completeFirstRunOnboarding(page)
  await page.getByRole('dialog', { name: '登录或注册' }).waitFor({ state: 'hidden', timeout: 30_000 })
})

afterAll(async () => {
  stopProcessTree(application)
  await browser?.close().catch(() => undefined)
  if (application?.exitCode === null) {
    await Promise.race([
      new Promise<void>(resolveClosed => application.once('close', () => resolveClosed())),
      new Promise<void>(resolveTimeout => setTimeout(resolveTimeout, 5_000)),
    ])
  }
  for (const target of roots.splice(0)) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        rmSync(target, { recursive: true, force: true })
        break
      } catch (error) {
        if (attempt >= 20 || !['EPERM', 'EBUSY', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
        await new Promise(resolveRetry => setTimeout(resolveRetry, 500))
      }
    }
  }
})

afterEach(async context => {
  if (context.task.result?.state === 'fail') {
    const diagnostic = join(contract.verification, 'electron'); mkdirSync(diagnostic, { recursive: true })
    await page.screenshot({ path: join(diagnostic, 'failed-workbench.png') }).catch(() => undefined)
    console.log('Failed packaged UI', (await page.locator('body').innerText().catch(() => '')).slice(-16000), rendererOutput.filter(line => line.startsWith('[pageerror]')).slice(-5))
  }
  await page.setViewportSize({ width: 1280, height: 900 })
  // Restore the normal panel after a failed fullscreen interaction so one
  // failed assertion cannot obscure every later Settings/credentials check.
  await page.evaluate(() => (document.querySelector('[data-sidebar-right-panel="fullscreen"] [data-sidebar-right-mode]') as HTMLButtonElement | null)?.click())
  const settings = page.getByRole('dialog', { name: /^(设置|Settings)$/ })
  if (await settings.isVisible().catch(() => false)) {
    if (await page.getByRole('dialog', { name: 'Settings', exact: true }).isVisible()) {
      await settings.getByRole('button', { name: 'General', exact: true }).click()
      await settings.getByRole('button', { name: /English/ }).click()
      await page.getByRole('menuitem', { name: '中文' }).click()
    }
    await settings.getByRole('button', { name: /^(关闭|Close)$/ }).click()
    await settings.waitFor({ state: 'hidden', timeout: 30_000 })
  }
  for (let depth = 0; depth < 4; depth += 1) {
    const visibleDialogs = page.locator('[role="dialog"]:visible')
    if (await visibleDialogs.count() === 0) break
    await page.keyboard.press('Escape')
    await page.waitForTimeout(50)
  }
})

describe('ZeroWall Science Electron', () => {
  it('starts with the iOS appearance and no factory painting', async () => {
    await expect.poll(() => page.evaluate(() => ({
      dark: document.body.getAttribute('data-ds-dark-theme'),
      wallpaper: [...document.body.children].some(element => (element as HTMLElement).style.backgroundImage.includes('url(')),
      composer: document.documentElement.style.getPropertyValue('--dsh-dream-skin-composer-fill'),
      modal: document.documentElement.style.getPropertyValue('--dsh-dream-skin-modal-fill'),
      skin: localStorage.getItem('dsh-dream-skin:skin'),
      builtin: localStorage.getItem('dsh-dream-skin:builtin-last'),
    }))).toMatchObject({ dark: null, wallpaper: false, composer: '100%', modal: '100%', builtin: null, skin: 'ivory' })
    const output = contract.verification
    mkdirSync(output, { recursive: true })
    await page.screenshot({ path: join(output, 'default-ios.png') })
  })

  it('preserves an explicitly chosen skin and custom wallpaper', async () => {
    const setWallpaper = async (image: string, skin: string) => {
      await page.evaluate(async ({ image, skin }) => {
        const response = await fetch('/dream-skin/api', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ method: 'set', patch: {
            'dsh-dream-skin:wallpaper': image,
            'dsh-dream-skin:wallpaper-kind': 'image',
            'dsh-dream-skin:skin': skin,
            'dsh-dream-skin:composer-opacity': '0.4',
            'dsh-dream-skin:modal-opacity': '0.6',
          } }),
        })
        if (!response.ok) throw new Error('Failed to seed appearance fixture')
        // A real user choice changes both renderer storage and durable Host
        // state. Keep that provenance in this fixture rather than changing
        // only the Host while an old renderer still owns its local values.
        const patch = {
          'dsh-dream-skin:wallpaper': image, 'dsh-dream-skin:wallpaper-kind': 'image',
          'dsh-dream-skin:skin': skin, 'dsh-dream-skin:composer-opacity': '0.4',
          'dsh-dream-skin:modal-opacity': '0.6',
        }
        const snapshot = JSON.parse(localStorage.getItem('dsh-dream-skin:factory-seeded') ?? '{}')
        for (const [key, value] of Object.entries(patch)) { localStorage.setItem(key, value); delete snapshot[key] }
        localStorage.setItem('dsh-dream-skin:factory-seeded', JSON.stringify(snapshot))
      }, { image, skin })
      await reloadWithoutCredentials(page)
    }
    const custom = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII='
    try {
      await setWallpaper(custom, 'abyss')
      await expect.poll(() => page.evaluate(() => ({
        scheme: document.documentElement.style.colorScheme,
        image: localStorage.getItem('dsh-dream-skin:wallpaper'),
        composer: document.documentElement.style.getPropertyValue('--dsh-dream-skin-composer-fill'),
      }))).toEqual({ scheme: 'dark', image: custom, composer: '40%' })
    } finally {
      await page.evaluate(async () => {
        await fetch('/dream-skin/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method: 'set', patch: {
          'dsh-dream-skin:wallpaper': null, 'dsh-dream-skin:wallpaper-kind': null,
          'dsh-dream-skin:skin': 'ivory', 'dsh-dream-skin:builtin-last': 'ivory',
          'dsh-dream-skin:composer-opacity': '1', 'dsh-dream-skin:modal-opacity': '1',
        } }) })
        for (const key of ['wallpaper', 'wallpaper-kind']) localStorage.removeItem(`dsh-dream-skin:${key}`)
        for (const [key, value] of Object.entries({ skin: 'ivory', 'builtin-last': 'ivory', 'composer-opacity': '1', 'modal-opacity': '1' })) localStorage.setItem(`dsh-dream-skin:${key}`, value)
      })
      await reloadWithoutCredentials(page)
    }
  })

  it('renders relative Markdown images and loads models in a fresh workspace', async () => {
    const workspacePath = join(root, 'markdown-images')
    mkdirSync(workspacePath)
    const source = '# 图片回归\n\n![Figure 2: 四分位分析](figure2_quartile_v2.png)\n'
    writeFileSync(join(workspacePath, 'report.md'), source)
    writeFileSync(join(workspacePath, 'figure2_quartile_v2.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64'))
    const workspace = await rpc(page, 'workspace/create', { request: { path: workspacePath } })
    const session = await rpc(page, 'session/create', { request: { workspaceId: workspace.workspace.workspaceId } })
    markdownSessionId = session.sessionId
    // Persist the exact workspace-bound session. A blank session is excluded
    // from history; the isolated profile has no credentials and no provider call
    // can succeed. This exercises the real session/Host path without changing models.
    await rpc(page, 'session/prompt', { request: { sessionId: markdownSessionId, requestId: crypto.randomUUID(), mode: 'queue', content: [{ type: 'text', text: 'Markdown preview regression' }] } })
    await expect.poll(async () => (await rpc(page, 'session/list', { _request: {} })).items.find((item: { sessionId: string }) => item.sessionId === markdownSessionId)?.blank).toBe(false)
    await rpc(page, 'session/rename', { request: { sessionId: markdownSessionId, title: '图片与模型回归' } })
    await reloadWithoutCredentials(page)
    await page.getByText('markdown-images', { exact: true }).first().click()
    await page.getByText('图片与模型回归', { exact: true }).first().click()
    await page.getByRole('button', { name: /选择模型，当前/ }).first().waitFor({ timeout: 60_000 })
    const stop = page.getByRole('button', { name: '停止生成', exact: true })
    if (await stop.isVisible()) await stop.click()
    await expect.poll(() => page.getByRole('button', { name: '停止生成', exact: true }).count()).toBe(0)
    await page.locator('[data-sidebar-right-expand]').first().click()
    await page.locator('[data-sidebar-right-guide-entry="files"]').click().catch(async (error) => {
      console.log('Sidebar diagnostics', (await page.locator('body').innerText()).slice(-5000), rendererOutput.filter(line => line.startsWith('[pageerror]')).slice(-3))
      throw error
    })
    const pane = page.locator('[data-sidebar-right-panel]')
    await pane.locator('[role="button"][title$="report.md"]:visible').click({ position: { x: 8, y: 8 } }).catch(async error => {
      mkdirSync(join(contract.verification, 'electron'), { recursive: true })
      await page.screenshot({ path: join(contract.verification, 'electron', 'file-tree-diagnostic.png') })
      console.log('File tree diagnostics', await pane.innerText(), rendererOutput.filter(line => line.startsWith('[pageerror]')).slice(-3))
      throw error
    })
    const picture = pane.locator('img[alt="Figure 2: 四分位分析"]')
    await picture.waitFor()
    await picture.scrollIntoViewIfNeeded()
    await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
    expect(readFileSync(join(workspacePath, 'report.md'), 'utf8')).toBe(source)
    mkdirSync(join(contract.verification, 'electron'), { recursive: true })
    await page.screenshot({ path: join(contract.verification, 'electron', 'markdown-images.png') })
  })

  it('registers a workspace and restores its research workbench in the packaged application', async () => {
    const pane = page.locator('[data-sidebar-right-panel]')
    await pane.getByRole('button', { name: '新标签页', exact: true }).click()
    await pane.locator('[data-sidebar-right-guide-entry$="science-workbench"]').click()
    await pane.getByRole('region', { name: '科研工具', exact: true }).waitFor()
    // Use the persisted conversation created by the preceding Markdown check.
    // Empty sessions are deliberately absent from the rc.2 history view.
    const sessionId = markdownSessionId
    expect(sessionId).toBeTruthy()
    await rpc(page, 'session/rename', { request: { sessionId, title: '8.0.0 科研插件验收' } })
    await reloadWithoutCredentials(page)
    await page.getByText('8.0.0 科研插件验收', { exact: true }).first().click()
    const expand = page.locator('[data-sidebar-right-expand]').first()
    if (await expand.isVisible()) await expand.click()
    const guide = pane.locator('[data-sidebar-right-guide-entry$="science-workbench"]')
    if (await guide.isVisible()) await guide.click()
    await pane.getByRole('region', { name: '科研工具', exact: true }).waitFor()
    // The current card homepage registers its project automatically. Asset
    // fixtures go through the real scoped Host API; viewers and exports remain UI checks.
    const project = await rpc(page, 'zerowallResearch/registerSessionProject', { input: { sessionId } })
    expect(project.rootPath).toBe(join(root, 'markdown-images'))
    const registerAsset = async (path: string) => rpc(page, 'zerowallResearch/registerLocalAsset', { input: { sessionId, path } })
    const output = join(contract.verification, 'electron')
    mkdirSync(output, { recursive: true })
    await page.screenshot({ path: join(output, 'science-workbench-restored.png') })
    const openTool = async (title: string) => {
      const back = pane.getByRole('button', { name: '返回科研工作台', exact: true })
      if (await back.isVisible()) await back.click()
      await pane.getByRole('region', { name: '科研工具', exact: true }).getByRole('button', { name: new RegExp(title) }).click()
    }
    const science = async (input: Record<string, unknown>) => rpc(page, 'zerowallResearch/scienceViewer', { input: { sessionId, ...input } })
    writeFileSync(join(root, 'markdown-images', 'reference.pdb'), moleculePdb)
    await registerAsset('reference.pdb')
    await openTool('分子结构')
    const molecule = pane.getByRole('region', { name: '分子结构查看器', exact: true })
    const option = molecule.getByLabel('分子资产', { exact: true }).locator('option').filter({ hasText: 'reference.pdb' })
    await option.waitFor({ state: 'attached' })
    await molecule.getByLabel('分子资产', { exact: true }).selectOption((await option.getAttribute('value'))!)
    const moleculeCanvas = molecule.locator('[data-testid="molecule-canvas"][data-ready="true"]')
    await moleculeCanvas.waitFor({ timeout: 60000 })
    const moleculeViewer = (await science({ action: 'list' })).viewers.find((item: { tool: string }) => item.tool === 'molecule')
    const measured = await science({ action: 'molecule_measure', viewerId: moleculeViewer.id, expectedVersion: moleculeViewer.version,
      molecule: { sessionId, action: 'measure', atomA: 0, atomB: 8 } })
    expect(measured.molecule.measurement.distanceAngstrom).toBeCloseTo(5, 4)
    expect(readFileSync(join(root, 'markdown-images', 'reference.pdb'), 'utf8')).toBe(moleculePdb)
    await molecule.screenshot({ path: join(output, 'molecule-packaged.png') })

    const canvasSpec = { title: 'Packaged canvas fixture', width: 900, height: 650, xLabel: 'Time', yLabel: 'Value',
      series: [{ id: 'series-a', name: 'Fixture', color: '#2157a3', points: [{ x: 0, y: 1 }, { x: 1, y: 3 }] }] }
    await page.evaluate(({ sessionId, spec }) => localStorage.setItem(`zerowall:canvas:${sessionId}`, JSON.stringify(spec)), { sessionId, spec: canvasSpec })
    await openTool('科研画布')
    const canvas = pane.getByRole('region', { name: '科研画布查看器', exact: true })
    await canvas.getByRole('button', { name: '查看画布', exact: true }).click()
    await canvas.getByLabel('科研画布预览').locator('svg').first().waitFor()
    const exportedCanvas = await science({ action: 'canvas_export', canvas: { sessionId, action: 'export', spec: canvasSpec } })
    expect(exportedCanvas.canvas.artifacts).toHaveLength(4)
    for (const artifact of exportedCanvas.canvas.artifacts) expect(readFileSync(fileURLToPath(artifact.uri)).length).toBeGreaterThan(0)
    await canvas.getByLabel('科研画布预览').screenshot({ path: join(output, 'canvas-packaged.png') })

    writeFileSync(join(root, 'markdown-images', 'pcr-reference.fasta'), `>reference\n${pcrTemplate}\n`)
    const sequenceAsset = await registerAsset('pcr-reference.fasta')
    await openTool('序列/Motif')
    const sequence = pane.locator('#science-panel-sequence')
    const sequenceOption = sequence.getByLabel('序列资产', { exact: true }).locator('option').filter({ hasText: 'pcr-reference.fasta' })
    await sequenceOption.waitFor({ state: 'attached' })
    await sequence.getByLabel('序列资产', { exact: true }).selectOption((await sequenceOption.getAttribute('value'))!)
    await sequence.getByLabel('碱基视图', { exact: true }).waitFor()
    const opened = await science({ action: 'open', assetId: sequenceAsset.id })
    const saved = await science({ action: 'save', viewerId: opened.viewer.id, expectedVersion: opened.viewer.version,
      state: { recordIndex: 0, start: 1, count: 2400, selectionStart: 1, selectionEnd: pcrTemplate.length } })
    const exportedSequence = await science({ action: 'export', viewerId: saved.viewer.id, expectedVersion: saved.viewer.version, operation: 'pcr',
      sequenceOptions: { forwardPrimer: pcrForward, reversePrimer: pcrReverse, forwardAnnealLength: 20, reverseAnnealLength: 20, templateTopology: 'linear' } })
    expect(exportedSequence.analysis.sequence).toBe(pcrExpected)
    expect(readFileSync(fileURLToPath(exportedSequence.artifact.uri)).length).toBeGreaterThan(0)
    await sequence.screenshot({ path: join(output, 'sequence-pcr-packaged.png') })
    writeFileSync(join(output, 'research-receipt.json'), JSON.stringify({ applicationVersion: '8.0.0', workspaceRestored: true,
      scope: 'Packaged readonly viewers and real Host actions using local software fixtures', moleculeDistanceAngstrom: measured.molecule.measurement.distanceAngstrom,
      canvasExports: exportedCanvas.canvas.artifacts.length, pcrFixturePassed: true }, null, 2))

  }, 300_000)

  it('keeps the custom chrome clear and opens WeChat and right sidebar controls', async () => {
    const controls = await page.locator('#zerowall-window-controls').boundingBox()
    expect(controls).not.toBeNull()
    expect(controls!.x).toBeLessThan(8)
    expect(controls!.y).toBeLessThan(8)
    expect(await page.locator('#zerowall-window-drag').count()).toBe(0)
    const drag = page.locator('header[data-window-drag]:visible').first()
    expect((await drag.boundingBox())?.height).toBeGreaterThan(20)
    expect(await drag.evaluate(element => getComputedStyle(element).getPropertyValue('-webkit-app-region'))).toBe('drag')
    const chromeButtonRegions = await page.locator('#zerowall-window-controls button').evaluateAll(buttons =>
      buttons.map(button => getComputedStyle(button).getPropertyValue('-webkit-app-region')))
    expect(chromeButtonRegions).toEqual(['no-drag', 'no-drag', 'no-drag'])

    const github = page.getByRole('link', { name: 'GitHub 项目', exact: true })
    await github.waitFor({ state: 'visible' })
    expect(await github.getAttribute('href')).toBe('https://github.com/ccfwwm/zerowallscience')
    expect(await github.locator('[data-zerowall-footer-status-dot]').count()).toBe(0)

    const account = page.getByRole('button', { name: '登录AI平台', exact: true })
    const wechat = page.getByRole('button', { name: /^微信 WebChat/ })
    await account.waitFor({ state: 'visible' })
    await wechat.waitFor({ state: 'visible' })
    for (const action of [github, wechat, account]) {
      expect((await action.boundingBox())?.height).toBe(36)
    }
    expect(await account.locator('[data-zerowall-footer-status-dot]').count()).toBe(1)
    expect(await wechat.locator('[data-zerowall-footer-status-dot]').count()).toBe(1)
    expect(await account.getAttribute('data-connection')).toMatch(/^(online|waiting|offline)$/)
    expect(await wechat.getAttribute('data-connection')).toMatch(/^(online|waiting|offline)$/)

    const toggle = page.locator('#zerowall-window-controls [data-action="toggle-maximize"]')
    await expect.poll(async () => await toggle.getAttribute('aria-label')).toBe('最大化')
    await toggle.click()
    await expect.poll(async () => await toggle.getAttribute('aria-label')).toBe('还原窗口')
    await toggle.click()
    await expect.poll(async () => await toggle.getAttribute('aria-label')).toBe('最大化')

    await wechat.click()
    const settings = page.getByRole('dialog', { name: '设置' })
    await settings.getByText('等待扫码', { exact: true }).first().waitFor()
    expect(await settings.getByRole('button', { name: 'WeChat', exact: true }).getAttribute('aria-current')).toBe('true')
    await settings.getByRole('button', { name: '关闭', exact: true }).click()

    const expand = page.locator('[data-sidebar-right-expand]')
    if (await expand.isVisible()) await expand.click()
    const right = page.locator('[data-sidebar-right-panel]:visible').first()
    await right.waitFor({ state: 'visible' })
    // In a crowded strip its filler has zero width, while the strip itself
    // remains the desktop drag surface and all controls remain clickable.
    const fill = right.locator('[data-dockkit-strip]:visible [data-dockkit-strip-fill]').first()
    expect(await fill.evaluate(element => getComputedStyle(element).getPropertyValue('-webkit-app-region'))).toBe('drag')
    const checkRightControls = async () => {
      for (const selector of ['[data-dockkit-tab]', '[data-dockkit-add-tab]', '[data-dockkit-split-button]', '[data-sidebar-right-mode]', '[data-sidebar-right-toggle]']) {
        const target = right.locator(`${selector}:visible`).first()
        if (await target.count() === 0 || await target.isDisabled()) continue
        expect(await target.evaluate(element => getComputedStyle(element).getPropertyValue('-webkit-app-region'))).toBe('no-drag')
        await target.click({ trial: true })
      }
    }
    await checkRightControls()
    await toggle.click()
    await expect.poll(async () => await toggle.getAttribute('aria-label')).toBe('还原窗口')
    await checkRightControls()
    await toggle.click()
    await expect.poll(async () => await toggle.getAttribute('aria-label')).toBe('最大化')
    const tab = right.locator('[data-dockkit-tab]:visible').first()
    const tabBounds = await tab.boundingBox()
    expect(tabBounds).not.toBeNull()
    expect(tabBounds!.height).toBeGreaterThan(0)
    await tab.click()
    expect(await tab.getAttribute('aria-selected')).toBe('true')
    const mode = right.locator('[data-sidebar-right-mode]:visible').first()
    await mode.click()
    await expect.poll(() => right.getAttribute('data-sidebar-right-panel')).toBe('fullscreen')
    await checkRightControls()
    await right.locator('[data-sidebar-right-mode]:visible').first().click()
    await expect.poll(() => right.getAttribute('data-sidebar-right-panel')).toBe('push')
  })

  it('does not mount the removed capability management module', async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '设置' })
    expect(await settings.getByRole('button', { name: '能力管理', exact: true }).count()).toBe(0)
    await settings.getByRole('button', { name: '内置插件', exact: true }).click()
    await settings.getByRole('tab', { name: 'Skills', exact: true }).click()
    await settings.locator('[aria-label="Skills 目录"] button').first().waitFor({ state: 'visible' })
  })
  it('loads a direct, sandboxed, fully ZeroWall-branded Renderer', async () => {
    expect(page.url()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
    expect(await page.locator('iframe').count()).toBe(0)
    // The post-onboarding shell exposes one canonical product label; older
    // builds rendered a duplicate label in the splash/header combination.
    expect(await page.getByText('ZeroWall Science', { exact: true }).count()).toBeGreaterThanOrEqual(1)
    expect(await page.getByText(/DeepSeek Harness/i).count()).toBe(0)
    const renderer = await page.evaluate(() => ({ process: typeof process, require: typeof (globalThis as { require?: unknown }).require, desktop: typeof (window as unknown as { zerowallDesktop?: unknown }).zerowallDesktop }))
    expect(renderer).toEqual({ process: 'undefined', require: 'undefined', desktop: 'object' })
    expect(await page.evaluate(() => typeof (window as unknown as { zerowallDesktop?: { revealPath?: unknown } }).zerowallDesktop?.revealPath)).toBe('function')
    expect(await page.getByRole('button', { name: '科研项目' }).count()).toBe(0)
    expect(await page.getByRole('button', { name: '科研工作台' }).count()).toBe(0)
    expect(await page.getByRole('button', { name: 'MCP 连接' }).count()).toBe(0)
    const bootEntries = await page.evaluate(() => {
      const boot = (window as unknown as { __DSH_BOOT__?: { entries?: Array<{ id: string }> } }).__DSH_BOOT__
      return Array.isArray(boot?.entries) ? boot.entries.map(entry => entry.id) : []
    })
    expect(bootEntries).toContain('dsh-better-sidebar')
    expect(bootEntries).not.toContain('dsh-better-sidebar-icons')
    expect(bootEntries).not.toContain('@huanlin/dsh-plugin-better-sidebar-plugin-office')
    expect(bootEntries).toContain('dsh-zotero')
    expect(bootEntries).not.toContain('@fylar/dsh-fylar-office-editor')
  })

  it.skipIf(!clipboardAccess.available)('bridges chat copies through the trusted desktop API', async () => {
    const probe = `ZeroWall clipboard ${Date.now()}`
    await page.evaluate((text) => {
      const button = document.createElement('button')
      button.id = 'zerowall-clipboard-probe'
      button.textContent = 'clipboard probe'
      button.addEventListener('click', () => {
        button.dataset.stage = 'clicked'
        void (async () => {
          const desktop = (window as unknown as {
            zerowallDesktop?: { copyText?: (value: string) => Promise<boolean> }
          }).zerowallDesktop
          const written = await desktop?.copyText?.(text)
          button.dataset.written = String(written)
          button.dataset.result = JSON.stringify({ written })
          button.dataset.stage = 'written'
        })().catch((error: unknown) => {
          button.dataset.error = error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error)
          button.dataset.stage = 'error'
        })
      })
      document.body.appendChild(button)
    }, probe)

    const button = page.locator('#zerowall-clipboard-probe')
    await button.click()
    await expect.poll(async () => await button.evaluate(element => ({
      error: element.getAttribute('data-error'),
      result: element.getAttribute('data-result'),
    })), { timeout: 5_000 }).not.toEqual({ error: null, result: null })
    const diagnostic = await button.evaluate(element => ({
      error: element.getAttribute('data-error'),
      result: element.getAttribute('data-result'),
      stage: element.getAttribute('data-stage'),
      written: element.getAttribute('data-written'),
    }))
    expect(diagnostic, JSON.stringify(diagnostic)).toMatchObject({
      error: null,
      result: JSON.stringify({ written: true }),
      stage: 'written',
      written: 'true',
    })
    expect(await button.getAttribute('data-error')).toBeNull()
    await button.evaluate(element => element.remove())
  })

  it.skipIf(!clipboardAccess.available)('copies an attachment as a persistent Windows file drop with exact bytes', async () => {
    const content = Buffer.from('%PDF-1.7\nZeroWall file clipboard\n%%EOF')
    const success = await page.evaluate(async data => {
      const desktop = (window as unknown as { zerowallDesktop: { copyFile(input: { name: string; mediaType: string; data: string }): Promise<boolean> } }).zerowallDesktop
      return desktop.copyFile({ name: '文献 attachment.pdf', mediaType: 'application/pdf', data })
    }, content.toString('base64'))
    expect(success).toBe(true)
    const script = "Add-Type -AssemblyName System.Windows.Forms; [Console]::Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([Windows.Forms.Clipboard]::GetFileDropList()[0])))"
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8', timeout: 15_000 })
    expect(result.status, result.stderr).toBe(0)
    const path = Buffer.from(result.stdout.trim(), 'base64').toString('utf8')
    expect(path).toContain('文献 attachment.pdf')
    expect(readFileSync(path)).toEqual(content)
  })

  it('defaults to Chinese and switches between Chinese and English in Settings', async () => {
    await page.getByRole('button', { name: '设置' }).click()
    const settings = page.getByRole('dialog', { name: '设置' })
    await settings.waitFor({ state: 'visible' })
    await settings.getByRole('button', { name: '外观', exact: true }).waitFor()
    expect(await settings.getByRole('button', { name: 'Theme / 外观', exact: true }).count()).toBe(0)
    await settings.getByRole('button', { name: /中文/ }).click()
    await page.getByRole('menuitem', { name: 'English' }).click()
    await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'visible' })
    await page.getByText('Language', { exact: true }).waitFor({ state: 'visible' })

    const englishSettings = page.getByRole('dialog', { name: 'Settings' })
    await englishSettings.getByRole('button', { name: 'Appearance', exact: true }).waitFor()
    expect(await englishSettings.getByRole('button', { name: '外观', exact: true }).count()).toBe(0)
    await englishSettings.getByRole('button', { name: 'Environment', exact: true }).click()
    await englishSettings.getByRole('heading', { name: 'Environment', exact: true }).waitFor()
    await englishSettings.getByRole('heading', { name: 'AIchem', exact: true }).waitFor()
    expect(await englishSettings.getByLabel('AIchem API token', { exact: true }).getAttribute('type')).toBe('password')
    await englishSettings.getByRole('region', { name: 'Literature services', exact: true }).getByRole('button', { name: 'Save settings', exact: true }).waitFor()
    await englishSettings.getByText('Review model mode', { exact: true }).waitFor()
    expect(await englishSettings.getByText('模型目录已同步', { exact: true }).count()).toBe(0)
    const artifacts = join(contract.verification, 'electron')
    mkdirSync(artifacts, { recursive: true })
    await page.screenshot({ path: join(artifacts, 'environment-english.png') })

    await englishSettings.getByRole('button', { name: 'General', exact: true }).click()
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: /English/ }).click()
    await page.getByRole('menuitem', { name: '中文' }).click()
    await page.getByRole('dialog', { name: '设置' }).waitFor({ state: 'visible' })
    await page.keyboard.press('Escape')
    await expect.poll(() => page.getByRole('dialog', { name: '设置' }).count()).toBe(0)
  })

  it('integrates plugins, Skills, and MCP under Settings capabilities', async () => {
    await page.getByRole('button', { name: '设置' }).click()
    const settings = page.getByRole('dialog', { name: '设置' })
    await settings.getByRole('button', { name: '内置插件', exact: true }).click()
    await settings.getByRole('tab', { name: 'Skills' }).click()
    await settings.getByText(/科研 Skills/).waitFor({ state: 'visible' })
    await settings.getByRole('button', { name: '添加 Skill' }).waitFor({ state: 'visible' })
    await settings.getByRole('button', { name: '导入文件夹' }).waitFor({ state: 'visible' })
    await settings.getByPlaceholder('搜索名称、描述或使用场景').fill('literature')
    await expect.poll(
      () => settings.getByText('literature-review', { exact: true }).count(),
      { timeout: 30_000 },
    ).toBeGreaterThan(0)
    await settings.getByRole('tab', { name: 'MCP' }).click()
    await settings.getByRole('heading', { name: 'MCP 连接', exact: true }).waitFor({ state: 'visible' })
    await settings.getByText('新建连接', { exact: true }).waitFor({ state: 'visible' })
    await settings.getByRole('button', { name: '导入' }).waitFor({ state: 'visible' })
    await settings.getByRole('button', { name: '导出' }).waitFor({ state: 'visible' })
    await settings.getByRole('button', { name: /rmcp/ }).click()
    expect(await settings.getByRole('checkbox', { name: '启用', exact: true }).isChecked()).toBe(true)
    const timeout = settings.getByLabel('工具超时（毫秒）', { exact: true })
    expect(await timeout.inputValue()).toBe('300000')
    expect(await settings.getByLabel('重试次数', { exact: true }).inputValue()).toBe('2')
    expect(await settings.getByLabel('URL', { exact: true }).isDisabled()).toBe(true)
    expect(await settings.getByRole('checkbox', { name: '启用', exact: true }).isChecked()).toBe(true)
    await timeout.fill('301000')
    const save = settings.getByRole('button', { name: '保存', exact: true })
    await save.click()
    await expect.poll(() => save.isEnabled(), { timeout: 30_000 }).toBe(true)
    await settings.getByRole('button', { name: '新建连接', exact: false }).click()
    await settings.getByRole('button', { name: /rmcp/ }).click()
    expect(await timeout.inputValue()).toBe('301000')
    expect(await settings.getByRole('checkbox', { name: '启用', exact: true }).isChecked()).toBe(true)
    await timeout.fill('300000')
    await save.click()
    await expect.poll(() => save.isEnabled(), { timeout: 30_000 }).toBe(true)
    await page.screenshot({ path: join(contract.verification, 'electron', 'mcp-saved.png') })
    await settings.getByRole('tab', { name: '插件列表' }).click()
    const globalPlugins = settings.getByRole('button', { name: /^(全局插件|Global plugins)/ })
    if (await globalPlugins.getAttribute('aria-expanded') === 'false') await globalPlugins.click()
    const optionalPlugin = settings.locator('li[data-plugin-module][data-plugin-entry]').first()
    await optionalPlugin.waitFor({ state: 'visible' })
    await optionalPlugin.getByRole('button').first().click()
    await optionalPlugin.locator('[data-loader-entry]').waitFor({ state: 'visible' })
    expect(await settings.locator('[data-package-meta-error]').count()).toBe(0)
    await settings.getByRole('button', { name: '关闭', exact: true }).click()
    await expect.poll(() => page.getByRole('dialog', { name: '设置' }).count()).toBe(0)
    await page.getByRole('button', { name: '插件', exact: true }).click()
    await page.getByRole('heading', { name: '插件', exact: true }).waitFor()
    await page.getByRole('button', { name: /添加插件/ }).waitFor()
    const bundles = await rpc(page, 'pluginManager/listBundles', {})
    const skills = bundles.find((bundle: { name: string }) => bundle.name === '@zerowallscience/plugin-skills')
    expect(skills).toMatchObject({ enabled: true, version: '0.1.0' })
    expect(skills.error).toBeUndefined()
    // The official manager shows optional and profile-installed bundles.
    // Default shipped bundles are inspected in Settings' Plugin list above.
    const offeredPackage = page.locator('[data-plugin-package="@deepseek-ai/dsh-experimental-voice-input-bundle"]')
    await offeredPackage.waitFor({ state: 'visible' })
    await offeredPackage.getByRole('switch').waitFor()
    await offeredPackage.getByRole('button', { name: /^查看 / }).click()
    await page.locator('[data-plugin-rows]').waitFor()
    expect(await page.locator('[data-package-meta-error]').count()).toBe(0)
    await page.getByRole('button', { name: '新建会话', exact: true }).first().click()
    await page.locator('[data-plugin-panel]').waitFor({ state: 'hidden' })
  })

  it('shows environment configuration as a list with AIchem credentials and live model catalog', async () => {
    await page.getByRole('button', { name: '设置' }).click()
    const settings = page.getByRole('dialog', { name: '设置' })
    await settings.getByRole('button', { name: '环境配置', exact: true }).click()
    await settings.getByRole('heading', { name: '化工社 AIchem' }).waitFor()
    await expect.poll(() => settings.getByText('模型目录已同步', { exact: true }).count(), { timeout: 30_000 }).toBe(1)
    expect(await settings.getByText('科研 MCP 能力', { exact: true }).count()).toBe(0)
    expect(await settings.getByLabel('化工社 API Token').getAttribute('type')).toBe('password')
    const literature = settings.getByRole('region', { name: '文献服务', exact: true })
    await literature.getByRole('heading', { name: '文献服务', exact: true }).waitFor()
    await expect.poll(() => literature.getByRole('button', { name: '检测 NCBI / PubMed', exact: true }).isEnabled()).toBe(true)
    for (const key of ['NCBI_API_KEY', 'S2_API_KEY', 'OPENALEX_API_KEY']) {
      expect(await literature.getByLabel(key, { exact: true }).getAttribute('type')).toBe('password')
      expect(await literature.getByLabel(key, { exact: true }).inputValue()).toBe('')
    }
    expect(await literature.getByRole('link', { name: 'NCBI / PubMed 获取 Key' }).getAttribute('href')).toBe('https://www.ncbi.nlm.nih.gov/account/settings/')
    const version = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8')).version
    const artifacts = join(contract.verification, 'electron')
    mkdirSync(artifacts, { recursive: true })
    for (const viewport of [{ width: 1280, height: 900 }, { width: 720, height: 900 }]) {
      await page.setViewportSize(viewport)
      await settings.getByRole('heading', { name: '环境配置', exact: true }).scrollIntoViewIfNeeded()
      expect(await settings.evaluate(element => {
        const top = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
        return top !== null && element.contains(top) && element.parentElement?.parentElement === document.body
      })).toBe(true)
      const rows = await settings.locator('article').evaluateAll(elements => elements.map(element => {
        const box = element.getBoundingClientRect()
        return { x: box.x, width: box.width, bottom: box.bottom, top: box.top }
      }))
      expect(rows.length).toBeGreaterThanOrEqual(6)
      const first = rows[0]!
      for (let i = 1; i < rows.length; i++) {
        const current = rows[i]!
        const previous = rows[i - 1]!
        expect(Math.abs(current.x - first.x)).toBeLessThan(2)
        expect(current.top).toBeGreaterThanOrEqual(previous.bottom - 1)
      }
      await page.screenshot({ path: join(artifacts, `environment-${viewport.width}.png`) })
      await literature.scrollIntoViewIfNeeded()
      const statusHeadingHeight = await literature.getByRole('columnheader', { name: '配置状态', exact: true }).evaluate(element => {
        const range = document.createRange()
        range.selectNodeContents(element)
        return range.getBoundingClientRect().height
      })
      expect(statusHeadingHeight).toBeLessThan(30)
      await page.screenshot({ path: join(artifacts, `literature-${viewport.width}.png`) })
      await settings.getByLabel('化工社 API Token').scrollIntoViewIfNeeded()
      await page.screenshot({ path: join(artifacts, `aichem-${viewport.width}.png`) })
    }
  })

  it('verifies variable privacy, clipboard, settings chrome and account layout', async () => {
    const version = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8')).version
    const artifacts = join(contract.verification, 'electron')
    mkdirSync(artifacts, { recursive: true })
    expect(await page.evaluate(() => !document.querySelector('[data-dsh-boot]') && document.querySelector('[data-dsh-better-sidebar], [data-zerowall-conversation], [contenteditable]') !== null)).toBe(true)
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '设置' })
    expect(await settings.getByRole('button', { name: '打开配置文件', exact: true }).count()).toBe(1)
    await settings.getByRole('button', { name: '环境配置', exact: true }).click()
    await settings.getByPlaceholder('变量名，例如 SCI_KEY').fill('ZEROWALL_UI_TEST')
    await settings.getByPlaceholder('变量值', { exact: true }).fill('test-only-650')
    await settings.getByRole('button', { name: '添加变量', exact: true }).click()
    const row = settings.locator('div').filter({ has: page.locator('code', { hasText: 'ZEROWALL_UI_TEST' }) }).filter({ has: page.getByRole('button', { name: '查看并复制' }) }).last()
    await row.getByRole('button', { name: '查看并复制' }).click()
    const viewer = page.getByRole('dialog', { name: 'ZEROWALL_UI_TEST' })
    await viewer.waitFor()
    expect(await viewer.getByLabel('变量值', { exact: true }).getAttribute('type')).toBe('password')
    await viewer.getByRole('button', { name: '复制值', exact: true }).click()
    if (clipboardAccess.available) await viewer.getByText('已复制', { exact: true }).waitFor()
    else await viewer.getByRole('alert').filter({ hasText: '无法访问剪贴板' }).waitFor()
    await viewer.getByRole('button', { name: '显示值', exact: true }).click()
    expect(await viewer.getByLabel('变量值', { exact: true }).inputValue()).toBe('test-only-650')
    await viewer.getByRole('button', { name: '隐藏值', exact: true }).click()
    await page.screenshot({ path: join(artifacts, 'variable-viewer.png') })
    await page.keyboard.press('Escape')
    expect(await settings.isVisible()).toBe(true)
    await row.getByRole('button', { name: '删除', exact: true }).click()
    await expect.poll(() => settings.locator('code', { hasText: 'ZEROWALL_UI_TEST' }).count()).toBe(0)
    await settings.getByRole('heading', { name: '环境配置', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(artifacts, 'environment.png') })
    await settings.getByRole('button', { name: 'Python 环境', exact: true }).click()
    await page.screenshot({ path: join(artifacts, 'python.png') })
    await page.keyboard.press('Escape')
    expect(await settings.isVisible()).toBe(false)
    const expand = page.getByRole('button', { name: '展开快捷入口', exact: true })
    if (await expand.isVisible()) await expand.click()
    const login = page.getByRole('button', { name: '登录AI平台', exact: true })
    const update = page.locator('button[data-update]')
    expect(await update.evaluate((element) => element.previousElementSibling?.textContent)).toContain('登录AI平台')
    await update.click()
    await page.getByRole('dialog').waitFor()
    await page.screenshot({ path: join(artifacts, 'update.png') })
    await page.keyboard.press('Escape')
    await login.click()
    const account = page.getByRole('dialog', { name: '登录或注册' })
    await account.waitFor()
    await page.screenshot({ path: join(artifacts, 'login.png') })
  })

  it('opens the account surface without exposing credentials to the Renderer', async () => {
    await page.keyboard.press('Escape')
    const expand = page.getByRole('button', { name: '展开快捷入口', exact: true })
    if (await expand.isVisible()) await expand.click()
    await page.getByRole('button', { name: '登录AI平台' }).click()
    const account = page.getByRole('dialog', { name: '登录或注册' })
    await account.waitFor({ state: 'visible' })
    expect(await account.getByLabel('密码', { exact: true }).getAttribute('type')).toBe('password')
    const source = await page.evaluate(() => JSON.stringify((window as unknown as { zerowallDesktop: unknown }).zerowallDesktop))
    expect(source).not.toMatch(/credential|secret|token|password/i)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await account.evaluate((dialog) => [...dialog.querySelectorAll<HTMLElement>('*')]
      .filter(element => getComputedStyle(element).overflowX === 'visible' && element.scrollWidth > element.clientWidth + 1)
      .map(element => element.textContent?.trim().slice(0, 80) ?? element.tagName))).toEqual([])
    await account.getByRole('button', { name: '忘记密码？', exact: true }).click()
    const reset = page.getByRole('dialog', { name: '重置密码', exact: true })
    await reset.waitFor()
    expect(await reset.getByLabel('密码', { exact: true }).count()).toBe(0)
    expect(await reset.getByRole('button', { name: '发送重置邮件', exact: true }).isVisible()).toBe(true)
    const version = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8')).version
    const artifacts = join(contract.verification, 'electron')
    mkdirSync(artifacts, { recursive: true })
    await page.screenshot({ path: join(artifacts, 'account-password-reset-mobile.png') })
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '设置', exact: true })
    await settings.getByRole('button', { name: 'AI 云平台', exact: true }).click()
    await settings.getByRole('heading', { name: '重置密码', exact: true }).waitFor()
    expect(await settings.getByRole('button', { name: '发送重置邮件', exact: true }).isVisible()).toBe(true)
    await page.screenshot({ path: join(artifacts, 'account-password-reset-settings.png') })
  })
})

// This credential-free profile deliberately skips configuration. That decision
// First-run onboarding is available manually from Settings; desktop launch keeps
// the workbench usable without showing either startup dialog.
async function reloadWithoutCredentials(page: Page): Promise<void> {
  await page.reload()
  await page.getByRole('button', { name: '设置', exact: true }).waitFor({ state: 'visible', timeout: 60_000 })
  expect(await page.getByRole('dialog', { name: '添加一个 API Key 开始使用' }).count()).toBe(0)
}
async function completeFirstRunOnboarding(page: Page): Promise<void> {
  await page.getByRole('button', { name: '设置', exact: true }).waitFor({ state: 'visible', timeout: 60_000 })
  await page.waitForTimeout(500)
  expect(await page.getByRole('dialog', { name: '内测声明' }).count()).toBe(0)
  expect(await page.getByRole('dialog', { name: '添加一个 API Key 开始使用' }).count()).toBe(0)
}

async function waitForDevToolsEndpoint(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<string> {
  return await new Promise<string>((resolveEndpoint, rejectEndpoint) => {
    let output = ''
    const timeout = setTimeout(() => rejectEndpoint(new Error(`Electron DevTools endpoint timed out.\n${output}`)), timeoutMs)
    const onData = (chunk: Buffer): void => {
      output = `${output}${chunk.toString()}`.slice(-20_000)
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (!match?.[1]) return
      clearTimeout(timeout)
      resolveEndpoint(match[1])
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.once('exit', (code) => {
      clearTimeout(timeout)
      rejectEndpoint(new Error(`Electron exited before exposing DevTools (code ${code ?? 'unknown'}).\n${output}`))
    })
  })
}

async function waitForMainPage(
  context: BrowserContext,
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const main = context.pages().find(candidate => /^http:\/\/127\.0\.0\.1:\d+\/$/.test(candidate.url()))
    if (main) return main
    if (child.exitCode !== null) {
      throw new Error(`Electron exited before the main page loaded (code ${String(child.exitCode)})`)
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  const urls = context.pages().map(candidate => candidate.url()).join(', ')
  throw new Error(`Electron did not expose the main Renderer page; observed: ${urls || '(none)'}`)
}

function stopProcessTree(child: ChildProcessWithoutNullStreams | undefined): void {
  if (!child?.pid || child.exitCode !== null) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
    return
  }
  child.kill('SIGTERM')
}

async function rpc(page: Page, method: string, args: Record<string, unknown>): Promise<any> {
  return page.evaluate(async ({ method, args }) => {
    const response = await fetch(`/api/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args } }),
    })
    const envelope = await response.json()
    if (!response.ok || !envelope.result?.ok) throw new Error(`${method}: ${JSON.stringify(envelope)}`)
    return envelope.result.value
  }, { method, args })
}
