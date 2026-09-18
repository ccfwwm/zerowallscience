import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { _electron } from 'playwright'

const desktop = resolve(import.meta.dirname, '..')
const output = resolve(desktop, 'dist/verification-6.3.0')
const root = await mkdtemp(join(tmpdir(), 'zerowall-modern-'))
await mkdir(output, { recursive: true })
for (const dir of ['appdata', 'localappdata']) await mkdir(join(root, dir))
const electronApp = await _electron.launch({
  executablePath: join(desktop, 'dist/win-unpacked/ZeroWallScience.exe'),
  args: [`--user-data-dir=${join(root, 'chromium')}`],
  env: { ...process.env, APPDATA: join(root, 'appdata'), LOCALAPPDATA: join(root, 'localappdata'), ZEROWALL_USER_DATA_DIR: join(root, 'userdata') }, timeout:90_000,
})
const app = electronApp.process()
const evidence = { root, errors: [], screenshots: [], startup: [] }
try {
  const context = electronApp.context()
  let page
  for (let n = 0; n < 300; n++) { page = context.pages().find(p => !p.url().startsWith('devtools:')); if (page) break; await new Promise(r => setTimeout(r, 100)) }
  assert(page, 'Application page exists')
  page.on('pageerror', e => evidence.errors.push(e.message))
  const shot = async name => { const path = join(output, name + '.png'); await page.screenshot({ path }); evidence.screenshots.push(path) }
  await page.locator('#zerowall-window-controls').waitFor({ timeout: 60_000 })
  if (page.url().startsWith('file:')) {
    await shot('startup')
    const read = () => page.evaluate(() => ({ width: document.querySelector('.track')?.getBoundingClientRect().width, height: document.querySelector('.track')?.getBoundingClientRect().height,
      transform: getComputedStyle(document.querySelector('.track'), '::after').transform, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches }))
    evidence.startup.push(await read()); await page.waitForTimeout(700); evidence.startup.push(await read())
    assert.equal(evidence.startup[0].height, 14)
    assert.notEqual(evidence.startup[0].transform, evidence.startup[1].transform)
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(100)
    assert.notEqual(await page.locator('.track').evaluate(e => getComputedStyle(e, '::after').animationName), 'none')
    await shot('startup-reduced-motion')
    await page.emulateMedia({ reducedMotion: null })
    const frames = join(output, 'startup-frames')
    await mkdir(frames, { recursive: true })
    for (let i=0; i<16 && page.url().startsWith('file:'); i++) {
      await page.screenshot({ path: join(frames, `${String(i).padStart(3, '0')}.png`) })
      await page.waitForTimeout(100)
    }
  }
  await page.waitForURL(url => url.protocol === 'http:', { timeout: 180_000 })
  await page.locator('#zerowall-window-controls').waitFor({ timeout: 60_000 })
  await page.waitForTimeout(3000)
  const notice = page.getByRole('dialog', { name: '内测声明' })
  if (await notice.isVisible()) { await notice.getByRole('button', { name: '继续' }).click(); await notice.waitFor({state:'hidden'}) }
  const credential = page.getByRole('dialog', { name: '添加一个 API Key 开始使用' })
  await credential.waitFor({ state:'visible', timeout:10000 }).catch(() => {})
  if (await credential.isVisible()) { await credential.getByRole('button', { name: '稍后配置' }).click(); await credential.waitFor({state:'hidden'}) }
  await page.waitForTimeout(1500)
  const login = page.getByRole('dialog', { name: '登录或注册' })
  if (await login.isVisible()) await page.keyboard.press('Escape')
  await shot('workbench')
  const toggle = page.getByRole('button', { name: '收起侧边栏', exact:true })
  if (await toggle.isVisible()) {
    await toggle.click(); await page.waitForTimeout(500); await shot('sidebar-collapsed')
    const rects = await page.evaluate(() => ({ controls: document.querySelector('#zerowall-window-controls').getBoundingClientRect().toJSON(), toggle: [...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')==='打开侧边栏')?.getBoundingClientRect().toJSON() }))
    evidence.collapsed = rects
    if (!(rects.toggle && rects.toggle.y >= rects.controls.bottom)) {
      evidence.layout = await page.evaluate(() => [...document.querySelectorAll('button')].filter(e=>/侧边栏/.test(e.getAttribute('aria-label')||'')).map(e=>({label:e.getAttribute('aria-label'),ancestors:[e,e.parentElement,e.parentElement.parentElement,e.parentElement.parentElement.parentElement,e.parentElement.parentElement.parentElement.parentElement].map(n=>({tag:n.tagName,cls:n.className,style:getComputedStyle(n).paddingTop,rect:n.getBoundingClientRect().toJSON()}))})))
    }
    assert(rects.toggle && rects.toggle.y >= rects.controls.bottom, 'Collapsed toggle clears traffic lights: '+JSON.stringify(rects))
    await page.getByRole('button', {name:'打开侧边栏',exact:true}).click()
  }
  const settingsButton=page.getByRole('button',{name:/^(设置|Settings)$/})
  await settingsButton.click()
  const settings=page.getByRole('dialog',{name:/^(设置|Settings)$/})
  await settings.waitFor()
  assert.equal(await page.locator('#zerowall-window-controls button').count(),3)
  const controlVisuals = await page.locator('#zerowall-window-controls button').evaluateAll(buttons => buttons.map(button => {
    const dot = button.querySelector('i')
    const icon = button.querySelector('svg.control-icon')
    const path = icon?.querySelector('path')
    return {
      action: button.getAttribute('data-action'),
      background: dot ? getComputedStyle(dot).backgroundColor : '',
      opacity: dot ? getComputedStyle(dot).opacity : '',
      icon: Boolean(icon),
      path: path?.getAttribute('d') ?? '',
      stroke: path ? getComputedStyle(path).stroke : '',
    }
  }))
  const rgb = value => value.match(/\d+/g)?.map(Number) ?? []
  const [closeRgb, minimizeRgb, maximizeRgb] = controlVisuals.map(control => rgb(control.background))
  assert(closeRgb[0] > 220 && closeRgb[1] < 150 && closeRgb[2] < 150, JSON.stringify(controlVisuals))
  assert(minimizeRgb[0] > 220 && minimizeRgb[1] > 140 && minimizeRgb[2] < 120, JSON.stringify(controlVisuals))
  assert(maximizeRgb[0] < 100 && maximizeRgb[1] > 150 && maximizeRgb[2] < 120, JSON.stringify(controlVisuals))
  assert(controlVisuals.every(control => control.opacity === '1' && control.icon && control.path && control.stroke !== 'none'), JSON.stringify(controlVisuals))
  evidence.windowControlsVisuals = controlVisuals
  await page.mouse.move(600, 400)
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].blur())
  await page.locator('#zerowall-window-controls[data-focused=false]').waitFor()
  const inactive = await page.locator('#zerowall-window-controls i').evaluateAll(dots => dots.map(dot => ({ background: getComputedStyle(dot).backgroundColor, opacity: getComputedStyle(dot).opacity })))
  assert.deepEqual(inactive.map(dot => dot.background), controlVisuals.map(control => control.background))
  assert(inactive.every(dot => dot.opacity === '1'))
  evidence.inactiveControls = inactive
  await page.locator('#zerowall-window-controls').screenshot({ path: join(output, 'window-controls-unfocused.png') })
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus())
  await shot('settings-window-controls')
  await settings.getByRole('button',{name:/^(关闭|Close)$/}).click()
  const buttons = page.locator('#zerowall-window-controls button')
  assert.equal(await buttons.count(), 3)
  await page.getByRole('button', { name: '最大化', exact: true }).click()
  await page.getByRole('button', { name: '还原窗口', exact: true }).waitFor()
  assert.equal((await page.evaluate(() => window.zerowallDesktop.windowControl('state'))).maximized, true)
  await shot('maximized')
  await page.getByRole('button', { name: '还原窗口', exact: true }).click()
  await page.getByRole('button', { name: '最大化', exact: true }).waitFor()
  assert.equal((await page.evaluate(() => window.zerowallDesktop.windowControl('state'))).maximized, false)
  await page.getByRole('button',{name:'最小化',exact:true}).click()
  assert.equal(await electronApp.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isMinimized()),true)
  await electronApp.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].restore())
  await page.waitForFunction(() => document.visibilityState === 'visible')
  await page.getByRole('button',{name:'收起到托盘',exact:true}).click()
  // Electron keeps renderer visibility "visible" with backgroundThrottling:false.
  // Assert the actual native window state, rather than Page Visibility API.
  assert.equal(app.exitCode,null)
  assert.equal(await electronApp.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isVisible()),false)
  assert.equal((await page.evaluate(()=>window.zerowallDesktop.windowControl('state'))).maximized,false)
  assert(!evidence.errors.some(x => /preload|window-control|window-chrome/i.test(x)), evidence.errors.join('\n'))
  evidence.passed = true
  evidence.windowControls = { maximize:true, restore:true, minimize:true, closeHidesWithoutExiting:true }
  console.log(JSON.stringify(evidence, null, 2))
} finally {
  await writeFile(join(output, 'modern-desktop.json'), JSON.stringify(evidence, null, 2))
  if(app.pid) await new Promise(r => { const p=spawn('taskkill', ['/PID', String(app.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); p.on('exit', r) })
}
