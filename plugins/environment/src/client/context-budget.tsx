import { useEffect, useRef, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { unwrapRemoteResult } from '@zerowallscience/plugin-base/client-helpers'
import css from './section.module.css'

type Props = PropsRuntime<'conversation.input.right'> & { environmentRemote: any; t: (key: string) => string }
const MIN = 32_000
const MAX = 1_000_000

export function ContextBudgetControl({ sessionId, locked, environmentRemote, t }: Props) {
  const [value, setValue] = useState(300_000)
  const savedValue = useRef(300_000)
  const [contextInfo, setContextInfo] = useState<{ contextWindow?: number; effectiveBudget?: number; pressureThreshold?: number; model?: string }>({})
  useEffect(() => {
    let cancelled = false
    if (environmentRemote?.getSessionContextBudget === undefined) return () => { cancelled = true }
    void environmentRemote.getSessionContextBudget(String(sessionId)).then((result: unknown) => {
      const next = unwrapRemoteResult('zerowall.environment.sessionContextBudget', result)
      if (!cancelled && Number.isSafeInteger(next) && next >= MIN && next <= MAX) {
        savedValue.current = next
        setValue(next)
      }
    }).catch(() => {})
    void environmentRemote.getSessionContextInfo?.(String(sessionId)).then((result: unknown) => {
      const next = unwrapRemoteResult('zerowall.environment.sessionContextInfo', result)
      if (!cancelled && next && typeof next === 'object') setContextInfo(next as typeof contextInfo)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [environmentRemote, sessionId])
  const save = (next: number) => {
    if (!Number.isSafeInteger(next) || next < MIN || next > MAX || next === savedValue.current) return
    savedValue.current = next
    void environmentRemote?.setSessionContextBudget?.(String(sessionId), next).catch(() => { savedValue.current = value })
  }
  const requested = `${Math.round(value / 1000)}k`
  const effective = contextInfo.effectiveBudget === undefined ? undefined : `${Math.round(contextInfo.effectiveBudget / 1000)}k`
  const window = contextInfo.contextWindow === undefined ? undefined : `${Math.round(contextInfo.contextWindow / 1000)}k`
  const threshold = contextInfo.pressureThreshold === undefined ? undefined : `${Math.round(contextInfo.pressureThreshold / 1000)}k`
  const title = [t('contextBudgetTitle'), `${t('contextBudgetRequested')}: ${requested}`, window ? `${t('contextModelWindow')}: ${window}` : undefined, effective ? `${t('contextBudgetEffective')}: ${effective}` : undefined, threshold ? `${t('contextCompactionThreshold')}: ${threshold}` : undefined].filter(Boolean).join(' · ')
  return <label className={css.sessionBudget} title={title}>
    <span aria-hidden>{effective ? `${requested}/${effective}` : requested}</span>
    <input type="range" min={MIN} max={MAX} step={4_000} value={value} disabled={locked} aria-label={t('contextBudgetTitle')} aria-valuetext={`${requested} ${t('contextBudgetRequested')}${window ? `, ${window} ${t('contextModelWindow')}` : ''}${effective ? `, ${effective} ${t('contextBudgetEffective')}` : ''}${threshold ? `, ${threshold} ${t('contextCompactionThreshold')}` : ''}`} onChange={event => setValue(Number(event.target.value))} onPointerUp={event => save(Number(event.currentTarget.value))} onKeyUp={event => save(Number(event.currentTarget.value))} onBlur={event => save(Number(event.currentTarget.value))} />
  </label>
}
