// @vitest-environment jsdom

import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import * as jsxRuntime from 'react/jsx-runtime'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (window as typeof window & { __ModuleLoader__?: unknown }).__ModuleLoader__
  document.querySelector('[data-plugin="dsh-free-search"]')?.remove()
})

it('opens and saves the official Free Search 0.6.0 configuration card', async () => {
  const root = resolve(import.meta.dirname, '../../..')
  const manifest = JSON.parse(readFileSync(resolve(root, 'desktop/node_modules/dsh-free-search/package.json'), 'utf8'))
  expect(manifest.version).toBe('0.6.0')
  const source = readFileSync(resolve(root, 'desktop/node_modules/dsh-free-search/lib/client.js'), 'utf8')
  let plugin: { apply(ctx: unknown): void } | undefined
  Object.defineProperty(window, '__ModuleLoader__', {
    configurable: true,
    value: {
      load: ({ factory }: { factory: (require: (name: string) => unknown) => unknown }) => {
        plugin = factory((name) => name === 'react' ? React : jsxRuntime) as typeof plugin
      },
    },
  })
  new Function('window', 'document', source)(window, document)

  let value = { provider: 'bing', lang: 'zh', keyStorage: 'credentials' }
  const mutations: Array<{ ns: string; ops: Array<{ op: string; path: string[]; value: unknown }> }> = []
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/describe')) return { json: async () => ({ ok: true, value: { writable: true, namespaces: [{ ns: 'web-search-free', value, secrets: [] }] } }) }
    if (url.endsWith('/credentials-status')) return { json: async () => ({ ok: true, value: { configured: {} } }) }
    if (url.endsWith('/mutate')) {
      const body = JSON.parse(String(init?.body)) as typeof mutations[number]
      mutations.push(body)
      value = { ...value, provider: String(body.ops.find(op => op.path[0] === 'provider')?.value ?? value.provider) }
      return { json: async () => ({ ok: true, value: { value } }) }
    }
    throw new Error(`Unexpected Free Search request: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)

  let Card: React.ComponentType<{ view: 'page' }> | undefined
  plugin?.apply({
    slots: {
      inject: (_name: string, register: () => unknown) => register(),
      register: (options: { key: string }, component: React.ComponentType<{ view: 'page' }>) => {
        expect(options.key).toBe('dsh-free-search#web-search-free')
        Card = component
      },
    },
    inject: () => {},
  })
  expect(Card).toBeDefined()
  const CardComponent = Card!
  render(<CardComponent view="page" />)
  const engine = await waitFor(() => {
    const select = document.querySelector<HTMLSelectElement>('select.dshfs-select')
    expect(select?.value).toBe('bing')
    return select!
  })
  fireEvent.change(engine, { target: { value: 'ddg' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(mutations).toHaveLength(1))
  expect(mutations[0]?.ns).toBe('web-search-free')
  expect(mutations[0]?.ops).toContainEqual({ op: 'set', path: ['provider'], value: 'ddg' })
})
