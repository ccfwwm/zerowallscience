// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BootPage } from '../src/boot-page.ts'

const pages: BootPage[] = []
afterEach(() => {
  for (const page of pages.splice(0)) page.dispose()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

function mount() {
  const el = document.createElement('div')
  document.body.append(el)
  const page = new BootPage(el)
  pages.push(page)
  return { el, page }
}

describe('BootPage', () => {
  it('draws the loading skeleton before any plugin state arrives', () => {
    const { el } = mount()
    expect(el.firstElementChild?.getAttribute('data-dsh-boot')).toBe('')
    expect(el.textContent).toContain('HARNESS')
    expect(el.textContent).toContain('Loading plugins…')
  })

  it('keeps loading while entries are active or loading', () => {
    const { el, page } = mount()
    page.setTotal(2)
    const spinner = el.querySelector<HTMLElement>('[data-dsh-boot-spinner]')
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('72deg')
    page.setState('a', 'active')
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('180deg')
    page.setState('b', 'loading')
    expect(el.querySelector('[data-dsh-boot-spinner]')).toBe(spinner)
    page.setState('b', 'active')
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('288deg')
    expect(el.textContent).toContain('Loading plugins…')
    expect(el.textContent).not.toContain('Failed to load plugins')
  })

  it('lists failed entries', () => {
    const { el, page } = mount()
    page.setState('@deepseek-ai/dsh-client-ui-layout', 'failed')
    page.setState('ok', 'active')
    page.setState('@deepseek-ai/dsh-client-ui-tool', 'failed')
    expect(el.textContent).toContain('@deepseek-ai/dsh-client-ui-layout')
    expect(el.textContent).toContain('@deepseek-ai/dsh-client-ui-tool')
    expect(el.textContent).not.toContain('ok')
    expect(el.textContent).not.toContain('Loading plugins…')
  })

  it('shows the complete sweep report', () => {
    const { el, page } = mount()
    const report = 'web boot: 1 entry did not activate\nx: pending (waiting for service: y)'
    page.fail(report)
    page.setState('a', 'active')
    expect(el.textContent).toContain(report)
    expect(el.textContent).not.toContain('Loading plugins…')
  })

  it('detaches on disposal', () => {
    const { el, page } = mount()
    page.dispose()
    expect(el.childNodes).toHaveLength(0)
  })

  it('shows actual plugin counts without claiming timed progress', () => {
    vi.useFakeTimers()
    const { el, page } = mount()
    const progress = el.querySelector('[role="progressbar"]')!
    expect(progress.hasAttribute('aria-valuenow')).toBe(false)
    vi.advanceTimersByTime(21_000)
    expect(el.querySelector('[data-dsh-boot-stage]')?.getAttribute('data-dsh-boot-stage')).toBe('services')
    expect(progress.hasAttribute('aria-valuenow')).toBe(false)
    expect(el.textContent).toContain('21s elapsed')
    expect(el.textContent).toContain('First launch or an update may take longer')
    page.setTotal(4)
    page.setStage('plugins')
    page.setState('one', 'active')
    page.setState('one', 'active')
    page.setState('two', 'loading')
    expect(progress.getAttribute('aria-valuenow')).toBe('1')
    expect(progress.getAttribute('aria-valuemax')).toBe('4')
    expect(el.textContent).toContain('1 / 4 plugins ready')
    expect(el.textContent).toContain('Step 3 of 4')
    page.setStage('interface')
    expect(el.textContent).toContain('Opening the workspace')
    expect(el.textContent).toContain('Step 4 of 4')
  })

  it.each(['stop', 'fail', 'dispose'] as const)('releases its elapsed timer on %s', (operation) => {
    vi.useFakeTimers()
    const { el, page } = mount()
    const elapsed = el.querySelector('[aria-live="off"]')!
    vi.advanceTimersByTime(3000)
    expect(elapsed.textContent).toBe('3s elapsed')
    if (operation === 'fail') page.fail('Unable to start services')
    else page[operation]()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(5000)
    expect(elapsed.textContent).toBe('3s elapsed')
  })

  it('renders localized startup progress before client locale plugins activate', () => {
    vi.useFakeTimers()
    const el = document.createElement('div')
    document.body.append(el)
    const page = new BootPage(el, { name: 'zerowallscience', locale: 'zh-CN' })
    pages.push(page)
    expect(el.textContent).toMatchInlineSnapshot('"zerowallscience连接模型、工具与知识，让科研工作有序展开正在准备科研工作空间正在启动工作区服务第 1 步，共 4 步已等待 0 秒首次启动或更新后可能需要更长时间，请保持窗口打开"')
    page.setStage('modules')
    expect(el.textContent).toContain('正在加载界面资源')
  })
})
