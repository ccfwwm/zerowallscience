import { createElement, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Context } from '@deepseek-ai/cordis'
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
import { IconDatabaseOutlineRegular, IconGaugeOutlineRegular, useAnchoredPosition, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
import { inputTotal, tokenKeys, tokenTotal, type ClaudeMetrics } from '../shared/metrics.js'
import { CLAUDE_NS, type zh } from './locales.js'
import css from './ClaudeStats.module.css'

type Translate = (key: keyof typeof zh, args?: Record<string, string | number>) => string
type Kind = 'activity' | 'usage' | 'context'
interface StatsProps {
  useProjection: UseProjection
  usePerformanceUsage: <T>(select: (value: 'compact' | 'detailed') => T) => T
  t: Translate
}
export const compactTokens = (value: number): string => value < 1_000 ? String(value)
  : value < 1_000_000 ? `${Number((value / 1_000).toFixed(1))}K` : `${Number((value / 1_000_000).toFixed(1))}M`
export function cachePercent(read: number, input: number): string {
  const ratio = read / input * 100
  if (read === input) return '100'
  // A partial cache hit must never be advertised as a full hit.
  for (let digits = 0; digits <= 12; digits++) if (Number(ratio.toFixed(digits)) < 100) return String(Number(ratio.toFixed(digits)))
  return '<100'
}

function StatDialog({ kind, label, title, icon, children }: { kind: Kind; label: string; title: string; icon: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLSpanElement | null>(null), panelRef = useRef<HTMLDivElement | null>(null)
  const position = useAnchoredPosition({ open, anchorRef, panelRef, side: 'top', gap: 8, margin: 12 })
  useDismissOnOutsidePointer(anchorRef, open, setOpen, panelRef)
  useEffect(() => {
    if (!open) return
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); anchorRef.current?.querySelector('button')?.focus() } }
    const click = (event: MouseEvent) => { if (event.target instanceof Node && !anchorRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('keydown', key); document.addEventListener('click', click, true)
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('click', click, true) }
  }, [open])
  return <span ref={anchorRef} className={css.anchor} data-composer-stat={kind} data-claude-stat={kind}>
    <button type="button" className={css.pill} aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>{icon}<span>{label}</span></button>
    {open && createPortal(<div ref={panelRef} role="dialog" aria-label={title} className={css.panel} style={position ?? { visibility: 'hidden', left: 0, top: 0 }}>
      <div className={css.title}>{icon}{title}</div>{children}
    </div>, document.body)}
  </span>
}
function Ring({ percent }: { percent: number }) {
  return <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><circle cx="7" cy="7" r="5.5" className={css.track} /><circle cx="7" cy="7" r="5.5" className={css.fill} strokeDasharray={`${Math.min(100, percent) / 100 * 34.558} 34.558`} transform="rotate(-90 7 7)" /></svg>
}
function PlainStat({ kind, label, icon }: { kind: Kind; label: string; icon: ReactNode }) {
  return <span className={css.anchor} data-composer-stat={kind} data-claude-stat={kind}><span className={css.pill}>{icon}<span>{label}</span></span></span>
}
export function ClaudeStatsPart({ kind, metrics, mode, toolMs = 0, t }: { kind: Kind; metrics: ClaudeMetrics | undefined; mode: 'compact' | 'detailed'; toolMs?: number; t: Translate }) {
  if (!metrics) return null
  const speed = metrics.decodeMs > 0 ? `${Number((metrics.decodeTokens / metrics.decodeMs * 1000).toFixed(1))} tok/s` : undefined
  const duration = (ms: number) => t('metricsSeconds', { value: Number((ms / 1000).toFixed(1)) })
  const exact = (n: number) => n.toLocaleString()
  const row = (label: string, value: string) => <><dt>{label}</dt><dd>{value}</dd></>
  if (kind === 'activity') {
    const icon = <IconGaugeOutlineRegular />
    const label = [mode === 'detailed' && metrics.turns > 0 ? t('metricsCounts', { turns: metrics.turns, steps: metrics.steps }) : undefined, speed].filter(Boolean).join(' · ')
    if (!label) return null
    if (mode === 'compact') return speed ? <PlainStat kind={kind} label={speed} icon={icon} /> : null
    return <StatDialog kind={kind} label={label} title={t('metricsActivity')} icon={icon}><dl className={css.details}>
      {metrics.modelMs > 0 && row(t('metricsModelTime'), duration(metrics.modelMs))}
      {toolMs > 0 && row(t('metricsToolTime'), duration(toolMs))}
      {speed && row(t('metricsSpeed'), speed)}
    </dl>{metrics.incomplete && <p className={css.note}>{t('metricsIncomplete')}</p>}</StatDialog>
  }
  if (kind === 'usage') {
    const total = tokenTotal(metrics.usage), input = inputTotal(metrics.usage)
    const cache = input !== undefined && input > 0 && metrics.usage.cacheReadTokens !== undefined ? t('metricsCache', { percent: cachePercent(metrics.usage.cacheReadTokens, input) }) : undefined
    const confirmed = tokenKeys.reduce((sum, key) => sum + (metrics.usage[key] ?? 0), 0)
    const tokens = total !== undefined ? total > 0 ? `${compactTokens(total)} tok` : undefined
      : confirmed > 0 ? t('metricsConfirmed', { value: compactTokens(confirmed) }) : undefined
    const label = [mode === 'detailed' ? tokens : undefined, cache].filter(Boolean).join(' · ')
    if (!label) return null
    const icon = <IconDatabaseOutlineRegular />
    if (mode === 'compact') return cache ? <PlainStat kind={kind} label={cache} icon={icon} /> : null
    return <StatDialog kind={kind} label={label} title={t('metricsUsage')} icon={icon}>
      <dl className={css.details}>
        {total !== undefined && row(t('metricsTotal'), exact(total))}
        {metrics.usage.inputTokens !== undefined && row(t('metricsInput'), exact(metrics.usage.inputTokens))}
        {metrics.usage.outputTokens !== undefined && row(t('metricsOutput'), exact(metrics.usage.outputTokens))}
        {metrics.usage.cacheReadTokens !== undefined && row(t('metricsCacheRead'), exact(metrics.usage.cacheReadTokens))}
        {metrics.usage.cacheWriteTokens !== undefined && row(t('metricsCacheWrite'), exact(metrics.usage.cacheWriteTokens))}
      </dl>
      {Object.entries(metrics.models).map(([model, usage]) => <section key={model} className={css.model}>
        <div>{model}</div><dl className={css.details}>
          {usage.inputTokens !== undefined && row(t('metricsInput'), exact(usage.inputTokens))}
          {usage.outputTokens !== undefined && row(t('metricsOutput'), exact(usage.outputTokens))}
          {usage.cacheReadTokens !== undefined && row(t('metricsCacheRead'), exact(usage.cacheReadTokens))}
          {usage.cacheWriteTokens !== undefined && row(t('metricsCacheWrite'), exact(usage.cacheWriteTokens))}
        </dl>
      </section>)}
      <p className={css.note}>{t('metricsScope')}{metrics.incomplete ? ` ${t('metricsIncomplete')}` : ''}</p>
    </StatDialog>
  }
  const context = metrics.context
  if (!context) return null
  const percent = Math.round(context.usedTokens / context.contextWindow * 100)
  return <StatDialog kind={kind} label={`${percent}%`} title={t('metricsContext')} icon={<Ring percent={percent} />}>
    <dl className={css.details}>{row(t('metricsModel'), context.model)}{row(t('metricsContextTokens'), `${exact(context.usedTokens)} / ${exact(context.contextWindow)}`)}</dl>
  </StatDialog>
}

