// @vitest-environment jsdom
import { createElement, type ComponentType } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.js'

describe('environment settings client', () => {
  it('waits for Typert responses and renders every settings group', async () => {
    let Section: ComponentType<any> | undefined
    let injected: (() => Record<string, unknown>) | undefined
    const reviewerScope = {
      getSnapshot: () => ({ value: { autoReview: false, modelMode: 'fixed', provider: 'cloud', model: 'claude-sonnet-5', reasoningEffort: '' } }),
      subscribe: vi.fn(() => () => undefined),
      set: vi.fn().mockResolvedValue(undefined),
    }
    const remotes = {
      session: { modelCatalog: vi.fn().mockResolvedValue({ ok: true, value: { groups: [{ id: 'cloud', models: [{ id: 'claude-sonnet-5', name: 'Claude Sonnet 5', reasoning: { efforts: [{ id: 'high', name: '高' }] } }] }], failures: [] } }) },
      zerowallEnvironment: {
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
    }
    const ctx = {
      remote: remotes,
      get: vi.fn((name: string) => name === 'connection'
        ? { api: { llm: { models: vi.fn().mockResolvedValue({ result: { ok: true, value: { groups: [{ id: 'cloud', models: [{ id: 'claude-sonnet-5', name: 'Claude Sonnet 5', reasoning: { efforts: [{ id: 'high', name: '高' }] } }] }], failures: [] } } }) } } }
        : remotes[name.replace('remote.', '') as keyof typeof remotes]),
      settingsScope: { bind: vi.fn(() => reviewerScope) },
      effect: vi.fn((mount: () => unknown) => mount()),
      slots: {
        inject: vi.fn((_name: string, mount: () => unknown) => mount()),
        register: vi.fn((options: { inject: () => Record<string, unknown> }, component: ComponentType<any>) => {
          injected = options.inject
          Section = component
          return () => undefined
        }),
      },
    }

    apply(ctx as any)
    expect(Section).toBeDefined()
    expect(injected).toBeDefined()
    render(createElement(Section!, injected!()))

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
  })
})
