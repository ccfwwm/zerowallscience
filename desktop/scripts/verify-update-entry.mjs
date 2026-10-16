import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { createConnection } from 'node:net'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { contract, root } from '../../tools/build/paths.mjs'
import { locatePackagedApp } from './packaged-app.mjs'

// Run the current compiled Base client in the real packaged Electron shell.
// The HTTP override leaves the signed package and existing installers intact;
// update events are fixtures delivered through the production preload IPC.
const { _electron } = createRequire(join(root, 'desktop/package.json'))('playwright')
const packaged = await locatePackagedApp(join(root, 'desktop'))
const output = join(contract.verification, 'update-entry', randomUUID())
await mkdir(output, { recursive: true })
const bundlePath = await realpath(join(root, 'plugins/base/lib/client.js'))
const bundle = await readFile(bundlePath, 'utf8')
const evidence = {
  complete: false, desktopVersion: contract.version,
  mode: 'packaged Electron with current compiled Base client HTTP override and fixture IPC statuses',
  bundle: { path: bundlePath, size: Buffer.byteLength(bundle), sha256: createHash('sha256').update(bundle).digest('hex') },
  buildId: contract.buildId,
  checks: [], screenshots: [], pageErrors: [], routeErrors: [], routes: [],
}
const env = { ...process.env, ZEROWALL_USER_DATA_DIR: join(output, 'user-data'), ZEROWALL_DISABLE_DEFAULT_MCP: '1', APPDATA: join(output, 'appdata'), LOCALAPPDATA: join(output, 'localappdata') }
delete env.ELECTRON_RUN_AS_NODE
for (const name of ['appdata', 'localappdata', 'user-data']) await mkdir(join(output, name))
const application = await _electron.launch({ executablePath: packaged.executablePath, env, args: [`--user-data-dir=${join(output, 'chromium')}`], timeout: 120_000 })
let page, servedBase = 0
try {
  await application.context().route('**/plugins/**', async route => {
    try {
      const url = route.request().url()
      const entry = '@zerowallscience/plugin-base/client.js'
      if (!url.includes(entry)) { await route.continue(); return }
      const record = { combo: url.includes('??'), stage: 'fetching' }
      evidence.routes.push(record)
      if (!url.includes('??')) {
        await route.fulfill({ status: 200, contentType: 'application/javascript', body: bundle })
      } else {
        // The Host's revision URL describes the complete combo. Fetch it intact
        // and suppress only its old Base registration while preserving all other
        // modules, then register the current Base client through the same loader.
        const response = await route.fetch()
        record.status = response.status()
        assert.equal(response.status(), 200, 'Original packaged client combo is available')
        const original = await response.text()
        record.size = Buffer.byteLength(original)
        assert(original.includes('@zerowallscience/plugin-base'), 'Combo contains Base')
        const body = `(function () {
const loader = window.__ModuleLoader__, load = loader.load;
loader.load = function (registration) {
  if (registration.id !== '@zerowallscience/plugin-base') return load.call(this, registration);
};
try {\n${original}\n} finally { loader.load = load; }
})();\n${bundle}`
        await route.fulfill({ status: 200, contentType: 'application/javascript', body })
      }
      record.stage = 'served'
      servedBase++
    } catch (error) {
      evidence.routeErrors.push(error.message)
      await route.abort().catch(() => {})
    }
  })
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    page = application.context().pages().find(candidate => candidate.url().startsWith('http://127.0.0.1:'))
    if (page) break
    await new Promise(accept => setTimeout(accept, 250))
  }
  assert(page, 'Packaged Host navigation')
  page.on('pageerror', error => evidence.pageErrors.push(error.message))
  // Let Electron finish its initial navigation before a fallback reload so
  // the test does not abort the main process's startup loadURL promise.
  await page.locator('button[data-update]').waitFor({ timeout: 120_000 })
  if (servedBase === 0) await page.reload({ waitUntil: 'commit' })
  await page.locator('button[data-update]').waitFor({ timeout: 120_000 })
  for (const [name, button] of [['内测声明', '继续'], ['添加一个 API Key 开始使用', '稍后配置']]) {
    const dialog = page.getByRole('dialog', { name })
    if (await dialog.waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false)) await dialog.getByRole('button', { name: button }).click()
  }
  await page.keyboard.press('Escape')
  assert(servedBase > 0, 'The current compiled Base client was served')
  evidence.servedBase = servedBase
  const expand = page.getByRole('button', { name: '展开快捷入口', exact: true })
  if (await expand.isVisible()) await expand.click()
  async function send(channel, status) {
    await application.evaluate(({ BrowserWindow }, { channel, status }) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, status)
    }, { channel, status })
  }
  async function resources(updateCount) {
    await send('desktop:resource-update-status', { phase: updateCount ? 'available' : 'upToDate', updateCount, kinds: { plugin: Math.max(updateCount - 1, 0), skill: Math.min(updateCount, 1) } })
  }
  async function screenshot(name) {
    const path = join(output, name + '.png')
    await page.screenshot({ path })
    evidence.screenshots.push(path)
  }
  await send('desktop:update-status', { phase: 'upToDate', currentVersion: contract.version })
  await resources(4)
  const trigger = page.getByRole('button', { name: '4 个插件或 Skills 可更新', exact: true })
  await trigger.waitFor()
  assert.equal(await page.getByRole('dialog', { name: '发现资源更新' }).count(), 0)
  assert.equal(await page.getByRole('status').filter({ hasText: /可更新|新版本/u }).count(), 0)
  const rectangle = await trigger.boundingBox()
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  assert(rectangle && rectangle.x < viewport.width / 3 && rectangle.y > viewport.height / 2, 'Update indicator stays at the bottom left')
  const profilePath = join(output, 'user-data/harness/profiles/web/package.json')
  const profileBefore = await readFile(profilePath, 'utf8')
  await screenshot('sidebar-resource-updates')
  await trigger.click()
  const section = page.getByRole('dialog', { name: '设置', exact: true }).locator('section[aria-labelledby="zerowall-extension-center-title"]')
  await section.waitFor({ timeout: 30_000 })
  await screenshot('extension-center-from-sidebar')
  assert.equal(await readFile(profilePath, 'utf8'), profileBefore, 'Viewing updates does not change the installed profile')
  assert.equal((await page.evaluate(() => window.zerowallDesktop.resources.listJobs())).length, 0, 'Viewing updates creates no installation tasks')
  evidence.checks.push('4 extension updates appear only in the sidebar; click opens the real Extension Center; profile and installation tasks stay untouched')
  await page.keyboard.press('Escape')
  await resources(0)
  await page.getByRole('button', { name: '检查应用更新', exact: true }).waitFor()
  assert.equal(await page.locator('button[data-update] i').count(), 0)
  await resources(4)
  await trigger.waitFor()
  await page.getByRole('button', { name: '收起侧边栏', exact: true }).click()
  await trigger.waitFor()
  await page.waitForFunction(() => document.querySelector('button[data-update] span') === null)
  assert.equal(await trigger.getAttribute('title'), '4 个插件或 Skills 可更新')
  await screenshot('collapsed-sidebar-resource-updates')
  evidence.checks.push('clearing resources removes the badge; collapsed sidebar retains the icon and count tooltip')
  await page.setViewportSize({ width: 800, height: 480 })
  await send('desktop:update-status', { phase: 'available', currentVersion: contract.version, version: '99.0.0', notes: Array.from({ length: 45 }, (_, i) => `第 ${i + 1} 项更新：插件安装、Python 依赖与工作流改进。`) })
  const desktopDialog = page.getByRole('dialog', { name: '发现新版本', exact: true })
  await desktopDialog.waitFor()
  await desktopDialog.getByRole('button', { name: '下载更新', exact: true }).waitFor()
  await desktopDialog.getByRole('button', { name: '打开扩展中心', exact: true }).waitFor()
  const geometry = await desktopDialog.evaluate(dialog => {
    const content = dialog.querySelector('[tabindex="0"]'), footer = dialog.querySelector('footer')
    return { contentHeight: content.clientHeight, scrollHeight: content.scrollHeight, footerBottom: footer.getBoundingClientRect().bottom, dialogTop: dialog.getBoundingClientRect().top, viewportHeight: innerHeight }
  })
  assert(geometry.scrollHeight > geometry.contentHeight, 'Long update notes have an internal scrollbar')
  assert(geometry.dialogTop >= 0 && geometry.footerBottom <= geometry.viewportHeight, 'Footer buttons remain inside the short viewport')
  await desktopDialog.locator('[tabindex="0"]').evaluate(element => { element.scrollTop = element.scrollHeight })
  assert(await desktopDialog.locator('[tabindex="0"]').evaluate(element => element.scrollTop > 0), 'Update content actually scrolls')
  evidence.scrollGeometry = geometry
  evidence.checks.push('45 release notes scroll at 800x480 while footer actions remain visible')
  assert.equal(await page.getByRole('status').filter({ hasText: /可更新|新版本/u }).count(), 0)
  await screenshot('desktop-and-resource-updates')
  await page.keyboard.press('Escape')
  await resources(5)
  assert.equal(await desktopDialog.count(), 0, 'Resource refresh does not reopen the desktop dialog')
  evidence.checks.push('desktop update still opens its confirmation dialog, with an Extension Center action when both kinds are available')
  assert.deepEqual(evidence.pageErrors, [])
  assert.deepEqual(evidence.routeErrors, [])
  if (process.argv.includes('--plugin-install-smoke')) {
    const endpoint = JSON.parse(await readFile(join(output, 'user-data/command-endpoint.json'), 'utf8'))
    async function command(operation, args) {
      return new Promise((accept, reject) => {
        const socket = createConnection(endpoint.address)
        let response = ''
        socket.setTimeout(600_000, () => { socket.destroy(); reject(new Error('Plugin smoke operation timed out')) })
        socket.on('error', reject)
        socket.on('connect', () => socket.write(JSON.stringify({ token: endpoint.token, operation, args }) + '\n'))
        socket.on('data', chunk => { response += chunk })
        socket.on('end', () => {
          try { const value = JSON.parse(response); if (!value.ok) throw new Error(value.error); accept(value.result) }
          catch (error) { reject(error) }
        })
      })
    }
    const installed = await command('plugin.run', ['add', 'dsh-orb@0.1.7'])
    assert.equal(installed.restarted, true)
    const pluginPath = join(output, 'user-data/harness/profiles/web/node_modules/dsh-orb/package.json')
    assert.equal(JSON.parse(await readFile(pluginPath, 'utf8')).version, '0.1.7')
    const doctor = await command('profile.doctor', [])
    assert(doctor.plugins.some(item => item.id === 'dsh-orb' && item.version === '0.1.7'))
    const removed = await command('plugin.run', ['remove', 'dsh-orb'])
    assert.equal(removed.restarted, true)
    assert(!JSON.parse(await readFile(profilePath, 'utf8')).dsh.profile.bundles.includes('dsh-orb'))
    const after = await command('profile.doctor', [])
    assert(!after.plugins.some(item => item.id === 'dsh-orb'))
    evidence.checks.push('Official dsh-orb 0.1.7 installed, loaded through profile activation, then removed through the real desktop command endpoint; both Host restarts passed')
    evidence.pluginSmoke = { id: 'dsh-orb', version: '0.1.7', installed: true, removed: true }
  }
  evidence.complete = true
  console.log('Update entry Electron verification passed:', output)
} catch (error) {
  evidence.error = error.message
  if (page) await screenshotFailure().catch(() => {})
  throw error
} finally {
  await writeFile(join(output, 'receipt.json'), JSON.stringify(evidence, null, 2) + '\n')
  await application.close()
}
async function screenshotFailure() { await page.screenshot({ path: join(output, 'failure.png') }) }
