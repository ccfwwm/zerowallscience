// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClaudeStatsPart, registerClaudeStats, cachePercent, compactTokens } from '../src/client/ClaudeStats.js'
import type { ClaudeMetrics } from '../src/shared/metrics.js'
import { zh, en } from '../src/client/locales.js'

afterEach(cleanup)
const translate = (dictionary: Record<string, string>) => (key: string, args?: Record<string, string | number>) =>
  (dictionary[key] ?? key).replace(/\{(\w+)\}/g, (match, name: string) => String(args?.[name] ?? match))
const t = translate(zh)
const metrics: ClaudeMetrics = { models: { model: { inputTokens: 100, outputTokens: 200, cacheReadTokens: 600, cacheWriteTokens: 300 } },
  usage: { inputTokens: 100, outputTokens: 200, cacheReadTokens: 600, cacheWriteTokens: 300 }, turns: 2, steps: 3, decodeTokens: 200, decodeMs: 2000, modelMs: 2500, incomplete: false,
  context: { model: 'model', usedTokens: 1200, contextWindow: 200000 } }

describe('Claude composer statistics', () => {
  it('shows detailed totals, model breakdown and closes the portaled detail with Escape', () => {
    render(<ClaudeStatsPart kind="usage" metrics={metrics} mode="detailed" t={t} />)
    const button = screen.getByRole('button', { name: '1.2K tok · 缓存命中 60%' })
    fireEvent.click(button)
    expect(screen.getByRole('dialog', { name: 'Claude Token 用量' }).textContent).toContain('总 Token1,200')
    expect(screen.getAllByText('输出（含思考）')).toHaveLength(2)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(button)
  })
  it('keeps compact readings static and follows Chinese/English changes', () => {
    const view = render(<><ClaudeStatsPart kind="usage" metrics={metrics} mode="compact" t={t} /><ClaudeStatsPart kind="activity" metrics={metrics} mode="compact" t={t} /></>)
    expect(screen.getByText('缓存命中 60%')).toBeTruthy()
    expect(screen.getByText('100 tok/s')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    view.rerender(<ClaudeStatsPart kind="usage" metrics={metrics} mode="compact" t={translate(en)} />)
    expect(screen.getByText('Cache hit 60%')).toBeTruthy()
  })
  it('shows the context ratio from only the recent request and can dismiss its detail outside', () => {
    render(<ClaudeStatsPart kind="context" metrics={metrics} mode="detailed" t={t} />)
    fireEvent.click(screen.getByRole('button', { name: '1%' }))
    expect(screen.getByRole('dialog', { name: '最近请求上下文' }).textContent).toContain('1,200 / 200,000')
    fireEvent.click(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('hides unknown or zero-denominator cache and absent context, preserving confirmed partial tokens', () => {
    const partial = { ...metrics, usage: { inputTokens: 12, outputTokens: 4 }, incomplete: true, context: null }
    const view = render(<ClaudeStatsPart kind="usage" metrics={partial} mode="detailed" t={t} />)
    fireEvent.click(screen.getByRole('button', { name: '16 tok（部分）' }))
    expect(screen.queryByText('总 Token')).toBeNull()
    expect(screen.getByText(zh.metricsScope + ' ' + zh.metricsIncomplete)).toBeTruthy()
    view.rerender(<><ClaudeStatsPart kind="usage" metrics={{ ...metrics, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } }} mode="compact" t={t} /><ClaudeStatsPart kind="context" metrics={partial} mode="detailed" t={t} /></>)
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('hides output speed without both actual output and valid timing', () => {
    render(<ClaudeStatsPart kind="activity" metrics={{ ...metrics, decodeMs: 0 }} mode="detailed" t={t} />)
    expect(screen.getByRole('button', { name: '2 轮 3 步' })).toBeTruthy()
    expect(screen.queryByText(/tok\/s/)).toBeNull()
  })
  it('preserves exact formatting at cache and unit boundaries', () => {
    expect(cachePercent(99999, 100000)).toBe('99.999')
    expect(cachePercent(0, 10)).toBe('0')
    expect(cachePercent(10, 10)).toBe('100')
    expect(compactTokens(1000000)).toBe('1M')
  })
  it('delegates standard sessions and unregisters all replacements with the Cordis scope', () => {
    let dispose: (() => void) | undefined
    const entries = ['activity', 'usage'].map(id => ({ options: { id }, component: () => <span>native {id}</span>, inject: () => ({ hooks: {} }), locale: 'native' }))
    const calls: Array<{ options: Record<string, unknown>; component: React.ComponentType<never>; dispose: ReturnType<typeof vi.fn> }> = []
    const unsubscribe = vi.fn()
    const ctx = { locale: { bind: () => t }, slots: {
      inject: (_name: string, callback: () => () => void) => { dispose = callback() }, entries: () => entries,
      subscribe: () => unsubscribe,
      register: (options: Record<string, unknown>, component: React.ComponentType<never>) => {
        const unregister = vi.fn(); calls.push({ options, component, dispose: unregister }); return unregister
      },
    } }
    registerClaudeStats(ctx as never)
    expect(calls.map(call => call.options.id)).toEqual(['activity', 'usage', 'zerowall-claude-context'])
    let preset = 'standard'
    const props = { useProjection: (key: string) => key === 'agentPreset' ? preset : key === 'zerowallClaudeMetrics' ? metrics : {}, usePerformanceUsage: (selector: (value: string) => string) => selector('detailed') }
    const Wrapper = calls[0]!.component as React.ComponentType<typeof props>
    const view = render(<Wrapper {...props} />)
    expect(screen.getByText('native activity')).toBeTruthy()
    preset = 'claude'; view.rerender(<Wrapper {...props} />)
    expect(screen.getByRole('button', { name: '2 轮 3 步 · 100 tok/s' })).toBeTruthy()
    preset = 'standard'; view.rerender(<Wrapper {...props} />)
    expect(screen.getByText('native activity')).toBeTruthy()
    dispose?.()
    expect(unsubscribe).toHaveBeenCalledOnce()
    for (const call of calls) expect(call.dispose).toHaveBeenCalledOnce()
  })
})
