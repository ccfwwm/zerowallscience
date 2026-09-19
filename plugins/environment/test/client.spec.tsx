// @vitest-environment jsdom
import '../../../tests/support/native-dialog.js'
import { createElement, type ComponentType } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.js'
import { en, NS, zh, type EnvironmentTranslate } from '../src/client/locales.js'
import { DEFAULTS, type PubmedStatus } from '../../pubmed/src/shared/types.js'

describe('environment settings client', () => {
  afterEach(cleanup)
  it('waits for Typert responses and renders every settings group', async () => {
    let Section: ComponentType<any> | undefined
    let injected: (() => Record<string, unknown>) | undefined
    let navLabel: (() => string) | undefined
    let language: 'zh' | 'en' = 'zh'
    const t: EnvironmentTranslate = (key, params = {}) => (language === 'zh' ? zh : en)[key].replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''))
    const literatureStatus: PubmedStatus = { config: { ...DEFAULTS }, keys: [{ name: 'NCBI_API_KEY', configured: true, source: 'dedicated' }], } as PubmedStatus
    const reviewerScope = {
      getSnapshot: () => ({ value: { autoReview: false, modelMode: 'fixed', provider: 'cloud', model: 'claude-sonnet-5', reasoningEffort: '' } }),
      subscribe: vi.fn(() => () => undefined),
      set: vi.fn().mockResolvedValue(undefined),
    }
    const remotes = {
      session: { modelCatalog: vi.fn().mockResolvedValue({ ok: true, value: { groups: [{ id: 'cloud', models: [{ id: 'claude-sonnet-5', name: 'Claude Sonnet 5', reasoning: { efforts: [{ id: 'high', name: '高' }] } }] }], failures: [] } }) },
      zerowallEnvironment: {
        readVariable: vi.fn().mockResolvedValue({ ok: true, value: 'private-test-value' }),
        deleteVariable: vi.fn().mockResolvedValue({ ok: true, value: [] }),
        listVariables: vi.fn().mockResolvedValue({ ok: true, value: [{ name: 'SCI_TOKEN', configured: true }] }),
        getImageModelSelection: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
      },
      zerowallAccount: {
        current: vi.fn().mockResolvedValue({ ok: true, value: { models: [{ providerId: 'cloud', modelId: 'claude-sonnet-5', name: 'Claude Sonnet 5', capability: 'chat' }] } }),
      },
      zerowallMcp: {
        getSciMasterCredentialStatus: vi.fn().mockResolvedValue({ ok: true, value: { configured: true } }),
        getHuagongsheCredentialStatus: vi.fn().mockResolvedValue({ ok: true, value: { configured: false } }),
        setHuagongsheApiKey: vi.fn().mockResolvedValue({ ok: true, value: { runtimeState: 'active' } }),
      },
      zerowallPubmed: {
        getConfigStatus: vi.fn().mockResolvedValue({ ok: true, value: literatureStatus }),
        testConnection: vi.fn().mockResolvedValue({ ok: true, value: { state: 'anonymous' } }),
      },
    }
    const ctx = {
      remote: remotes,
      get: vi.fn((name: string) => name === 'connection'
        ? { api: { llm: { models: vi.fn().mockResolvedValue({ result: { ok: true, value: { groups: [{ id: 'cloud', models: [{ id: 'claude-sonnet-5', name: 'Claude Sonnet 5', reasoning: { efforts: [{ id: 'high', name: '高' }] } }] }], failures: [] } } }) } } }
        : remotes[name.replace('remote.', '') as keyof typeof remotes]),
      settingsScope: { bind: vi.fn(() => reviewerScope) },
      locale: { register: vi.fn(() => () => undefined), bind: vi.fn(() => t) },
      effect: vi.fn((mount: () => unknown) => mount()),
      slots: {
        inject: vi.fn((_name: string, mount: () => unknown) => mount()),
        register: vi.fn((options: { inject: () => Record<string, unknown>; label: () => string; locale: string }, component: ComponentType<any>) => {
          injected = options.inject
          Section = component
          navLabel = options.label
          expect(options.locale).toBe(NS)
          return () => undefined
        }),
      },
    }

    apply(ctx as any)
    expect(Section).toBeDefined()
    expect(injected).toBeDefined()
    const props = { ...injected!(), t }
    const view = render(createElement(Section!, props))
    expect(navLabel!()).toBe('环境配置')

    expect(screen.getByRole('heading', { name: '环境配置' })).toBeTruthy()
    expect(screen.getByText('Reviewer')).toBeTruthy()
    expect(screen.getByText('SciMaster')).toBeTruthy()
    expect(screen.getByText('生图模型')).toBeTruthy()
    expect(screen.getByText('自定义变量')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('SCI_TOKEN')).toBeTruthy())
    expect(screen.getAllByRole('option', { name: '高' }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('option', { name: '中（推荐）' })).toBeTruthy()
    expect(screen.queryByText('科研 MCP 能力')).toBeNull()
    expect(screen.getByRole('link', { name: /获取 API Token 与接入说明/ }).getAttribute('href')).toBe('https://huagongshe.com/mcp-guide')
    const token = screen.getByLabelText('化工社 API Token')
    fireEvent.change(token, { target: { value: 'test-token' } })
    fireEvent.click(token.parentElement!.querySelector('button')!)
    await waitFor(() => expect(remotes.zerowallMcp.setHuagongsheApiKey).toHaveBeenCalledWith('test-token'))
    await waitFor(() => expect((token as HTMLInputElement).value).toBe(''))

    fireEvent.click(screen.getByRole('button', { name: '查看并复制' }))
    await screen.findByRole('dialog', { name: 'SCI_TOKEN' })
    const secret = screen.getByLabelText('变量值') as HTMLInputElement
    expect(secret.type).toBe('password')
    expect(secret.value).toBe('private-test-value')
    fireEvent.click(screen.getByRole('button', { name: '显示值' }))
    expect(secret.type).toBe('text')
    fireEvent.click(screen.getByRole('button', { name: '隐藏值' }))
    expect(secret.type).toBe('password')
    const clipboard = vi.fn().mockResolvedValue(undefined)
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboard } })
    try {
      fireEvent.click(screen.getByRole('button', { name: '复制值' }))
      await screen.findByText('已复制')
      expect(clipboard).toHaveBeenCalledWith('private-test-value')
      clipboard.mockRejectedValueOnce(new Error('denied'))
      fireEvent.click(screen.getByRole('button', { name: '复制值' }))
      await screen.findByText('无法访问剪贴板，请重试或显示后手动复制。')
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.queryByRole('dialog', { name: 'SCI_TOKEN' })).toBeNull()
    } finally {
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
      else Reflect.deleteProperty(navigator, 'clipboard')
    }
    fireEvent.click(screen.getByRole('button', { name: '删除', exact: true }))
    await waitFor(() => expect(remotes.zerowallEnvironment.deleteVariable).toHaveBeenCalledWith('SCI_TOKEN'))
    await waitFor(() => expect(screen.queryByText('SCI_TOKEN')).toBeNull())

    // Switch the existing page in both directions without remounting or refetching.
    fireEvent.change(screen.getByLabelText('NCBI_API_KEY'), { target: { value: 'unsaved-key' } })
    fireEvent.change(screen.getByLabelText('NCBI 联系邮箱'), { target: { value: 'draft@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '检测 NCBI / PubMed' }))
    await waitFor(() => expect(screen.getByText('匿名查询可用')).toBeTruthy())
    language = 'en'
    view.rerender(createElement(Section!, props))
    expect(navLabel!()).toBe('Environment')
    expect(screen.getByRole('heading', { name: 'Environment', exact: true })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Literature services' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Configuration status' })).toBeTruthy()
    expect(screen.getByText('Configured · Dedicated setting')).toBeTruthy()
    expect(screen.getByText('Anonymous queries available')).toBeTruthy()
    expect(screen.getByText('Connected')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save NCBI / PubMed key' })).toBeTruthy()
    expect((screen.getByLabelText('NCBI_API_KEY') as HTMLInputElement).value).toBe('unsaved-key')
    expect((screen.getByLabelText('NCBI contact email') as HTMLInputElement).value).toBe('draft@example.com')
    expect(screen.getByRole('option', { name: 'Medium (recommended)' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Get an API token and setup instructions/ }).getAttribute('href')).toBe('https://huagongshe.com/mcp-guide')
    expect(remotes.zerowallPubmed.getConfigStatus).toHaveBeenCalledTimes(1)
    language = 'zh'
    view.rerender(createElement(Section!, props))
    expect(navLabel!()).toBe('环境配置')
    expect(screen.getByRole('heading', { name: '文献服务' })).toBeTruthy()
    expect(screen.getByText('匿名查询可用')).toBeTruthy()
    expect((screen.getByLabelText('NCBI 联系邮箱') as HTMLInputElement).value).toBe('draft@example.com')
  })
})
