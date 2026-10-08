import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { Context } from '@deepseek-ai/cordis'
import type { Key, ReactNode } from 'react'

const registry = vi.hoisted(() => new Map<string, (raw: string, key: Key) => ReactNode>())
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...await vi.importActual('@deepseek-ai/dsh-client-ui-primitives'),
  GenuiActionContext: undefined,
  getGenuiComponent: undefined,
  registerFenceRenderer: (lang: string, renderer: (raw: string, key: Key) => ReactNode) => {
    registry.set(lang, renderer)
    return () => { registry.delete(lang) }
  },
}))
vi.mock('../src/client/achievement-toast.tsx', () => ({ mountAchievementToasts: () => () => {} }))
vi.mock('../src/client/i18n/index.ts', async () => ({
  ...await vi.importActual('../src/client/i18n/index.ts'),
  bridgeHostLocale: () => () => {},
}))
import { apply } from '../src/client/index.tsx'

afterEach(() => { cleanup(); registry.clear() })

describe('SVG registry integration', () => {
  it('registers SVG alongside dsh-ui and disposes both', () => {
    const ctx = { slots: { inject: () => () => {} }, inject: () => {} } as unknown as Context
    const dispose = apply(ctx)
    try {
      expect([...registry.keys()].sort()).toEqual(['dsh-ui', 'svg'])
      const renderer = registry.get('svg')!
      const { getByRole } = render(<>{renderer('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"/>', 'svg')}</>)
      expect(getByRole('img')).not.toBeNull()
      expect(getByRole('button', { name: '源码', exact: true })).not.toBeNull()
    } finally { dispose() }
    expect(registry.size).toBe(0)
  })
})