/** Shadow individual pills through the public slot contract; never mutate DSH components. */
export function registerClaudeStats(ctx: Context): void {
  ctx.slots.inject('conversation.composer.dock', () => {
    let stopped = false
    const installed = new Map<string, { base: unknown; dispose: () => void }>()
    const reconcile = () => {
      if (stopped) return
      const entries = ctx.slots.entries('conversation.composer.dock')
      for (const kind of ['activity', 'usage', 'context'] as const) {
        const base = entries.find(entry => entry.options.id === (kind === 'context' ? 'activity' : kind) && (entry.options.priority ?? 0) === 0)
        if (!base) { installed.get(kind)?.dispose(); installed.delete(kind); continue }
        if (installed.get(kind)?.base === base) continue
        installed.get(kind)?.dispose()
        const Native = base.component as ComponentType<StatsProps>
        const Wrapper = (props: StatsProps) => {
          const preset = props.useProjection('agentPreset')
          const metrics = props.useProjection('zerowallClaudeMetrics')
          const mode = props.usePerformanceUsage(value => value)
          const stats = (props.useProjection as (key: string) => { toolMs?: number } | undefined)('sessionStats')
          if (preset !== 'claude') return kind === 'context' ? null : createElement(Native, props)
          return <ClaudeStatsPart kind={kind} metrics={metrics} mode={mode} toolMs={stats?.toolMs} t={ctx.locale.bind(CLAUDE_NS)} />
        }
        // Retain the native locale and injected preference source for the standard-mode delegate.
        const dispose = ctx.slots.register({ name: 'conversation.composer.dock', id: kind === 'context' ? 'zerowall-claude-context' : kind,
          priority: -20, order: kind === 'activity' ? 0 : kind === 'usage' ? 1 : 2, locale: base.locale,
          inject: base.inject as never,
        }, Wrapper as never)
        installed.set(kind, { base, dispose })
      }
    }
    const unsubscribe = ctx.slots.subscribe('conversation.composer.dock', () => queueMicrotask(reconcile))
    reconcile()
    return () => { stopped = true; unsubscribe(); for (const item of installed.values()) item.dispose() }
  })
}
