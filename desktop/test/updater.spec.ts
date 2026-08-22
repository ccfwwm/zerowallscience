import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { DesktopUpdateController, isDailyUpdateCheckDue, type DesktopUpdaterPort } from '../src/main/updater.js'

class FakeUpdater extends EventEmitter implements DesktopUpdaterPort {
  autoDownload = true
  autoInstallOnAppQuit = false
  checkForUpdates = vi.fn(async () => undefined)
  downloadUpdate = vi.fn(async () => undefined)
  quitAndInstall = vi.fn()
}

describe('desktop online updater', () => {
  it('checks manually, exposes an available version, downloads, and installs on confirmation', async () => {
    const updater = new FakeUpdater()
    const published = vi.fn()
    const controller = new DesktopUpdateController({ updater, enabled: true, currentVersion: '3.0.0', publish: published })
    expect(updater.autoDownload).toBe(false)
    await controller.check()
    updater.emit('update-available', { version: '3.0.1' })
    expect(controller.current()).toMatchObject({ phase: 'available', version: '3.0.1' })
    await controller.download()
    updater.emit('download-progress', { percent: 42.5 })
    updater.emit('update-downloaded', { version: '3.0.1' })
    expect(controller.current()).toMatchObject({ phase: 'downloaded', percent: 100 })
    expect(controller.install()).toBe(true)
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
    expect(published).toHaveBeenCalled()
  })

  it('does not contact the update feed in development or Preview builds', async () => {
    const updater = new FakeUpdater()
    const controller = new DesktopUpdateController({ updater, enabled: false, currentVersion: '3.0.1', publish: vi.fn() })
    await expect(controller.check()).resolves.toMatchObject({ phase: 'unavailable' })
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('returns a sanitized error without publishing upstream details', async () => {
    const updater = new FakeUpdater()
    updater.checkForUpdates.mockRejectedValue(new Error('https://feed.invalid/?token=secret'))
    const controller = new DesktopUpdateController({ updater, enabled: true, currentVersion: '3.0.1', publish: vi.fn() })
    await controller.check()
    expect(controller.current().message).not.toContain('secret')
  })

  it('publishes Chinese download failures for the desktop UI', async () => {
    const updater = new FakeUpdater()
    updater.downloadUpdate.mockRejectedValue(new Error('download failed'))
    const controller = new DesktopUpdateController({ updater, enabled: true, currentVersion: '3.1.10', publish: vi.fn() })
    updater.emit('update-available', { version: '4.0.2', releaseNotes: '修复更新下载' })
    await controller.download()
    expect(controller.current()).toMatchObject({ phase: 'error', message: '无法下载更新，请检查网络后重试。' })
  })

  it('limits automatic checks to one per day while keeping manual checks available', () => {
    const now = Date.parse('2026-08-19T12:00:00.000Z')
    expect(isDailyUpdateCheckDue(undefined, now)).toBe(true)
    expect(isDailyUpdateCheckDue(now - 24 * 60 * 60 * 1000, now)).toBe(true)
    expect(isDailyUpdateCheckDue(now - 1, now)).toBe(false)
  })

  it('normalizes release notes for the update dialog', async () => {
    const updater = new FakeUpdater()
    const controller = new DesktopUpdateController({ updater, enabled: true, currentVersion: '3.1.6', publish: vi.fn() })
    updater.emit('update-available', {
      version: '4.0.2',
      releaseNotes: '# ZeroWall Science 4.0.2\n\n- 修复 Windows 更新下载地址。',
    })
    expect(controller.current()).toMatchObject({
        phase: 'available', version: '4.0.2',
        notes: ['修复 Windows 更新下载地址。'],
    })
  })
})
