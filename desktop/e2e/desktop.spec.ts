import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { locatePackagedApp } from '../scripts/packaged-app.mjs'
import { pcrTemplate, pcrForward, pcrReverse, pcrExpected } from '../../plugins/research/test/sequence-simulation-fixture.js'
import { moleculePdb } from '../../plugins/research/test/molecule-fixture.js'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const roots: string[] = []
let application: ChildProcessWithoutNullStreams
let browser: Browser
let page: Page
let root: string
let applicationOutput = ''
const rendererOutput: string[] = []

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'zerowall-electron-e2e-')); roots.push(root)
  mkdirSync(join(root, 'appdata'), { recursive: true })
  mkdirSync(join(root, 'localappdata'), { recursive: true })
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
  for (const target of roots.splice(0)) rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

afterEach(async context => {
  if (context.task.result?.state === 'fail') {
    const diagnostic = join(desktopRoot, 'dist', 'verification-7.0.0'); mkdirSync(diagnostic, { recursive: true })
    await page.screenshot({ path: join(diagnostic, 'failed-workbench.png') }).catch(() => undefined)
    console.log('Failed packaged UI', (await page.locator('body').innerText().catch(() => '')).slice(-16000), rendererOutput.filter(line => line.startsWith('[pageerror]')).slice(-5))
  }
  await page.setViewportSize({ width: 1280, height: 900 })
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
  it('starts with the built-in light appearance and no wallpaper', async () => {
    await expect.poll(() => page.evaluate(() => ({
      dark: document.body.getAttribute('data-ds-dark-theme'),
      wallpaper: [...document.body.children].some(element => (element as HTMLElement).style.backgroundImage.includes('url(')),
      composer: document.documentElement.style.getPropertyValue('--dsh-dream-skin-composer-fill'),
      modal: document.documentElement.style.getPropertyValue('--dsh-dream-skin-modal-fill'),
      skin: localStorage.getItem('dsh-dream-skin:skin'),
      builtin: localStorage.getItem('dsh-dream-skin:builtin-last'),
    }))).toMatchObject({ dark: null, wallpaper: false, composer: '100%', modal: '100%', builtin: 'light', skin: 'system' })
    const output = join(desktopRoot, 'dist', 'verification-6.0.2')
    mkdirSync(output, { recursive: true })
    await page.screenshot({ path: join(output, 'default-light.png') })
  })

  it('removes the old factory painting from durable preferences and keeps custom wallpapers', async () => {
    const patch = readFileSync(join(desktopRoot, '..', 'patches', 'dsh-dream-skin@9.13.1.patch'), 'utf8')
    const oldImageSource = patch.match(/^-\s*\[WALLPAPER_KEY\]: ("data:image\/jpeg;base64,[^"]+")/mu)?.[1]
    if (!oldImageSource) throw new Error('The patch must identify the removed factory painting')
    const oldImage = JSON.parse(oldImageSource) as string
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
      }, { image, skin })
      await reloadWithoutCredentials(page)
    }
    await setWallpaper(oldImage, 'nebula')
    await expect.poll(() => page.evaluate(async () => {
      const response = await fetch('/dream-skin/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method: 'get' }) })
      const state = (await response.json()).value
      return { wallpaper: state['dsh-dream-skin:wallpaper'] ?? null, builtin: state['dsh-dream-skin:builtin-last'], composer: state['dsh-dream-skin:composer-opacity'] }
    })).toEqual({ wallpaper: null, builtin: 'light', composer: '1' })
    await reloadWithoutCredentials(page)
    await expect.poll(() => page.evaluate(() => ({
      scheme: document.documentElement.style.colorScheme,
      image: localStorage.getItem('dsh-dream-skin:wallpaper'),
    }))).toEqual({ scheme: 'light', image: null })

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
          'dsh-dream-skin:skin': 'system', 'dsh-dream-skin:builtin-last': 'light',
          'dsh-dream-skin:composer-opacity': '1', 'dsh-dream-skin:modal-opacity': '1',
        } }) })
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
    await page.evaluate(async (path) => {
      const rpc = async (method: string, request: unknown) => {
        const response = await fetch(`/api/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { request } } }) })
        const envelope = await response.json()
        if (!response.ok || !envelope.result?.ok) throw new Error(`${method}: ${JSON.stringify(envelope)}`)
        return envelope.result.value
      }
      const workspace = await rpc('workspace/create', { path })
      const session = await rpc('session/create', { workspaceId: workspace.workspace.workspaceId })
      await rpc('session/rename', { sessionId: session.sessionId, title: '图片与模型回归' })
    }, workspacePath)
    await reloadWithoutCredentials(page)
    await page.getByText('markdown-images', { exact: true }).first().click().catch(async (error) => {
      console.log('Workspace diagnostics', (await page.locator('body').innerText()).slice(0, 4000))
      throw error
    })
    await page.getByText('markdown-images', { exact: true }).first().hover()
    await page.getByRole('button', { name: '在“markdown-images”中新建会话', exact: true }).click()
    await page.getByRole('button', { name: /选择模型，当前/ }).first().waitFor({ timeout: 60_000 }).catch(async (error) => {
      console.log('Model selector diagnostics', (await page.locator('body').innerText()).slice(0, 4000))
      throw error
    })
    // The native sidebar header is deliberately hidden for an empty session.
    // This isolated profile has no credentials; one harmless submission reveals
    // conversation chrome without depending on a successful provider response.
    await page.getByRole('textbox', { name: /^描述你想要构建/ }).fill('Markdown preview regression')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    // Submitting a draft creates a persisted session asynchronously. Enter its
    // history row before opening the sidebar; the draft-to-session transition
    // otherwise disposes the guide while Playwright is trying to click it.
    await page.getByText('Markdown preview regression', { exact: true }).first().click()
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
      mkdirSync(join(desktopRoot, 'dist', 'verification-6.0.1'), { recursive: true })
      await page.screenshot({ path: join(desktopRoot, 'dist', 'verification-6.0.1', 'file-tree-diagnostic.png') })
      console.log('File tree diagnostics', await pane.innerText(), rendererOutput.filter(line => line.startsWith('[pageerror]')).slice(-3))
      throw error
    })
    const picture = pane.locator('img[alt="Figure 2: 四分位分析"]')
    await picture.waitFor()
    await picture.scrollIntoViewIfNeeded()
    await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
    expect(readFileSync(join(workspacePath, 'report.md'), 'utf8')).toBe(source)
    mkdirSync(join(desktopRoot, 'dist', 'verification-6.0.1'), { recursive: true })
    await page.screenshot({ path: join(desktopRoot, 'dist', 'verification-6.0.1', 'markdown-images.png') })
  })

  it('registers a workspace and restores its research workbench in the packaged application', async () => {
    const pane = page.locator('[data-sidebar-right-panel]')
    await pane.getByRole('button', { name: '新标签页', exact: true }).click()
    await pane.locator('[data-sidebar-right-guide-entry$="science-workbench"]').click()
    await pane.getByRole('heading', { name: '科研可视化与分析工作台', exact: true }).waitFor()
    await pane.getByRole('button', { name: '登记当前工作区', exact: true }).click()
    await pane.getByRole('button', { name: '登记当前工作区', exact: true }).waitFor({ state: 'hidden' })
    expect(await pane.getByLabel('选择研究', { exact: true }).locator('option').count()).toBe(1)
    await pane.getByLabel('研究标题', { exact: true }).fill('7.0.0 安装包工作台验收')
    await pane.getByRole('button', { name: '新建研究', exact: true }).click()
    await pane.getByText('7.0.0 安装包工作台验收', { exact: true }).waitFor()
    const navigation = pane.getByRole('navigation', { name: '工作台页面' })
    expect(await navigation.getByRole('button').count()).toBe(6)
    await navigation.getByRole('button', { name: '研究计划', exact: true }).click()
    await pane.getByRole('heading', { name: 'MR 与区域共定位', exact: true }).waitFor()
    expect(await pane.getByRole('button', { name: '冻结研究方案', exact: true }).isEnabled()).toBe(false)
    await navigation.getByRole('button', { name: '报告与评估', exact: true }).click()
    await pane.getByRole('button', { name: '生成 IMRAD 草稿', exact: true }).click()
    await pane.getByText('Gate 1 尚未批准', { exact: false }).waitFor()
    expect(await pane.getByRole('button', { name: '生成正式报告', exact: true }).isEnabled()).toBe(false)
    await page.reload()
    await page.getByText('Markdown preview regression', { exact: true }).first().waitFor()
    await page.getByText('Markdown preview regression', { exact: true }).first().click()
    const expand = page.locator('[data-sidebar-right-expand]').first()
    if (await expand.isVisible()) await expand.click()
    await pane.locator('[data-sidebar-right-guide-entry$="science-workbench"]').click()
    await pane.getByRole('heading', { name: '科研可视化与分析工作台', exact: true }).waitFor()

    await pane.getByText('7.0.0 安装包工作台验收', { exact: true }).waitFor()
    expect(await pane.getByRole('button', { name: '登记当前工作区', exact: true }).count()).toBe(0)
    const output = join(desktopRoot, 'dist', 'verification-7.0.0')
    mkdirSync(output, { recursive: true })
    await page.screenshot({ path: join(output, 'science-workbench-restored.png') })
    await navigation.getByRole('button', { name: '专业工具', exact: true }).click()
    await pane.getByRole('button', { name: '打开Motif 序列工作台', exact: true }).click()
    await pane.getByLabel('序列资产', { exact: true }).waitFor()
    await page.screenshot({ path: join(output, 'science-workbench-tools.png') })
    writeFileSync(join(root, 'markdown-images', 'reference.pdb'), moleculePdb)
    await navigation.getByRole('button', { name: '数据与资料', exact: true }).click()
    await pane.getByLabel('科研文件路径', { exact: true }).fill('reference.pdb')
    await pane.getByRole('button', { name: '登记文件资产', exact: true }).click()
    await pane.getByText('已登记 reference.pdb。', { exact: false }).waitFor()
    await navigation.getByRole('button', { name: '专业工具', exact: true }).click()
    await pane.getByRole('button', { name: '打开分子结构', exact: true }).click()
    const molecule = pane.getByRole('region', { name: '分子结构工作台', exact: true })
    const option = molecule.getByLabel('分子资产', { exact: true }).locator('option').filter({ hasText: 'reference.pdb' })
    await option.waitFor({ state: 'attached' })
    await molecule.getByLabel('分子资产', { exact: true }).selectOption((await option.getAttribute('value'))!)
    await molecule.getByRole('button', { name: '打开结构', exact: true }).click()
    await molecule.locator('[data-testid="molecule-canvas"][data-ready="true"]').waitFor({ timeout: 60000 })
    await molecule.getByLabel('测距原子 1', { exact: true }).selectOption('0')
    await molecule.getByLabel('测距原子 2', { exact: true }).selectOption('8')
    await molecule.getByRole('button', { name: '计算原子距离', exact: true }).click()
    await molecule.getByLabel('原子距离', { exact: true }).filter({ hasText: '5.0000' }).waitFor()
    await molecule.getByRole('button', { name: '导出图像与结构并登记', exact: true }).click()
    await molecule.getByRole('status').filter({ hasText: '已登记分子产物：' }).waitFor()
    await molecule.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(output, 'molecule-packaged.png') })

    await pane.getByRole('button', { name: '打开科研画布', exact: true }).click()
    const canvas = pane.getByRole('region', { name: '科研画布', exact: true })
    await canvas.getByRole('button', { name: '添加面板', exact: true }).click()
    await canvas.getByLabel('面板标题', { exact: true }).fill('Packaged panel B')
    await canvas.getByLabel('面板类型', { exact: true }).selectOption('image')
    await canvas.getByRole('button', { name: '刷新图像', exact: true }).click()
    const imageOption = canvas.getByLabel('项目图像', { exact: true }).locator('option').filter({ hasText: 'PNG' }).first()
    await imageOption.waitFor({ state: 'attached' })
    await canvas.getByLabel('项目图像', { exact: true }).selectOption((await imageOption.getAttribute('value'))!)
    await canvas.getByRole('button', { name: '预览 SVG', exact: true }).click()
    await canvas.getByLabel('科研画布预览').locator('svg').first().waitFor()
    await canvas.getByRole('button', { name: '导出 SVG/PNG/PDF', exact: true }).click()
    await canvas.getByRole('status').filter({ hasText: '已登记 4 个产物' }).waitFor()
    await canvas.getByLabel('科研画布预览').screenshot({ path: join(output, 'canvas-packaged.png') })

    writeFileSync(join(root, 'markdown-images', 'pcr-reference.fasta'), `>reference\n${pcrTemplate}\n`)
    await navigation.getByRole('button', { name: '数据与资料', exact: true }).click()
    await pane.getByLabel('科研文件路径', { exact: true }).fill('pcr-reference.fasta')
    await pane.getByRole('button', { name: '登记文件资产', exact: true }).click()
    await pane.getByText('已登记 pcr-reference.fasta。', { exact: false }).waitFor()
    await navigation.getByRole('button', { name: '专业工具', exact: true }).click()
    await pane.getByRole('button', { name: '打开Motif 序列工作台', exact: true }).click()
    const sequence = pane.getByRole('region', { name: '序列查看与分析', exact: true })
    await sequence.getByRole('button', { name: '刷新资产', exact: true }).click()
    const sequenceOption = sequence.getByLabel('序列资产', { exact: true }).locator('option').filter({ hasText: 'pcr-reference.fasta' })
    await sequenceOption.waitFor({ state: 'attached' })
    await sequence.getByLabel('序列资产', { exact: true }).selectOption((await sequenceOption.getAttribute('value'))!)
    await sequence.getByRole('button', { name: '打开序列', exact: true }).click()
    await sequence.getByLabel('选择终点', { exact: true }).fill(String(pcrTemplate.length))
    await sequence.getByRole('button', { name: '保存并查看', exact: true }).click()
    await sequence.getByLabel('序列分析操作', { exact: true }).selectOption('pcr')
    await sequence.getByLabel('PCR 正向引物', { exact: true }).fill(pcrForward)
    await sequence.getByLabel('PCR 反向引物', { exact: true }).fill(pcrReverse)
    await sequence.getByLabel('PCR 正向退火长度', { exact: true }).fill('20')
    await sequence.getByLabel('PCR 反向退火长度', { exact: true }).fill('20')
    await sequence.getByRole('button', { name: '导出并登记产物', exact: true }).click()
    await sequence.getByText(pcrExpected, { exact: true }).waitFor()
    await sequence.screenshot({ path: join(output, 'sequence-pcr-packaged.png') })
    if (process.env.ZEROWALL_E2E_SANGER_REFERENCE) {
      writeFileSync(join(root, 'markdown-images', 'reference.ab1'), readFileSync(process.env.ZEROWALL_E2E_SANGER_REFERENCE))
      await navigation.getByRole('button', { name: '数据与资料', exact: true }).click()
      await pane.getByLabel('科研文件路径', { exact: true }).fill('reference.ab1')
      await pane.getByRole('button', { name: '登记文件资产', exact: true }).click()
      await pane.getByText('已登记 reference.ab1。', { exact: false }).waitFor()
      await navigation.getByRole('button', { name: '专业工具', exact: true }).click()
      await pane.getByRole('button', { name: '打开Sanger 峰图', exact: true }).click()
      const sanger = pane.getByRole('region', { name: 'Sanger 峰图查看与分析', exact: true })
      const option = sanger.getByLabel('Sanger 资产', { exact: true }).locator('option').filter({ hasText: 'reference.ab1' })
      await option.waitFor({ state: 'attached' }); await sanger.getByLabel('Sanger 资产', { exact: true }).selectOption((await option.getAttribute('value'))!)
      await sanger.getByRole('button', { name: '打开峰图', exact: true }).click()
      await sanger.getByLabel('修订碱基位置', { exact: true }).fill('100')
      await sanger.getByLabel('修订碱基', { exact: true }).selectOption('R')
      await sanger.getByLabel('碱基修订依据').fill('Packaged software reference edit; no biological variant conclusion')
      await sanger.getByRole('button', { name: '登记碱基修订', exact: true }).click()
      await sanger.getByText('历史修订批次：1', { exact: true }).waitFor()
      await sanger.getByRole('button', { name: '导出并登记', exact: true }).click()
      await sanger.getByRole('status').filter({ hasText: '已登记产物' }).waitFor()
      await sanger.screenshot({ path: join(output, 'sanger-revision-packaged.png') })
    }

    if (process.env.ZEROWALL_E2E_FLOW_REFERENCE) {
      for (const name of ['sample-1.fcs', 'sample-2.fcs', 'gates.wsp']) {
        writeFileSync(join(root, 'markdown-images', name), readFileSync(join(process.env.ZEROWALL_E2E_FLOW_REFERENCE, name)))
        await navigation.getByRole('button', { name: '数据与资料', exact: true }).click()
        await pane.getByLabel('科研文件路径', { exact: true }).fill(name)
        await pane.getByRole('button', { name: '登记文件资产', exact: true }).click()
        await pane.getByText(`已登记 ${name}。`, { exact: false }).waitFor()
      }
      await navigation.getByRole('button', { name: '专业工具', exact: true }).click()
      await pane.getByRole('button', { name: '打开流式细胞', exact: true }).click()
      const flow = pane.getByRole('region', { name: '流式细胞查看与分析', exact: true })
      await flow.getByLabel('sample-1.fcs', { exact: true }).check()
      await flow.getByLabel('sample-2.fcs', { exact: true }).check()
      const wsp = flow.getByLabel('批处理 FlowJo WSP', { exact: true }).locator('option').filter({ hasText: 'gates.wsp' })
      await wsp.waitFor({ state: 'attached' }); await flow.getByLabel('批处理 FlowJo WSP', { exact: true }).selectOption((await wsp.getAttribute('value'))!)
      await flow.getByRole('button', { name: '运行批处理', exact: true }).click()
      await flow.getByText('批处理状态：succeeded', { exact: false }).waitFor()
      await flow.getByLabel('批处理结果', { exact: true }).waitFor()
      await flow.screenshot({ path: join(output, 'flowjo-batch-packaged.png') })
    }

    if (process.env.ZEROWALL_E2E_HE_REFERENCE) {
      writeFileSync(join(root, 'markdown-images', 'he-reference.tif'), readFileSync(process.env.ZEROWALL_E2E_HE_REFERENCE))
      await navigation.getByRole('button', { name: '数据与资料', exact: true }).click()
      await pane.getByLabel('科研文件路径', { exact: true }).fill('he-reference.tif')
      await pane.getByRole('button', { name: '登记文件资产', exact: true }).click()
      await pane.getByText('已登记 he-reference.tif。', { exact: false }).waitFor()
      await navigation.getByRole('button', { name: '专业工具', exact: true }).click()
      await pane.getByRole('button', { name: '打开HE 查看器', exact: true }).click()
      const he = pane.getByRole('region', { name: 'HE 组织切片查看与分析', exact: true })
      const heOption = he.getByLabel('HE 资产', { exact: true }).locator('option').filter({ hasText: 'he-reference.tif' })
      await heOption.waitFor({ state: 'attached' })
      await he.getByLabel('HE 资产', { exact: true }).selectOption((await heOption.getAttribute('value'))!)
      await he.getByRole('button', { name: '打开切片', exact: true }).click()
      await he.getByRole('img', { name: 'HE 瓦片与 ROI 选择', exact: true }).waitFor()
      await he.getByRole('button', { name: 'StarDist 核分割', exact: true }).click()
      await he.getByRole('img', { name: 'HE 核分割叠加', exact: true }).waitFor({ timeout: 120000 })
      await he.getByLabel('HE 分割任务', { exact: true }).filter({ hasText: 'succeeded' }).waitFor()
      await he.getByRole('img', { name: 'HE 核分割叠加', exact: true }).screenshot({ path: join(output, 'he-stardist-packaged.png') })
      writeFileSync(join(output, 'he-stardist-packaged-evidence.json'), JSON.stringify({ scope: 'Packaged Electron/Host plus explicitly configured external engine; public example, not medical validation', text: await he.innerText(), source: process.env.ZEROWALL_E2E_HE_REFERENCE }, null, 2))
    }

  }, 300_000)

  it('keeps shortcuts compact and opens WeChat configuration from its status', async () => {
    await page.getByRole('button', { name: '展开快捷入口', exact: true }).click()
    const wechat = page.getByRole('button', { name: /^微信 WebChat/ })
    await wechat.waitFor()
    await wechat.click()
    const settings = page.getByRole('dialog', { name: '设置' })
    await settings.getByText('未登录', { exact: true }).first().waitFor()
    await settings.getByRole('button', { name: '关闭', exact: true }).click()
    await page.getByRole('button', { name: '收起快捷入口', exact: true }).click()
    expect(await page.getByRole('link', { name: 'GitHub 项目' }).isVisible()).toBe(false)
    expect(await page.getByRole('button', { name: '设置', exact: true }).isVisible()).toBe(true)
    expect(await page.getByRole('button', { name: 'AI 审查', exact: true }).count()).toBe(0)
    await page.getByRole('button', { name: '收起侧边栏', exact: true }).click()
    await page.getByRole('button', { name: '打开侧边栏', exact: true }).waitFor()
    expect(await page.getByRole('button', { name: /^微信 WebChat/ }).isVisible()).toBe(false)
    await page.getByRole('button', { name: '打开侧边栏', exact: true }).click()
    mkdirSync(join(desktopRoot, 'dist', 'verification-6.0.0'), { recursive: true })
    await page.screenshot({ path: join(desktopRoot, 'dist', 'verification-6.0.0', 'sidebar-compact.png') })
  })

  it('does not mount the removed capability management module', async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '设置' })
    expect(await settings.getByRole('button', { name: '能力管理', exact: true }).count()).toBe(0)
    await settings.getByRole('button', { name: '插件' }).click()
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
    expect(bootEntries).toContain('@huanlin/dsh-plugin-better-sidebar-plugin-office')
    expect(bootEntries).toContain('dsh-zotero')
    expect(bootEntries).not.toContain('@fylar/dsh-fylar-office-editor')
  })

  it('bridges chat copies through the trusted desktop API', async () => {
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

  it('copies an attachment as a persistent Windows file drop with exact bytes', async () => {
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
    await settings.getByRole('button', { name: /中文/ }).click()
    await page.getByRole('menuitem', { name: 'English' }).click()
    await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'visible' })
    await page.getByText('Language', { exact: true }).waitFor({ state: 'visible' })

    const englishSettings = page.getByRole('dialog', { name: 'Settings' })
    await englishSettings.getByRole('button', { name: 'Environment', exact: true }).click()
    await englishSettings.getByRole('heading', { name: 'Environment', exact: true }).waitFor()
    await englishSettings.getByRole('heading', { name: 'AIchem', exact: true }).waitFor()
    expect(await englishSettings.getByLabel('AIchem API token', { exact: true }).getAttribute('type')).toBe('password')
    await englishSettings.getByRole('region', { name: 'Literature services', exact: true }).getByRole('button', { name: 'Save settings', exact: true }).waitFor()
    await englishSettings.getByText('Review model mode', { exact: true }).waitFor()
    expect(await englishSettings.getByText('模型目录已同步', { exact: true }).count()).toBe(0)
    const artifacts = join(desktopRoot, 'dist', 'verification-6.0.0')
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
    await settings.getByRole('button', { name: '插件' }).click()
    expect(await settings.getByRole('tab', { name: '插件配置' }).count()).toBe(1)
    await settings.getByRole('tab', { name: '插件配置' }).click()
    const freeSearchCard = settings.locator('.dshfs-card')
    await freeSearchCard.waitFor({ state: 'visible' })
    const freeSearchHeader = freeSearchCard.locator('.dshfs-header')
    await freeSearchHeader.click()
    await page.waitForTimeout(500)
    if (await freeSearchCard.count() === 0) {
      throw new Error([
        'Free Search card disappeared while expanding.',
        `Settings text:\n${(await settings.innerText()).slice(0, 12_000)}`,
        `Renderer diagnostics:\n${rendererOutput.slice(-100).join('\n')}`,
      ].join('\n\n'))
    }
    await expect.poll(() => freeSearchHeader.getAttribute('aria-expanded')).toBe('true')
    const freeSearchBody = freeSearchCard.locator('.dshfs-body')
    await freeSearchBody.waitFor({ state: 'visible' })
    await expect.poll(() => freeSearchBody.locator('.dshfs-label').first().innerText()).toMatch(/搜索引擎|Search engine/u)
    const engineSelect = freeSearchBody.locator('select').first()
    await engineSelect.waitFor({ state: 'visible' })
    expect((await engineSelect.locator('option').allTextContents()).some(label => label.includes('Bing'))).toBe(true)
    await settings.getByText('文件审查', { exact: true }).waitFor({ state: 'visible' })
    expect(await settings.getByRole('link', { name: /GitHub.*Star|Star.*GitHub/i }).count()).toBe(0)
    expect(await settings.getByText('去 GitHub 点 Star', { exact: true }).count()).toBe(0)
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
    await page.screenshot({ path: join(desktopRoot, 'dist', 'verification-6.0.0', 'mcp-saved.png') })
    await settings.getByRole('tab', { name: '插件列表' }).click()
    const globalPlugins = settings.getByRole('button', { name: /^(全局插件|Global plugins)/ })
    if (await globalPlugins.getAttribute('aria-expanded') === 'false') await globalPlugins.click()
    const optionalPlugin = settings.locator('[data-plugin-control="user-toggleable"]').first()
    await optionalPlugin.waitFor({ state: 'visible' })
    await optionalPlugin.getByRole('button').first().click()
    await optionalPlugin.locator('[data-loader-entry]').waitFor({ state: 'visible' })
    await optionalPlugin.getByRole('button', { name: /启用插件|停用插件/ }).waitFor({ state: 'visible' })
    await settings.getByRole('button', { name: '关闭' }).click()
    await expect.poll(() => page.getByRole('dialog', { name: '设置' }).count()).toBe(0)
  })

  it('shows environment configuration as a list with AIchem credentials and live model catalog', async () => {
    await page.getByRole('button', { name: '设置' }).click()
    const settings = page.getByRole('dialog', { name: '设置' })
    await settings.getByRole('button', { name: '环境配置', exact: true }).click()
    await settings.getByRole('heading', { name: '化工社 AIchem' }).waitFor()
    await expect.poll(() => settings.getByText('模型目录已同步', { exact: true }).count()).toBe(1)
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
    const artifacts = join(desktopRoot, 'dist', `verification-${version}`)
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
    const artifacts = join(desktopRoot, 'dist', `verification-${version}`)
    mkdirSync(artifacts, { recursive: true })
    expect(await page.evaluate(() => document.documentElement.dataset.zerowallBoot)).toBe('ready')
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '设置' })
    expect(await settings.getByRole('button', { name: '打开配置文件' }).count()).toBe(0)
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
    await viewer.getByText('已复制', { exact: true }).waitFor()
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
    const artifacts = join(desktopRoot, 'dist', `verification-${version}`)
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
// lasts for one onboarding traversal, so each reload must finish the new one.
async function reloadWithoutCredentials(page: Page): Promise<void> {
  await page.reload()
  const credential = page.getByRole('dialog', { name: '添加一个 API Key 开始使用' })
  await credential.waitFor({ state: 'visible', timeout: 30_000 })
  await credential.getByRole('button', { name: '稍后配置' }).click()
  await credential.waitFor({ state: 'hidden', timeout: 30_000 })
}
async function completeFirstRunOnboarding(page: Page): Promise<void> {
  const notice = page.getByRole('dialog', { name: '内测声明' })
  await notice.waitFor({ state: 'visible', timeout: 30_000 })
  await notice.getByRole('button', { name: '继续' }).click()
  await notice.waitFor({ state: 'hidden', timeout: 30_000 })

  const credential = page.getByRole('dialog', { name: '添加一个 API Key 开始使用' })
  try {
    await credential.waitFor({ state: 'visible', timeout: 30_000 })
  } catch {
    return
  }
  await credential.getByRole('button', { name: '稍后配置' }).click()
  await credential.waitFor({ state: 'hidden', timeout: 30_000 })
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
