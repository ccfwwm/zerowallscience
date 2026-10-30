// @vitest-environment jsdom
import '../../../tests/support/native-dialog.js'
import { createElement, type ComponentType } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.js'
import { EnvironmentSection } from '../src/client/section.js'
import { en, NS, zh, type EnvironmentTranslate } from '../src/client/locales.js'
import { DEFAULTS, type PubmedStatus } from '../../pubmed/src/shared/types.js'

describe('environment settings client', () => {
  afterEach(cleanup)
  it.each([true, false])('renders base environment settings when optional domains are available=%s', async domainsAvailable => {
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
        getImageQuality: vi.fn().mockResolvedValue({ ok: true, value: 'xhigh' }),
        getContextBudget: vi.fn().mockResolvedValue({ ok: true, value: 300_000 }),
        setContextBudget: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
        readVariable: vi.fn().mockResolvedValue({ ok: true, value: 'private-test-value' }),
        deleteVariable: vi.fn().mockResolvedValue({ ok: true, value: [] }),
        listVariables: vi.fn().mockResolvedValue({ ok: true, value: [{ name: 'SCI_TOKEN', configured: true }] }),
        getImageModelSelection: vi.fn().mockResolvedValue({ ok: true, value: { providerId: 'reverse', groupId: '53', modelId: 'gpt-image-2.5' } }),
        setImageModelSelection: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
      },
      zerowallAccount: {
        discoverModels: vi.fn().mockResolvedValue({ ok: true, value: { status: 'signedIn', models: [{ providerId: 'reverse', groupId: '53', groupName: '生图分组-gpt逆向', modelId: 'gpt-image-2.5', capability: 'image-generation', qualities: ['low', 'medium', 'high', 'xhigh', 'max'] }, { providerId: 'az', groupId: '57', groupName: '生图分组-AZ-非常稳定', modelId: 'gpt-image-2.5', qualities: [] }], mediaModels: [{ providerId: 'media', groupId: '66', groupName: '图片音频视频分组', modelId: 'gpt-image-2.5-4k', profileId: 'media-profile', mediaType: 'image', qualities: [] }] } }),
        current: vi.fn().mockResolvedValue({ ok: true, value: { models: [{ providerId: 'cloud', modelId: 'claude-sonnet-5', name: 'Claude Sonnet 5', capability: 'chat' }, { providerId: 'reverse', groupId: '53', groupName: '生图分组-gpt逆向', modelId: 'gpt-image-2.5', capability: 'image-generation', qualities: ['low', 'medium', 'high', 'xhigh', 'max'] }], mediaModels: [{ providerId: 'media', groupId: '66', groupName: '图片音频视频分组', modelId: 'gpt-image-2.5-4k', profileId: 'media-profile', mediaType: 'image', qualities: [] }] } }),
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
      inject: vi.fn((names: string[], mount: (scope: unknown) => unknown) => {
        if (domainsAvailable && names.every(name => ctx.get(name))) mount(ctx)
        return { dispose: vi.fn() }
      }),
      remote: remotes,
      get: vi.fn((name: string) => name === 'connection'
        ? { api: { llm: { models: vi.fn().mockResolvedValue({ result: { ok: true, value: { groups: [{ id: 'cloud', models: [{ id: 'claude-sonnet-5', name: 'Claude Sonnet 5', reasoning: { efforts: [{ id: 'high', name: '高' }] } }] }], failures: [] } } }) } } }
        : remotes[name.replace('remote.', '') as keyof typeof remotes]),
      configForms: { get: vi.fn(() => reviewerScope) },
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
    const cachedSnapshot = await remotes.zerowallAccount.current()
    remotes.zerowallAccount.current.mockResolvedValue({ ...cachedSnapshot, value: { ...cachedSnapshot.value, status: 'signedIn' } } as any)
    remotes.zerowallAccount.current.mockClear()
    expect(Section).toBeDefined()
    expect(injected).toBeDefined()
    const props = { ...injected!(), t }
    const view = render(createElement(Section!, props))
    await waitFor(() => expect(remotes.zerowallEnvironment.listVariables).toHaveBeenCalled())
    expect(remotes.session.modelCatalog).not.toHaveBeenCalled()
    expect(reviewerScope.set).not.toHaveBeenCalled()
    expect(navLabel!()).toBe('环境配置')

    expect(screen.getByRole('heading', { name: '环境配置' })).toBeTruthy()
    const environmentSection = screen.getByRole('heading', { name: '环境配置' }).closest('section')!
    const serviceRows = [...environmentSection.querySelectorAll<HTMLElement>(':scope > div > details')]
      .filter(row => row.querySelector('summary h3')?.textContent !== '上下文预算')
    expect(serviceRows[0]?.querySelector('summary h3')?.textContent).toBe('rdatalinux rmcp')
    expect(serviceRows.every(row => !(row as HTMLDetailsElement).open)).toBe(true)
    const contextBudget = screen.getByRole('slider', { name: '上下文预算' }) as HTMLInputElement
    expect(contextBudget.value).toBe('300000')
    fireEvent.change(contextBudget, { target: { value: '316000' } })
    fireEvent.pointerUp(contextBudget)
    await waitFor(() => expect(remotes.zerowallEnvironment.setContextBudget).toHaveBeenCalledWith(316_000))
    const literature = screen.getByRole('heading', { name: '文献服务' }).closest('details') as HTMLDetailsElement
    expect(literature.querySelectorAll('details')).toHaveLength(6)
    fireEvent.click(literature.querySelector('summary')!)
    expect(literature.open).toBe(true)
    expect(screen.queryByText('Reviewer')).toBeNull()
    expect(screen.getByText('SciMaster')).toBeTruthy()
    expect(screen.getByText('生图模型')).toBeTruthy()
    expect(screen.getByText('自定义变量')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('SCI_TOKEN')).toBeTruthy())
    for (const service of ['remote.zerowallAccount', 'remote.zerowallMcp', 'remote.zerowallMineru', 'remote.zerowallPubmed']) expect(inject).not.toContain(service)
    if (!domainsAvailable) {
      expect(screen.getByPlaceholderText('变量名，例如 SCI_KEY')).toBeTruthy()
      expect(remotes.zerowallAccount.current).not.toHaveBeenCalled()
      expect(remotes.zerowallMcp.getSciMasterCredentialStatus).not.toHaveBeenCalled()
      return
    }
    expect(screen.getAllByRole('option', { name: '高' }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('option', { name: '中（推荐）' })).toBeTruthy()
    const imageModel = screen.getByLabelText('当前生图模型') as HTMLSelectElement
    const quality = screen.getByRole('combobox', { name: /^默认质量/u }) as HTMLSelectElement
    await waitFor(() => expect(imageModel.querySelectorAll('optgroup')).toHaveLength(3))
    expect([...imageModel.querySelectorAll('optgroup')].map(group => group.label)).toEqual(['生图分组-gpt逆向', '生图分组-AZ-非常稳定', '图片音频视频分组'])
    expect(remotes.zerowallAccount.discoverModels).toHaveBeenCalledOnce()
    expect(quality.value).toBe('xhigh')
    expect([...quality.options].map(option => option.value)).toEqual(['auto', 'low', 'medium', 'high', 'xhigh', 'max'])
    const reverseRoute = imageModel.value
    fireEvent.change(imageModel, { target: { value: [...imageModel.options].find(option => option.text === 'gpt-image-2.5-4k')!.value } })
    await waitFor(() => expect(remotes.zerowallEnvironment.setImageModelSelection).toHaveBeenCalled())
    expect([...quality.options].filter(option => !option.disabled).map(option => option.value)).toEqual(['auto', 'low', 'medium', 'high', 'xhigh', 'max'])
    expect(quality.value).toBe('xhigh')
    expect(quality.selectedOptions[0]!.disabled).toBe(false)
    expect(screen.queryByText(/不支持已保存的质量|未声明支持/u)).toBeNull()
    await waitFor(() => expect(imageModel.disabled).toBe(false))
    fireEvent.change(imageModel, { target: { value: reverseRoute } })
    await waitFor(() => expect([...quality.options].map(option => option.value)).toContain('max'))
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
    expect(remotes.zerowallEnvironment.deleteVariable).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '确认删除', exact: true }))
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
    expect(screen.getAllByText('Semantic Scholar').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Configured · Dedicated setting')).toBeTruthy()
    expect(screen.getByText('Anonymous queries available')).toBeTruthy()
    expect(screen.getByText('Connected')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save NCBI / PubMed key' })).toBeTruthy()
    expect((screen.getByLabelText('NCBI_API_KEY') as HTMLInputElement).value).toBe('unsaved-key')
    expect((screen.getByLabelText('NCBI contact email') as HTMLInputElement).value).toBe('draft@example.com')
    expect(screen.getByRole('option', { name: 'Medium (recommended)' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Get an API token and setup instructions/ }).getAttribute('href')).toBe('https://huagongshe.com/mcp-guide')
    expect(remotes.zerowallPubmed.getConfigStatus).toHaveBeenCalledTimes(2)
    language = 'zh'
    view.rerender(createElement(Section!, props))
    expect(navLabel!()).toBe('环境配置')
    expect(screen.getByRole('heading', { name: '文献服务' })).toBeTruthy()
    expect(screen.getByText('匿名查询可用')).toBeTruthy()
    expect((screen.getByLabelText('NCBI 联系邮箱') as HTMLInputElement).value).toBe('draft@example.com')
  })

  it('refreshes service status after shared edits and keeps the shared fallback after clearing a dedicated key', async () => {
    let configured = true
    const ok = (value: unknown) => Promise.resolve({ ok: true, value })
    const variables = () => configured ? [{ name: 'MINERU_API_TOKEN', configured }] : []
    const t: EnvironmentTranslate = (key, params = {}) => zh[key].replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''))
    const environmentRemote = {
      listVariables: vi.fn(() => ok(variables())),
      readVariable: vi.fn(() => ok('original value')),
      deleteVariable: vi.fn(() => { configured = false; return ok(variables()) }),
      setVariable: vi.fn(() => { configured = true; return ok(variables()) }),
      restoreOfficialDefaults: vi.fn(() => { configured = true; return ok(variables()) }),
    }
    const credential = () => ok({ configured })
    const mcpRemote = {
      getSciMasterCredentialStatus: vi.fn(credential), getHuagongsheCredentialStatus: vi.fn(credential),
      getRdatalinuxCredentialStatus: vi.fn(credential), clearRdatalinuxAuthorization: vi.fn(() => ok(undefined)),
    }
    const mineruRemote = { getConfigStatus: vi.fn(() => ok({ tokenConfigured: configured })) }
    const pubmedRemote = { getConfigStatus: vi.fn(() => ok({ config: DEFAULTS, keys: [{ name: 'NCBI_API_KEY', configured, source: 'variable' }] })) }
    const accountRemote = { current: vi.fn(() => ok({ status: 'signedOut' })) }
    render(createElement(EnvironmentSection, { environmentRemote, mcpRemote, mineruRemote, pubmedRemote, accountRemote,
      modelCatalog: vi.fn(), unwrap: async value => (await value).value, t } as any))
    const row = (title: string) => screen.getByRole('heading', { name: title, exact: true }).closest('details')!
    const summary = (title: string) => row(title).querySelector('summary')!
    await waitFor(() => expect(summary('MinerU 文档解析').textContent).toContain('Token 已配置'))
    fireEvent.click([...row('rdatalinux rmcp').querySelectorAll('button')].find(button => button.textContent === '清除')!)
    await waitFor(() => expect(mcpRemote.clearRdatalinuxAuthorization).toHaveBeenCalledOnce())
    await waitFor(() => expect(mcpRemote.getRdatalinuxCredentialStatus).toHaveBeenCalledTimes(2))
    expect(summary('rdatalinux rmcp').textContent).toContain('已配置')
    fireEvent.click([...row('自定义变量').querySelectorAll('button')].find(button => button.textContent === '删除')!)
    expect(environmentRemote.deleteVariable).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '取消', exact: true }))
    expect(environmentRemote.deleteVariable).not.toHaveBeenCalled()
    fireEvent.click([...row('自定义变量').querySelectorAll('button')].find(button => button.textContent === '删除')!)
    fireEvent.click(screen.getByRole('button', { name: '确认删除', exact: true }))
    await waitFor(() => expect(summary('MinerU 文档解析').textContent).toContain('未配置（失败）'))
    expect(summary('SciMaster').textContent).toContain('未配置（失败）')
    fireEvent.change(screen.getByPlaceholderText('变量名，例如 SCI_KEY'), { target: { value: 'MINERU_API_TOKEN' } })
    fireEvent.change(screen.getByPlaceholderText('变量值'), { target: { value: 'test value' } })
    fireEvent.click(screen.getByRole('button', { name: '添加变量', exact: true }))
    await waitFor(() => expect(summary('MinerU 文档解析').textContent).toContain('Token 已配置'))
    expect(summary('SciMaster').textContent).toContain('已配置')
    expect(accountRemote.current).toHaveBeenCalledOnce()
    expect(pubmedRemote.getConfigStatus).toHaveBeenCalledTimes(4)
    fireEvent.click(screen.getByRole('button', { name: '从七牛云同步', exact: true }))
    expect(environmentRemote.restoreOfficialDefaults).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '取消', exact: true }))
    expect(environmentRemote.restoreOfficialDefaults).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '从七牛云同步', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: '确认同步并覆盖', exact: true }))
    await waitFor(() => expect(environmentRemote.restoreOfficialDefaults).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    environmentRemote.readVariable = vi.fn(() => ok('original value'))
    fireEvent.click(screen.getByRole('button', { name: '修改', exact: true }))
    const editor = await screen.findByRole('dialog', { name: '修改' })
    fireEvent.change(within(editor).getByLabelText('变量值'), { target: { value: 'changed value' } })
    fireEvent.click(within(editor).getByRole('button', { name: '保存修改' }))
    await waitFor(() => expect(environmentRemote.setVariable).toHaveBeenLastCalledWith('MINERU_API_TOKEN', 'changed value'))
  })
})
