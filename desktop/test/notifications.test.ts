import { EventEmitter } from 'node:events'
import { describe, it, expect, vi } from 'vitest'
import type { Notification, NotificationConstructorOptions } from 'electron'
import { DesktopNotifications, parseSessionNotification } from '../src/main/notifications.js'

describe('desktop session notifications', () => {
  const payload = { title: '会话完成', body: '科研分析', tag: 'completed', sessionId: 'session-a' }
  function setup() {
    const records: Array<{ native: EventEmitter & { show: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }; options: NotificationConstructorOptions }> = []
    const activate = vi.fn(), failed = vi.fn()
    const manager = new DesktopNotifications({ supported: () => true, icon: 'icon.png', activate, failed,
      create: options => {
        const native = Object.assign(new EventEmitter(), { show: vi.fn(), close: vi.fn() })
        records.push({ native, options })
        return native as unknown as Notification
      },
    })
    return { manager, records, activate, failed }
  }
  it('validates IPC payloads and rejects malformed identifiers', () => {
    expect(parseSessionNotification(payload)).toEqual(payload)
    for (const value of [null, {}, { ...payload, title: '' }, { ...payload, sessionId: 42 }, { ...payload, sessionId: 'bad\nvalue' }, { ...payload, body: 'x'.repeat(4097) }]) {
      expect(parseSessionNotification(value)).toBeUndefined()
    }
  })
  it('activates the exact conversation and avoids a duplicate Windows sound', () => {
    const { manager, records, activate } = setup()
    expect(manager.show(payload)).toBe(true)
    expect(records[0]?.options.silent).toBe(true)
    records[0]?.native.emit('click')
    expect(activate).toHaveBeenCalledWith('session-a')
    expect(records[0]?.native.close).toHaveBeenCalledOnce()
  })
  it('keeps different conversations distinct and replaces only matching alerts', () => {
    const { manager, records } = setup()
    manager.show(payload)
    manager.show({ ...payload, sessionId: 'session-b' })
    expect(records[0]?.native.close).not.toHaveBeenCalled()
    manager.show(payload)
    expect(records[0]?.native.close).toHaveBeenCalledOnce()
    expect(records[1]?.native.close).not.toHaveBeenCalled()
  })
  it('reports OS delivery errors and can send the next alert', () => {
    const { manager, records, failed } = setup()
    manager.show(payload)
    records[0]?.native.emit('failed', {}, 'notifications disabled')
    expect(failed).toHaveBeenCalledWith('notifications disabled')
    expect(manager.show(payload)).toBe(true)
  })
})
