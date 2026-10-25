import { describe, expect, it, vi } from 'vitest'
import { attachManagement } from '../src/host/management.js'

describe('Host readiness management', () => {
  it('keeps history interfaces in the core gate while optional plugins activate independently', () => {
    const send = vi.fn()
    const previous = Object.getOwnPropertyDescriptor(process, 'send')
    const effects: Array<() => void> = []
    const entries = [{ options: { id: 'connection', name: 'connection' }, fiber: { state: 2 } }]
    const ctx = { root: { loader: { entries: () => entries } }, effect: (setup: () => () => void) => effects.push(setup()) }
    Object.defineProperty(process, 'send', { value: send, configurable: true, writable: true })
    try {
      attachManagement(ctx as never)
      const health = (strict = false) => {
        process.emit('message', { type: 'zerowall:management', id: 'readiness-probe', operation: 'host.health', args: [{ strict }] }, undefined)
        return send.mock.calls.at(-1)?.[0].result.ready
      }
      for (const id of ['workspace', 'session-controller', 'workspace-controller']) {
        entries.push({ options: { id, name: id }, fiber: { state: 0 } })
        expect(health()).toBe(false)
        entries.at(-1)!.fiber.state = 2
        expect(health()).toBe(true)
      }
      entries.push({ options: { id: 'research', name: 'research' }, fiber: { state: 3 } })
      expect(health()).toBe(true)
      expect(health(true)).toBe(false)
    } finally {
      for (const dispose of effects.reverse()) dispose()
      if (previous) Object.defineProperty(process, 'send', previous)
      else Reflect.deleteProperty(process, 'send')
    }
  })
})
