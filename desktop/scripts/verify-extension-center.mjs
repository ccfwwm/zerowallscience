import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { _electron } from 'playwright'
import { contract } from '../../tools/build/paths.mjs'
import { locatePackagedApp } from './packaged-app.mjs'

const packaged = await locatePackagedApp(join(import.meta.dirname, '..'))
const directory = join(contract.verification, 'extension-center', randomUUID())
const userdata = join(directory, 'userdata')
await mkdir(join(userdata, 'harness/profiles/web'), { recursive: true })
// Recover the already-installed 8.0.2 profile produced by the faulty migration.
await writeFile(join(userdata, 'harness/profiles/web/package.json'), JSON.stringify({ private: true, dependencies: {}, zerowall: { pluginArchitecture: 2 }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@zerowallscience/plugin-extension-center'] } } }))
for (const name of ['appdata', 'localappdata']) await mkdir(join(directory, name))
const env = { ...process.env, ZEROWALL_USER_DATA_DIR: userdata, ZEROWALL_DISABLE_DEFAULT_MCP: '1', APPDATA: join(directory, 'appdata'), LOCALAPPDATA: join(directory, 'localappdata') }
delete env.ELECTRON_RUN_AS_NODE
const application = await _electron.launch({ executablePath: packaged.executablePath, env, args: [`--user-data-dir=${join(directory, 'chromium')}`], timeout: 120_000 })
const evidence = { version: contract.version, checks: [], screenshots: [], pageErrors: [] }
let page
try {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    page = application.context().pages().find(candidate => candidate.url().startsWith('http://127.0.0.1:'))
    if (page) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert(page, 'Packaged Host navigation')
  page.on('pageerror', error => evidence.pageErrors.push(error.message))
  await page.getByText('ZeroWall Science', { exact: true }).first().waitFor({ timeout: 120_000 })
  for (const [name, button] of [['内测声明', '继续'], ['添加一个 API Key 开始使用', '稍后配置']]) {
    const notice = page.getByRole('dialog', { name })
    if (await notice.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) await notice.getByRole('button', { name: button }).click()
  }
  const login = page.getByRole('dialog', { name: '登录或注册' })
  if (await login.isVisible()) await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^(设置|Settings)$/ }).click()
  const settings = page.getByRole('dialog', { name: /^(设置|Settings)$/ })
  await settings.getByRole('button', { name: '扩展中心', exact: true }).click()
  const section = settings.locator('section[aria-labelledby="zerowall-extension-center-title"]')
  await section.getByText('本地资源').first().waitFor({ timeout: 60_000 }).catch(() => {})
  await section.getByRole('button', { name: '检查更新', exact: true }).waitFor({ timeout: 60_000 })
  await section.getByText('文件预览与附件', { exact: true }).waitFor()
  assert(!(await section.innerText()).includes('unknown'))
  assert(!(await section.innerText()).includes('Catalog download failed'))
  const core = section.locator('article').filter({ has: page.getByText('@deepseek-ai/dsh-base', { exact: true }) })
  assert.equal(await core.getByRole('button').count(), 0, 'Core cannot be disabled or removed')
  assert((await core.innerText()).includes('0.2.0-rc.2'), 'Real core version')
  const inventory = await page.evaluate(() => window.zerowallDesktop.resources.check('plugin', true))
  assert(inventory.resources.some(item => item.id === 'dsh-better-sidebar' && item.version !== 'core'))
  assert(inventory.resources.find(item => item.id === '@zerowallscience/plugin-skills')?.enabled)
  assert(inventory.resources.find(item => item.id === '@zerowallscience/plugin-extension-center')?.enabled)
  evidence.checks.push('broken 8.0.2 profile migrated; complete plugin inventory; actual versions; protected core')
  async function screenshot(name) { const path = join(directory, name + '.png'); await page.screenshot({ path }); evidence.screenshots.push(path) }
  await screenshot('plugins')
  for (const name of ['Skills', 'MCP']) {
    await section.getByRole('button', { name, exact: true }).click()
    assert.equal(await section.getByText('本地资源读取失败', { exact: false }).count(), 0)
    await screenshot(name.toLowerCase())
  }
  const before = await readFile(join(userdata, 'harness/profiles/web/package.json'), 'utf8')
  await section.getByRole('button', { name: '检查更新', exact: true }).click()
  await section.getByRole('button', { name: '检查更新', exact: true }).waitFor({ timeout: 60_000 })
  assert.equal(await readFile(join(userdata, 'harness/profiles/web/package.json'), 'utf8'), before, 'Catalog checks must not install resources')
  await application.context().setOffline(true)
  await section.getByRole('button', { name: '插件', exact: true }).click()
  await page.setViewportSize({ width: 800, height: 760 })
  await screenshot('plugins-narrow-offline')
  const overflow = await section.evaluate(node => node.scrollWidth > node.clientWidth + 1)
  assert.equal(overflow, false, 'Extension center fits settings content')
  evidence.checks.push('Skills and MCP local lists; read-only checks; narrow offline layout')
  evidence.ok = true
  console.log('Extension center verified:', directory)
} catch (error) {
  evidence.error = error.message
  if (page) await page.screenshot({ path: join(directory, 'failure.png') }).catch(() => {})
  throw error
} finally {
  await writeFile(join(directory, 'receipt.json'), JSON.stringify(evidence, null, 2))
  await application.close()
}
