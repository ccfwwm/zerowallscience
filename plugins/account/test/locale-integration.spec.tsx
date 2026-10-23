// @vitest-environment jsdom
import '../../../tests/support/native-dialog.js'
import React from 'react'
import { act, cleanup, waitFor } from '@testing-library/react'
import { afterEach, expect, it, onTestFinished } from 'vitest'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { URL as NodeURL } from 'node:url'
import * as tar from 'tar'
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotTestRuntime } from '../../../deepseek-harness/packages/test-support/client-runtime/src/index.js'
import { apply } from '../src/client/index.js'
import { apply as applyBase } from '../../base/src/client/index.js'

afterEach(cleanup)

async function setup(current: () => Promise<unknown>, withDictionary = true, clients = { account: apply, base: applyBase }) {
  const runtime = await SlotTestRuntime.create()
  onTestFinished(() => runtime.dispose())
  const locale = new LocaleRuntime(new Context())
  locale.setLocale('zh')
  runtime.slots.installLocale(locale)
  await runtime.root.declare({ 'settings.models.provider-card': { kind: 'keyed', scope: 'root' } }, ({ renderSlot }) =>
    renderSlot('settings.models.provider-card', {} as any, { entryKey: 'zerowall-ai-cloud' }))
  let accountHandle: Awaited<ReturnType<typeof runtime.mount>> | undefined
  const loadAccount = async () => {
    await accountHandle?.dispose()
    accountHandle = await runtime.mount({ inject: ['slots'], apply(ctx: any) {
      clients.account({ locale, slots: ctx.slots, effect: ctx.effect.bind(ctx), on: () => {}, inject: () => {}, remote: { $on: () => () => {} }, get: (name: string) => name === 'remote.zerowallAccount' ? { current } : undefined } as any)
    } })
  }
  const disposers: Array<() => void> = []
  const loadBase = async () => {
    for (const dispose of disposers.splice(0)) dispose()
    await clients.base({ locale, effect: (mount: () => () => void) => disposers.push(mount()), slots: { inject: () => {} } } as any)
  }
  onTestFinished(() => { for (const dispose of disposers) dispose() })
  if (withDictionary) await loadBase()
  await loadAccount()
  return { runtime, locale, loadBase, loadAccount, view: runtime.renderRoot() }
}

const account = { status: 'signedIn', balanceFreshness: 'current', lowBalance: false, email: 'test@example.test', gatewayBaseUrl: 'https://hkcode.aicodeme.xyz', models: [{ modelId: 'original-model-id' }, { modelId: 'second-model-id' }] }

it('uses the production slot and Base dictionaries across language changes and dictionary reload', async () => {
  const { locale, loadBase, loadAccount, view } = await setup(async () => ({ ok: true, value: account }), false)
  await waitFor(() => expect(view.container.textContent).toContain('account.connection.online'))
  await act(loadBase)
  await waitFor(() => expect(view.getByRole('status').textContent).toBe('在线'))
  expect(view.getByText('2 个模型')).toBeTruthy()
  expect(view.getByRole('button', { name: '管理账户与模型' })).toBeTruthy()
  expect(view.getByRole('button', { name: '访问 AI 平台' })).toBeTruthy()
  expect(view.getByText('hkcode.aicodeme.xyz')).toBeTruthy()
  act(() => locale.setLocale('en'))
  expect(view.getByRole('status').textContent).toBe('Online')
  expect(view.getByText('2 models')).toBeTruthy()
  expect(view.getByRole('button', { name: 'Manage account and models' })).toBeTruthy()
  act(() => locale.setLocale('zh'))
  await act(loadBase)
  expect(view.getByText('2 个模型')).toBeTruthy()
  await act(loadAccount)
  await waitFor(() => expect(view.getByRole('status').textContent).toBe('在线'))
  expect(view.container.textContent).not.toMatch(/account\./)
  expect(account.models[0]?.modelId).toBe('original-model-id')
})

// Release regression: execute the packed client factories rather than trusting
// source dictionaries or source-to-source mocks. Run after plugin:pack.
it.runIf(process.env.ZEROWALL_TEST_PACKED_CLIENTS === '1')('loads the published tgz factories through the real locale and card registration path', async () => {
  const feed = JSON.parse(await readFile(new NodeURL('../../../artifacts/release/plugins/plugin-packages.json', import.meta.url), 'utf8'))
  const require = createRequire(import.meta.url)
  async function client(name: string) {
    const record = feed.find((item: any) => item.id === `@zerowallscience/plugin-${name}`)
    expect(record).toBeDefined()
    let code = '', manifest = ''
    await tar.t({ file: record.path, onReadEntry(entry) {
      if (entry.path === 'package/lib/client.js') entry.on('data', chunk => { code += chunk })
      if (entry.path === 'package/package.json') entry.on('data', chunk => { manifest += chunk })
    } })
    const pkg = JSON.parse(manifest)
    if (name === 'account') expect(pkg.dependencies['@zerowallscience/plugin-base']).toBe('0.1.24')
    let factory!: (require: NodeRequire) => any
    runInNewContext(code, { window: { __ModuleLoader__: { load: (value: any) => { factory = value.factory } } }, document, console, setTimeout, clearTimeout, setInterval, clearInterval, URL, TextEncoder, TextDecoder, navigator })
    return factory(require)
  }
  const base = await client('base')
  const wrappedAccount = await client('account')
  let accountClient: any
  await wrappedAccount.apply({ remote: { $mount: async () => () => {} }, plugin: (value: any) => { accountClient = value } })
  expect(accountClient?.apply).toBeTypeOf('function')
  const { locale, view } = await setup(async () => ({ ok: true, value: account }), true, { base: base.apply, account: accountClient.apply })
  await waitFor(() => expect(view.getByRole('status').textContent).toBe('在线'))
  expect(view.getByText('2 个模型')).toBeTruthy()
  expect(view.getByRole('button', { name: '管理账户与模型' })).toBeTruthy()
  expect(view.getByRole('button', { name: '访问 AI 平台' })).toBeTruthy()
  act(() => locale.setLocale('en'))
  expect(view.getByText('2 models')).toBeTruthy()
  expect(view.getByRole('status').textContent).toBe('Online')
  expect(view.container.textContent).not.toMatch(/account\./)
})

it.each([
  ['signedOut', 'current', '未登录', 'Signed out'],
  ['authExpired', 'current', '登录已过期', 'Session expired'],
  ['signedIn', 'stale', '暂未连接', 'Disconnected'],
] as const)('translates %s with %s balance', async (status, balanceFreshness, zh, en) => {
  const { locale, view } = await setup(async () => ({ ok: true, value: { ...account, status, balanceFreshness } }))
  await waitFor(() => expect(view.getByRole('status').textContent).toBe(zh))
  act(() => locale.setLocale('en'))
  expect(view.getByRole('status').textContent).toBe(en)
  expect(view.container.textContent).not.toMatch(/account\./)
})

it('translates connection startup and Remote errors', async () => {
  let reject!: (error: Error) => void
  const { locale, view } = await setup(() => new Promise((_resolve, fail) => { reject = fail }))
  expect(view.getByRole('status').textContent).toBe('正在连接…')
  act(() => locale.setLocale('en'))
  expect(view.getByRole('status').textContent).toBe('Connecting…')
  await act(async () => reject(new Error('unavailable')))
  expect(view.getByRole('status').textContent).toBe('Disconnected')
  act(() => locale.setLocale('zh'))
  expect(view.getByRole('status').textContent).toBe('暂未连接')
})
