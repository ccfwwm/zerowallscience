import type { MenuItemConstructorOptions } from 'electron'
import { afterEach, expect, it, vi } from 'vitest'
import { resolveDesktopLocale } from '../src/locale.ts'
import { DesktopTray } from '../src/tray.ts'

const native = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events')
  const trays: FakeTray[] = []
  class FakeTray extends EventEmitter {
    readonly setToolTip = vi.fn()
    readonly setContextMenu = vi.fn()
    readonly destroy = vi.fn()
    constructor(readonly image: unknown) { super(); trays.push(this) }
  }
  const menus: MenuItemConstructorOptions[][] = []
  return {
    trays, FakeTray, menus,
    createFromPath: vi.fn((path: string) => ({ path })),
    buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => { menus.push(template); return { template } }),
  }
})
vi.mock('electron', () => ({
  Tray: native.FakeTray,
  nativeImage: { createFromPath: native.createFromPath },
  Menu: { buildFromTemplate: native.buildFromTemplate },
}))

afterEach(() => { native.trays.length = 0; native.menus.length = 0; vi.clearAllMocks() })

function setup(locale = 'en') {
  let current = resolveDesktopLocale(locale)
  let launchAtLogin = false
  const open = vi.fn()
  const quit = vi.fn()
  const setLaunchAtLogin = vi.fn((enabled: boolean) => { launchAtLogin = enabled })
  const tray = new DesktopTray({ iconPath: 'C:/app/resources/tray.ico', locale: () => current, open, quit,
    launchAtLogin: () => launchAtLogin, launchAtLoginAvailable: true, setLaunchAtLogin })
  return { tray, open, quit, setLaunchAtLogin, native: native.trays[0]!,
    setLocale: (next: string) => { current = resolveDesktopLocale(next) } }
}

function labels(menu: MenuItemConstructorOptions[]): (string | undefined)[] {
  return menu.map(item => item.type === 'separator' ? 'separator' : item.label)
}

it('shows the application icon, login preference and Open / Quit actions', () => {
  const f = setup()
  expect(native.createFromPath).toHaveBeenCalledWith('C:/app/resources/tray.ico')
  expect(f.native.image).toEqual({ path: 'C:/app/resources/tray.ico' })
  expect(f.native.setToolTip).toHaveBeenCalledWith('ZeroWall Science')
  expect(labels(native.menus[0]!)).toEqual(['Open ZeroWall Science', 'Launch at login', 'separator', 'Quit ZeroWall Science'])
  expect(native.menus[0]![1]).toMatchObject({ type: 'checkbox', checked: false, enabled: true })
  expect(f.native.setContextMenu).toHaveBeenCalledWith({ template: native.menus[0] })
})

it('opens the window on a single click and routes menu entries to the open and quit actions', () => {
  const f = setup()
  f.native.emit('click')
  expect(f.open).toHaveBeenCalledOnce()
  const menu = native.menus[0]!
  ;(menu[0] as { click: () => void }).click()
  ;(menu[1] as { click: (item: { checked: boolean }) => void }).click({ checked: true })
  ;(menu[3] as { click: () => void }).click()
  expect(f.open).toHaveBeenCalledTimes(2)
  expect(f.setLaunchAtLogin).toHaveBeenCalledExactlyOnceWith(true)
  expect(f.quit).toHaveBeenCalledOnce()
})

it('relabels the menu in the current locale and ignores relabel after disposal', () => {
  const f = setup()
  f.setLocale('zh')
  f.tray.relabel()
  expect(labels(native.menus[1]!)).toEqual(['打开 ZeroWall Science', '登录时启动', 'separator', '退出 ZeroWall Science'])
  f.tray.dispose()
  f.tray.dispose()
  expect(f.native.destroy).toHaveBeenCalledOnce()
  f.tray.relabel()
  expect(native.menus).toHaveLength(2)
})

it('disables login startup when the operating system registration is unavailable', () => {
  const current = resolveDesktopLocale('en')
  const tray = new DesktopTray({ iconPath: 'C:/app/resources/tray.ico', locale: () => current,
    open: vi.fn(), quit: vi.fn(), launchAtLogin: () => false, launchAtLoginAvailable: false, setLaunchAtLogin: vi.fn() })
  expect(native.menus[0]![1]).toMatchObject({ type: 'checkbox', checked: false, enabled: false })
  tray.dispose()
})
