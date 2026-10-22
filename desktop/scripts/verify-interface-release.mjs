import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { contract, root } from '../../tools/build/paths.mjs'
import { locatePackagedApp } from './packaged-app.mjs'
import * as yaml from 'yaml'
import { extractFile } from '@electron/asar'
import { ResearchStore } from '../../plugins/research-store/lib/index.js'

// Use the actual packaged plugins; only account responses and update statuses
// are fixtures. No client bundle is replaced by a development build.
const { _electron } = createRequire(join(root, 'desktop/package.json'))('playwright')
const prepare = process.argv.includes('--prepare-upgrade')
const directory = join(contract.verification, 'interface-upgrade')
const userdata = join(directory, 'user-data')
await mkdir(directory, { recursive: true })
for (const name of ['appdata', 'localappdata']) await mkdir(join(directory, name), { recursive: true })
const packaged = prepare
  ? { executablePath: join(root, 'artifacts/packages/8.4.6/windows-x64/win-unpacked/ZeroWallScience.exe') }
  : await locatePackagedApp(join(root, 'desktop'))
const env = { ...process.env, ZEROWALL_USER_DATA_DIR: userdata, ZEROWALL_DISABLE_DEFAULT_MCP: '1', APPDATA: join(directory, 'appdata'), LOCALAPPDATA: join(directory, 'localappdata') }
delete env.ELECTRON_RUN_AS_NODE
const application = await _electron.launch({ executablePath: packaged.executablePath, env, args: [`--user-data-dir=${join(directory, 'chromium')}`], timeout: 120_000 })
let accountFixture = { status: 'signedIn', balanceFreshness: 'current', lowBalance: false, email: 'upgrade@example.test', gatewayBaseUrl: 'https://hkcode.aicodeme.xyz', models: ['original-model-id', 'second-model-id'].map(modelId => ({ providerId: 'fixture', groupId: 'fixture', groupName: 'Fixture', modelId, baseUrl: 'https://hkcode.aicodeme.xyz' })) }
let accountUnavailable = false
let accountGate
if (!prepare) {
  await application.context().route('**/api/zerowallAccount/current', async route => {
    const request = route.request().postDataJSON()
    if (accountGate) await accountGate
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'server-response', rpcId: request.rpcId, result: accountUnavailable ? { ok: false, error: { message: 'fixture unavailable' } } : { ok: true, value: accountFixture } }) })
  })
}
const evidence = { complete: false, version: prepare ? '8.4.6' : contract.version, mode: 'actual packaged clients, isolated user directory', checks: [], screenshots: [] }
let page
let upgradeVault
try {
  for (let attempt = 0; attempt < 1440; attempt++) {
    page = application.context().pages().find(candidate => candidate.url().startsWith('http://127.0.0.1:'))
    if (page) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert(page, 'Packaged Host navigated')
  await page.locator('button[data-update]').waitFor({ timeout: 120_000 })
  for (const [name, button] of [['内测声明', '继续'], ['添加一个 API Key 开始使用', '稍后配置']]) {
    const dialog = page.getByRole('dialog', { name })
    if (await dialog.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false)) await dialog.getByRole('button', { name: button }).click()
  }
  await page.keyboard.press('Escape')
  if (prepare) {
    upgradeVault = await application.evaluate(({ safeStorage }) => ({ version: 1, entries: Object.fromEntries([
      ['zerowall.ai-cloud.login', JSON.stringify({ baseUrl: 'https://hkcode.aicodeme.xyz', email: 'upgrade@example.test', password: 'synthetic-upgrade-fixture' })],
      ['zerowall.ai-cloud.manual-signout', '1'],
    ].map(([key, value]) => [key, safeStorage.encryptString(value).toString('base64')])) }))
    await writeFile(join(userdata, 'upgrade-preservation.txt'), '8.4.6 researcher data')
    evidence.checks.push('8.4.6 created a real isolated profile and reached the desktop')
    evidence.profileFiles = await readdir(join(userdata, 'harness/profiles/web'))
    evidence.complete = true
  } else {
    const snapshot = JSON.parse(await readFile(join(contract.stage, 'plugin-snapshot.json'), 'utf8'))
    assert.equal(snapshot.plugins.find(item => item.id === '@zerowallscience/plugin-videos')?.version, '0.2.7')
    assert.equal(JSON.parse(await readFile(join(contract.stage, 'offline-profile/modules/@zerowallscience/plugin-videos/package.json'))).version, '0.2.7')
    evidence.checks.push('Installer snapshot and signed offline plugin supply include videos 0.2.7')
    await application.evaluate(({ BrowserWindow, ipcMain }) => {
      const desktop = { phase: 'upToDate', currentVersion: '8.4.7' }
      const resources = { phase: 'upToDate', updateCount: 0, kinds: {} }
      ipcMain.removeHandler('desktop:get-update-status'); ipcMain.handle('desktop:get-update-status', () => desktop)
      ipcMain.removeHandler('desktop:resource-update-status'); ipcMain.handle('desktop:resource-update-status', () => resources)
      for (const window of BrowserWindow.getAllWindows()) { window.webContents.send('desktop:update-status', desktop); window.webContents.send('desktop:resource-update-status', resources) }
    })
    assert.equal(await readFile(join(userdata, 'upgrade-preservation.txt'), 'utf8'), '8.4.6 researcher data')
    const expected = JSON.parse(await readFile(join(directory, 'preservation.json'), 'utf8'))
    for (const [file, digest] of Object.entries(expected.files)) assert.equal(createHash('sha256').update(await readFile(join(userdata, file))).digest('hex'), digest, `Preserved ${file}`)
    const config = yaml.parse(await readFile(join(userdata, 'harness/profiles/web/cordis.patch.yml'), 'utf8'))
    assert.deepEqual(config.find(entry => entry.id === 'zerowall-environment').config.imageModel, expected.imageModel)
    assert.equal(config.find(entry => entry.id === 'zerowall-environment').config.imageQuality, 'max')
    const store = new ResearchStore(join(userdata, 'research/zerowall-research.sqlite'))
    try { assert.equal(store.getProject(expected.project.id).name, expected.project.name) } finally { store.close() }
    const manifest = JSON.parse(await readFile(join(userdata, 'harness/profiles/web/package.json')))
    assert(manifest.dependencies['zws-upgrade-third-party'])
    assert(manifest.zerowall.disabledPlugins.includes('@zerowallscience/plugin-videos'))
    evidence.checks.push('8.4.6 account vault, model settings, research project, third-party plugin, custom Skill/MCP, pinned and disabled selections preserved')
    const profile = join(userdata, 'harness/profiles/web/node_modules/@zerowallscience')
    for (const [id, version] of [['plugin-base', '0.1.24'], ['plugin-account', '0.1.16'], ['plugin-extension-center', '0.1.16']]) {
      let source = 'upgraded installed profile'
      const installedFile = async file => readFile(join(profile, id, file)).catch(error => {
        if (error.code !== 'ENOENT') throw error
        source = 'installed app.asar core plugin'
        return extractFile(join(packaged.resourcesRoot, 'app.asar'), join('node_modules/@zerowallscience', id, file))
      })
      assert.equal(JSON.parse(await installedFile('package.json')).version, version)
      const client = (await installedFile('lib/client.js')).toString('utf8')
      evidence.checks.push(`${id}@${version} loaded from ${source}; sha256=${createHash('sha256').update(client).digest('hex')}`)
      if (id === 'plugin-base') for (const key of ['account.connection.online', 'account.modelCount', 'account.manage', 'account.openPlatform', 'update.website']) assert(client.includes(key), `Installed Base contains ${key}`)
    }
    const expand = page.getByRole('button', { name: '展开快捷入口', exact: true })
    if (await expand.isVisible()) await expand.click()
    await page.getByRole('button', { name: '设置', exact: true }).waitFor()
    assert.equal(await page.getByRole('link', { name: 'GitHub 项目' }).count(), 0)
    assert.equal(await page.getByRole('button', { name: /微信 WebChat/ }).count(), 0)
    const actions = page.locator('[data-zerowall-footer-action]')
    assert.equal(await actions.count(), 3)
    const labels = await actions.allTextContents()
    assert.deepEqual(labels.map(value => value.trim()), ['登录AI平台', '更新', '设置'])
    for (const theme of ['light', 'dark']) {
      await page.getByRole('button', { name: '设置', exact: true }).click()
      const general = page.getByRole('dialog', { name: '设置', exact: true })
      await general.getByRole('button', { name: '通用设置', exact: true }).click()
      await general.getByRole('button', { name: theme === 'light' ? '浅色' : '深色', exact: true }).click()
      await page.waitForFunction(mode => document.documentElement.style.colorScheme === mode, theme)
      await page.keyboard.press('Escape')
      for (const action of await actions.all()) {
        const dimensions = await action.evaluate(element => { const style = getComputedStyle(element); const svg = element.querySelector('svg'); return { height: element.getBoundingClientRect().height, radius: style.borderRadius, icon: svg?.getBoundingClientRect().width } })
        assert.deepEqual(dimensions, { height: 36, radius: '8px', icon: 18 })
      }
      const path = join(directory, `sidebar-${theme}.png`); await page.screenshot({ path }); evidence.screenshots.push(path)
    }
    const collapse = page.getByRole('button', { name: '收起侧边栏', exact: true })
    await collapse.click()
    await page.getByRole('button', { name: '打开侧边栏', exact: true }).waitFor()
    for (const action of await actions.all()) assert.equal(await action.getAttribute('aria-label') === null, false)
    const firstAction = actions.first()
    await firstAction.focus()
    assert(await firstAction.evaluate(element => document.activeElement === element))
    await page.keyboard.press('Tab')
    assert(await actions.nth(1).evaluate(element => document.activeElement === element))
    await page.keyboard.press('Tab')
    assert(await actions.nth(2).evaluate(element => document.activeElement === element))
    const collapsedPath = join(directory, 'sidebar-collapsed.png'); await page.screenshot({ path: collapsedPath }); evidence.screenshots.push(collapsedPath)
    await page.getByRole('button', { name: '打开侧边栏', exact: true }).click()
    evidence.checks.push('Footer order, removed entries, keyboard labels, collapsed sidebar, 36px rows / 18px icons / 8px radius using actual light/dark theme preference')
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const settings = page.getByRole('dialog')
    assert.equal(await settings.getByRole('button', { name: '插件配置', exact: true }).count(), 0)
    let releaseAccount
    accountGate = new Promise(resolve => { releaseAccount = resolve })
    await settings.getByRole('button', { name: '模型', exact: true }).click()
    await settings.getByRole('status').filter({ hasText: /^正在连接…$/ }).waitFor()
    releaseAccount(); accountGate = undefined
    await settings.getByText('2 个模型', { exact: true }).waitFor()
    await settings.getByRole('button', { name: '管理账户与模型', exact: true }).waitFor()
    await settings.getByRole('button', { name: '访问 AI 平台', exact: true }).waitFor()
    assert.equal(await settings.getByRole('status').filter({ hasText: /^在线$/ }).count(), 1)
    assert(!(await settings.innerText()).includes('account.'))
    const accountPath = join(directory, 'account-zh.png'); await page.screenshot({ path: accountPath }); evidence.screenshots.push(accountPath)
    await settings.getByRole('button', { name: '通用设置', exact: true }).click()
    await settings.getByRole('button', { name: '中文', exact: true }).click()
    await page.getByRole('menuitem', { name: 'English', exact: true }).click()
    await settings.getByRole('button', { name: 'Models', exact: true }).click()
    await settings.getByText('2 models', { exact: true }).waitFor()
    await settings.getByRole('button', { name: 'Manage account and models', exact: true }).waitFor()
    await settings.getByRole('button', { name: 'General', exact: true }).click()
    await settings.getByRole('button', { name: 'English', exact: true }).click()
    await page.getByRole('menuitem', { name: '中文', exact: true }).click()
    for (const [status, balanceFreshness, label] of [['signedOut', 'current', '未登录'], ['authExpired', 'current', '登录已过期'], ['signedIn', 'stale', '暂未连接']]) {
      accountFixture = { ...accountFixture, status, balanceFreshness }
      await settings.getByRole('button', { name: '模型', exact: true }).click()
      await settings.getByRole('status').filter({ hasText: new RegExp(`^${label}$`) }).waitFor()
      assert(!(await settings.innerText()).includes('account.'))
      await settings.getByRole('button', { name: '通用设置', exact: true }).click()
    }
    accountUnavailable = true
    await settings.getByRole('button', { name: '模型', exact: true }).click()
    await settings.getByRole('status').filter({ hasText: /^暂未连接$/ }).waitFor()
    evidence.checks.push('Installed account card: Chinese/English switch, model count and actions, signed out, expired, stale and unavailable states; RPC account data only is a fixture')
    await settings.getByRole('button', { name: '扩展中心', exact: true }).click()
    const center = settings.locator('section[aria-labelledby="zerowall-extension-center-title"]')
    await center.locator('article').first().waitFor({ timeout: 30_000 })
    assert(!(await center.innerText()).includes('@zerowallscience/dsh-bundle-'))
    evidence.checks.push('Real Extension Center excludes installed composition packages; Plugin Settings entry absent')
    await page.keyboard.press('Escape')
    await application.evaluate(({ BrowserWindow, ipcMain }) => {
      const status = { phase: 'available', currentVersion: '8.4.7', version: '99.0.0', notes: Array.from({ length: 45 }, (_, i) => `第 ${i + 1} 项界面改进和资源更新说明。`) }
      ipcMain.removeHandler('desktop:get-update-status'); ipcMain.handle('desktop:get-update-status', () => status)
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('desktop:update-status', status)
    })
    await page.setViewportSize({ width: 800, height: 480 })
    const dialog = page.getByRole('dialog', { name: '发现新版本', exact: true })
    await dialog.waitFor()
    const website = dialog.getByRole('link', { name: '访问官网' })
    assert.equal(await website.getAttribute('href'), 'https://zerowallscience.org/')
    await application.evaluate(({ shell }) => { shell.__websiteCalls = []; shell.openExternal = async url => { shell.__websiteCalls.push(url) } })
    await website.click()
    assert.deepEqual(await application.evaluate(({ shell }) => shell.__websiteCalls), ['https://zerowallscience.org/'])
    const geometry = await dialog.evaluate(element => { const content = element.querySelector('[tabindex="0"]'); return { scrollable: content.scrollHeight > content.clientHeight, footerVisible: element.querySelector('footer').getBoundingClientRect().bottom <= innerHeight } })
    assert(geometry.scrollable && geometry.footerVisible)
    evidence.checks.push('45 release notes scroll at 800x480; website link reaches Electron default-browser handler')
    const path = join(directory, 'update-small-window.png'); await page.screenshot({ path }); evidence.screenshots.push(path)
    evidence.complete = true
  }
  console.log(JSON.stringify({ complete: evidence.complete, directory, checks: evidence.checks }))
} catch (error) {
  evidence.error = error.message
  page ??= application.context().pages()[0]
  if (page) { await page.screenshot({ path: join(directory, prepare ? 'prepare-failure.png' : 'failure.png') }).catch(() => {}); evidence.body = (await page.locator('body').innerText().catch(() => '')).slice(-16000) }
  throw error
} finally {
  await application.close()
  if (prepare && evidence.complete) {
    await mkdir(join(userdata, 'credentials'), { recursive: true })
    await writeFile(join(userdata, 'credentials/vault.json'), JSON.stringify(upgradeVault))
    const profile = join(userdata, 'harness/profiles/web')
    const thirdParty = join(profile, 'node_modules/zws-upgrade-third-party')
    await mkdir(thirdParty, { recursive: true })
    await writeFile(join(thirdParty, 'package.json'), JSON.stringify({ name: 'zws-upgrade-third-party', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } } }))
    await writeFile(join(thirdParty, 'cordis.patch.yml'), '[]\n')
    const manifest = JSON.parse(await readFile(join(profile, 'package.json')))
    manifest.dependencies['zws-upgrade-third-party'] = 'link:./node_modules/zws-upgrade-third-party'
    manifest.dsh.profile.bundles.push('zws-upgrade-third-party')
    manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(id => id !== '@zerowallscience/plugin-videos')
    manifest.zerowall.disabledPlugins = ['@zerowallscience/plugin-videos']
    await writeFile(join(profile, 'package.json'), JSON.stringify(manifest, null, 2))
    const video = JSON.parse(await readFile(join(profile, 'node_modules/@zerowallscience/plugin-videos/package.json')))
    await writeFile(join(userdata, 'harness/resources/plugins/selection.json'), JSON.stringify({ disabled: ['@zerowallscience/plugin-videos'], removed: [], pinned: { '@zerowallscience/plugin-videos': video.version } }))
    const config = yaml.parse(await readFile(join(profile, 'cordis.patch.yml'), 'utf8'))
    const imageModel = { providerId: 'upgrade-provider', groupId: 'upgrade-group', modelId: 'original-model-id', profileId: 'upgrade-profile', resolution: '2K', aspectRatio: '16:9' }
    Object.assign(config.find(entry => entry.id === 'zerowall-environment').config, { imageModel, imageQuality: 'max' })
    await writeFile(join(profile, 'cordis.patch.yml'), yaml.stringify(config))
    const projectRoot = join(directory, 'research-project'); await mkdir(projectRoot, { recursive: true })
    const store = new ResearchStore(join(userdata, 'research/zerowall-research.sqlite'))
    let project
    try { project = store.createProject({ name: '升级保留科研项目', rootPath: projectRoot }) } finally { store.close() }
    const customFiles = { 'harness/zerowall-skills/upgrade-custom/SKILL.md': '# User imported skill\n', 'custom-mcp.json': JSON.stringify({ command: 'node', args: ['user-server.mjs'], env: { TOKEN: '${UPGRADE_TOKEN}' } }) }
    for (const [file, content] of Object.entries(customFiles)) { await mkdir(resolve(userdata, file, '..'), { recursive: true }); await writeFile(join(userdata, file), content) }
    const files = {}
    for (const file of ['credentials/vault.json', 'harness/resources/plugins/selection.json', 'harness/profiles/web/node_modules/zws-upgrade-third-party/package.json', ...Object.keys(customFiles)]) files[file] = createHash('sha256').update(await readFile(join(userdata, file))).digest('hex')
    await writeFile(join(directory, 'preservation.json'), JSON.stringify({ files, imageModel, project }, null, 2))
  }
  await writeFile(join(directory, prepare ? 'baseline.json' : 'receipt.json'), JSON.stringify(evidence, null, 2) + '\n')
}
