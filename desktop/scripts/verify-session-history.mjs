import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { tsImport } from 'tsx/esm/api'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron } from 'playwright'
import { locatePackagedApp } from './packaged-app.mjs'

const desktop = resolve(import.meta.dirname, '..')
const packaged = await locatePackagedApp(desktop)
const output = join(desktop, 'dist/verification-6.3.0')
const root = await mkdtemp(join(tmpdir(), 'zerowall-history-'))
const userData = join(root, 'userdata')
const workspacePath = join(root, '科研文献回归')
for (const path of [output, workspacePath, join(root, 'appdata'), join(root, 'localappdata'), join(userData, 'harness')]) await mkdir(path, { recursive: true })
const evidence = { root, errors: [], checks: [], screenshots: [], geometry: [] }
const fixtures = []
const { sessionDir, eventLines } = await tsImport('../../deepseek-harness/packages/session/session-persistence-jsonl/src/format.ts', import.meta.url)
for (const title of ['文献全流程历史回归', '智能医疗归档回归']) {
  const id = 'session-' + randomUUID()
  const now = Date.now()
  const header = { type: 'session', version: 3, id, createdAt: now, cwd: workspacePath, isSeeded: false, delegationDepth: 0, agentPreset: 'standard' }
  const events = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'step/start', data: { turn: 1, step: 1 } },
    { type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: title + '：验证重启后完整保留。' }], source: { kind: 'user' }, id: randomUUID() }, surfaceOp: 'append' },
    { type: 'step/end', data: { turn: 1, step: 1 } },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    { type: 'session/title', data: { title, messageSeqs: [], source: { kind: 'user' } } },
  ].map((event, seq) => ({ ...event, seq, time: now + seq }))
  const directory = sessionDir(join(userData, 'harness/sessions'), workspacePath, id)
  await mkdir(directory, { recursive: true })
  const path = join(directory, 'session.v3.jsonl')
  await writeFile(path, JSON.stringify(header) + '\n' + eventLines(events) + '\n')
  fixtures.push({ id, title, path, original: await readFile(path, 'utf8') })
}
let application, page
async function launch() {
  application = await _electron.launch({ executablePath: packaged.executablePath, cwd: packaged.root,
    args: [`--user-data-dir=${join(root, 'chromium')}`],
    env: { ...process.env, APPDATA: join(root, 'appdata'), LOCALAPPDATA: join(root, 'localappdata'), ZEROWALL_USER_DATA_DIR: userData }, timeout: 120_000 })
  page = await application.firstWindow()
  page.on('pageerror', error => evidence.errors.push(error.message))
  await page.waitForURL(url => url.protocol === 'http:', { timeout: 180_000 })
  await page.locator('[data-sidebar-root]').waitFor({ timeout: 60_000 })
  const notice = page.getByRole('dialog', { name: '内测声明' })
  if (await notice.waitFor({ timeout: 5000 }).then(() => true, () => false)) await notice.getByRole('button', { name: '继续' }).click()
  const credential = page.getByRole('dialog', { name: '添加一个 API Key 开始使用' })
  if (await credential.waitFor({ timeout: 5000 }).then(() => true, () => false)) await credential.getByRole('button', { name: '稍后配置' }).click()
  const login = page.getByRole('dialog', { name: '登录或注册' })
  if (await login.isVisible()) await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '归档会话', exact: true }).waitFor()
}
async function stop() {
  if (!application) return
  const process = application.process()
  await application.evaluate(({ app }) => app.quit()).catch(() => {})
  if (process.exitCode === null) await Promise.race([
    new Promise(resolve => process.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 5000)),
  ])
  if (process.exitCode === null) await new Promise(resolve => {
    spawn('taskkill', ['/PID', String(process.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).once('exit', resolve)
  })
  application = undefined
}
async function shot(name) {
  const path = join(output, name + '.png')
  await page.screenshot({ path }); evidence.screenshots.push(path)
}
async function geometry() {
  const result = await page.evaluate(() => {
    const sidebar = document.querySelector('[data-sidebar-root]')
    const settings = sidebar.querySelector('[data-slot="sidebar.settings"] button')
    const region = sidebar.querySelector('[data-slot="sidebar.workspaces"]').parentElement
    return { height: innerHeight, rail: sidebar.dataset.sidebarRail === 'true', sidebar: sidebar.getBoundingClientRect().toJSON(), settings: settings.getBoundingClientRect().toJSON(), region: region.getBoundingClientRect().toJSON() }
  })
  assert(result.sidebar.height > result.height - 20, JSON.stringify(result))
  assert(result.region.height > 200, JSON.stringify(result))
  assert(result.settings.y > result.height - 120 && result.settings.bottom <= result.height, JSON.stringify(result))
  evidence.geometry.push(result)
}
async function expandWorkspace() {
  const row = page.getByRole('treeitem').filter({ hasText: '科研文献回归' }).first()
  await row.waitFor()
  if (await row.getAttribute('aria-expanded') !== 'true') await row.click()
}
async function archive(fixture) {
  const row = page.getByRole('treeitem').filter({ hasText: fixture.title }).first()
  await row.hover()
  await row.getByRole('button', { name: `会话“${fixture.title}”的操作`, exact: true }).click()
  await page.getByRole('menuitem', { name: '归档会话', exact: true }).click()
  await row.waitFor({ state: 'hidden' })
}
try {
  await launch()
  await geometry()
  await expandWorkspace()
  // Cold imported logs acquire their title projection when first opened.
  for (let index = 0; index < fixtures.length; index++) {
    await page.getByRole('treeitem').filter({ hasText: '科研文献回归' }).last().click()
    await page.waitForFunction(count => [...document.querySelectorAll('[role="treeitem"]')].filter(row => /文献全流程历史回归|智能医疗归档回归/.test(row.textContent)).length === count, index + 1)
  }
  for (const fixture of fixtures) await page.getByRole('treeitem').filter({ hasText: fixture.title }).waitFor()
  await shot('history-visible')
  await page.reload()
  await page.getByRole('treeitem').filter({ hasText: fixtures[0].title }).waitFor()
  evidence.checks.push('History remains visible after renderer reload')
  await stop(); await launch(); await expandWorkspace()
  for (const fixture of fixtures) await page.getByRole('treeitem').filter({ hasText: fixture.title }).waitFor()
  evidence.checks.push('History remains visible after full application and Host restart')
  await archive(fixtures[1])
  await stop(); await launch(); await expandWorkspace()
  assert.equal(await page.getByRole('treeitem').filter({ hasText: fixtures[1].title }).count(), 0)
  await page.getByRole('button', { name: '归档会话', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: '归档会话', exact: true })
  const archived = dialog.getByRole('button', { name: new RegExp(fixtures[1].title) })
  await archived.waitFor()
  await dialog.getByRole('textbox').fill('not-a-match')
  await dialog.getByText('无匹配结果', { exact: true }).waitFor()
  await dialog.getByRole('textbox').fill('智能医疗')
  await archived.waitFor()
  await shot('archive-search')
  await archived.click()
  await page.getByText(fixtures[1].title + '：验证重启后完整保留。', { exact: true }).first().waitFor()
  evidence.checks.push('Archived session survives restart, title search finds it, and opening displays original content')
  await page.getByRole('button', { name: '归档会话', exact: true }).click()
  dialog = page.getByRole('dialog', { name: '归档会话', exact: true })
  await dialog.getByRole('button', { name: '恢复会话', exact: true }).click()
  await dialog.getByText('暂无归档会话', { exact: true }).waitFor()
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expandWorkspace()
  await page.getByRole('treeitem').filter({ hasText: fixtures[1].title }).waitFor()
  await shot('archive-restored')
  await stop(); await launch(); await expandWorkspace()
  await page.getByRole('treeitem').filter({ hasText: fixtures[1].title }).waitFor()
  evidence.checks.push('Restored session returns to its original workspace and survives restart')
  for (const viewport of [{ width: 1280, height: 900 }, { width: 960, height: 640 }]) {
    await page.setViewportSize(viewport)
    await geometry()
  }
  // A narrow viewport can already collapse the sidebar responsively.
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.waitForFunction(() => window.innerWidth === 1280)
  const collapseButton = page.getByRole('button', { name: '收起侧边栏', exact: true })
  if (await collapseButton.isVisible()) await collapseButton.click()
  await page.locator('[data-sidebar-rail=true]').waitFor()
  await geometry()
  await page.getByRole('button', { name: '归档会话', exact: true }).click()
  await page.getByRole('dialog', { name: '归档会话', exact: true }).getByText('暂无归档会话').waitFor()
  await page.keyboard.press('Escape')
  await shot('history-collapsed')
  evidence.checks.push('Settings stays at the bottom at two window sizes and archived sessions are reachable with the sidebar collapsed')
  for (const fixture of fixtures) {
    const current = await readFile(fixture.path, 'utf8')
    assert(current.startsWith(fixture.original), 'Original session header or conversation events were modified')
    // Host resume and the initial permission setup append metadata to imported logs.
    // Reject any other addition, including duplicate messages or altered titles.
    const added = current.slice(fixture.original.length).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    for (const event of added) assert(['session/end-seed', 'permission/preset', 'sandbox/mode', 'approval/policy'].includes(event.type), `Unexpected appended event: ${event.type}`)
  }
  evidence.checks.push('Original session headers and conversation events are byte-for-byte preserved; only Host resume and permission metadata may be appended')
  assert.deepEqual(evidence.errors, [])
  evidence.passed = true
} catch (error) {
  evidence.failure = error.stack
  evidence.dom = await page.locator('body').ariaSnapshot().catch(() => '')
  await shot('history-failure').catch(() => {})
  throw error
} finally {
  await writeFile(join(output, 'session-history.json'), JSON.stringify(evidence, null, 2))
  await stop()
  console.log(JSON.stringify(evidence, null, 2))
}
