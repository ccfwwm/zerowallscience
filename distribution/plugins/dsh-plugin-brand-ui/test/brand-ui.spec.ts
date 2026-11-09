import { describe, expect, it, vi } from 'vitest'
import { apply as hostApply, name } from '../src/host/index.js'
import { apply, inject } from '../src/client/index.js'

describe('ZeroWall brand UI plugin', () => {
  it('exports a safe host entry', () => {
    expect(name).toBe('@zerowall/dsh-plugin-brand-ui')
    expect(() => hostApply({} as never)).not.toThrow()
  })

  it('registers the public brand slots and a reversible theme layer', () => {
    const registrations: unknown[] = []
    const consume = (result: unknown) => {
      if (!result || typeof result !== 'object' || !(Symbol.iterator in result)) return
      const iterator = (result as Iterable<unknown>)[Symbol.iterator]()
      for (let step = iterator.next(); !step.done; step = iterator.next()) consume(step.value)
    }
    const ctx = {
      effect: vi.fn((factory: () => unknown) => factory()),
      theme: { overrideTokens: vi.fn(() => () => {}) },
      slots: {
        inject: vi.fn((_name: string, factory: () => unknown) => consume(factory())),
        register: vi.fn((options: unknown, component: unknown) => { registrations.push({ options, component }); return () => {} }),
      },
    }
    apply(ctx as never)
    expect(inject).toEqual(['slots', 'theme'])
    expect(ctx.theme.overrideTokens).toHaveBeenCalledOnce()
    expect(ctx.slots.register).toHaveBeenCalledTimes(4)
    expect(registrations.map(value => (value as { options: { name: string; priority: number } }).options)).toEqual([
      { name: 'sidebar.brand.mark', priority: -100 },
      { name: 'sidebar.brand.name', priority: -100 },
      { name: 'conversation.hero.brand.mark', priority: -100 },
      { name: 'conversation.hero.brand.title', priority: -100 },
    ])
  })
})
