import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron } from 'playwright'
import { contract } from '../../tools/build/paths.mjs'
import { locatePackagedApp } from './packaged-app.mjs'

// Verify the actual packaged Host registration and Settings UI, rather than
// only handshaking directly with a server from a full Python staging tree.
const packaged = await locatePackagedApp(resolve(import.meta.dirname, '..'))
const profile = process.env.ZEROWALL_MCP_VERIFY_PROFILE
  ? resolve(process.env.ZEROWALL_MCP_VERIFY_PROFILE)
  : await mkdtemp(join(tmpdir(), 'zerowall-managed-mcp-verification-'))
assert(profile.startsWith(resolve(tmpdir()) + '\\'), 'Verification must use a disposable Windows temporary profile')
const output = join(contract.verification, 'managed-mcp')
await mkdir(output, { recursive: true })
const env = { ...process.env, ZEROWALL_USER_DATA_DIR: join(profile, 'userdata'), APPDATA: join(profile, 'appdata'), LOCALAPPDATA: join(profile, 'localappdata') }
delete env.ELECTRON_RUN_AS_NODE
delete env.ZEROWALL_DISABLE_DEFAULT_MCP
delete env.R_PLATFORM_MCP_AUTHORIZATION
await Promise.all(['userdata', 'appdata', 'localappdata'].map(name => mkdir(join(profile, name), { recursive: true })))
const evidence = { applicationVersion: contract.version, buildId: contract.buildId, profile, ok: false, pageErrors: [], servers: [], screenshots: [] }
const application = await _electron.launch({ executablePath: packaged.executablePath, env, args: [`--user-data-dir=${join(profile, 'chromium-managed')}`], timeout: 120_000 })
let page
async function list() {
  const child = spawn(packaged.executablePath, ['--expose-internals', join(packaged.resourcesRoot, 'commands/zws.mjs'), 'mcp', 'list'],
    { env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''
  child.stdout.on('data', data => { stdout += data }); child.stderr.on('data', data => { stderr += data })
  const timer = setTimeout(() => child.kill(), 30_000)
  const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept) }).finally(() => clearTimeout(timer))
  assert.equal(code, 0, `Packaged MCP list failed: ${stderr.slice(-500)}`)
  return JSON.parse(stdout)
}
try {
  page = await application.firstWindow({ timeout: 60_000 })
  page.on('pageerror', error => evidence.pageErrors.push(error.message))
  await page.waitForURL(url => /^https?:/u.test(url.protocol), { timeout: 180_000 })
  await page.getByRole('button', { name: /^(设置|Settings)$/ }).first().waitFor({ timeout: 60_000 })
  for (const [name, action] of [['内测声明', '继续'], ['添加一个 API Key 开始使用', '稍后配置']]) {
    const dialog = page.getByRole('dialog', { name, exact: true })
    if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button', { name: action, exact: true }).click()
  }
  if (await page.getByRole('dialog', { name: '登录或注册', exact: true }).isVisible().catch(() => false)) await page.keyboard.press('Escape')
  const deadline = Date.now() + 180_000
  let servers = []
  while (Date.now() < deadline) {
    servers = await list()
    const bio = servers.find(item => item.serverName === 'zerowall_managed_bio_tools')
    const rmcp = servers.find(item => item.serverName === 'rmcp')
    if (bio?.runtimeState === 'active' && bio.tools.length === 8 && rmcp?.runtimeState === 'waiting-for-credentials') break
    if (bio?.runtimeState === 'error') throw new Error(`Packaged Bio Tools registration failed: ${bio.runtimeError}`)
    await new Promise(accept => setTimeout(accept, 1000))
  }
  evidence.servers = servers.map(item => ({ serverName: item.serverName, enabled: item.enabled, runtimeState: item.runtimeState, tools: item.tools, toolDiscoveryState: item.toolDiscoveryState, missingEnvironmentVariables: item.missingEnvironmentVariables }))
  const bio = servers.find(item => item.serverName === 'zerowall_managed_bio_tools')
  const rmcp = servers.find(item => item.serverName === 'rmcp')
  assert.equal(bio?.runtimeState, 'active', 'Managed Bio Tools must activate in the real Host')
  assert.equal(bio.tools.length, 8)
  assert(bio.tools.every(name => name.startsWith('mcp__zerowall_managed_bio_tools__')))
  assert.equal(rmcp?.runtimeState, 'waiting-for-credentials')
  assert(rmcp.missingEnvironmentVariables.includes('R_PLATFORM_MCP_AUTHORIZATION'))
  await page.getByRole('button', { name: /^(设置|Settings)$/ }).first().click()
  const settings = page.getByRole('dialog', { name: /^(设置|Settings)$/ })
  await settings.getByRole('button', { name: '内置插件', exact: true }).click()
  await settings.getByRole('tab', { name: 'MCP', exact: true }).click()
  await settings.getByRole('button', { name: /Bio Tools/ }).click()
  const tools = settings.getByRole('region', { name: '可用工具', exact: true })
  await tools.locator('code').first().waitFor()
  assert.equal(await tools.locator('code').count(), 8, 'The Settings panel must show all registered Bio Tools')
  const bioScreenshot = join(output, 'bio-tools.png')
  await page.screenshot({ path: bioScreenshot }); evidence.screenshots.push(bioScreenshot)
  await settings.getByRole('button', { name: /rmcp/ }).click()
  await settings.getByText('等待 RMCP Authorization 凭据。', { exact: true }).waitFor()
  assert.equal(await settings.getByText('已连接，但远端返回 0 个工具。', { exact: true }).count(), 0)
  const rmcpScreenshot = join(output, 'rmcp-missing-credentials.png')
  await page.screenshot({ path: rmcpScreenshot }); evidence.screenshots.push(rmcpScreenshot)
  assert.deepEqual(evidence.pageErrors, [])
  evidence.ok = true
  console.log('Packaged managed MCP Host and Settings verified:', output)
} catch (error) {
  evidence.error = String(error)
  if (page) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {})
  throw error
} finally {
  await writeFile(join(output, 'verification.json'), JSON.stringify(evidence, null, 2))
  await application.close()
}
