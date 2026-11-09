import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { useEffect, useRef, useState } from 'react'
import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { unwrapRemoteResult } from '@zerowall/dsh-plugin-environment/client-helpers'
import css from './section.module.css'

type ContextInfo = { contextWindow?: number; effectiveBudget?: number; pressureThreshold?: number; model?: string }
type Props = PropsRuntime<'conversation.input.right'> & PropsLocale<'zerowall.environment'> & {
  readBudget(sessionId: string): Promise<RemoteResult<number>>
  readInfo(sessionId: string): Promise<RemoteResult<ContextInfo>>
  saveBudget(sessionId: string, tokens: number): Promise<RemoteResult<void>>
}
const MIN = 32_000
const MAX = 1_000_000

export function ContextBudgetControl({ sessionId, readBudget, readInfo, saveBudget, t }: Props) {
  const [value, setValue] = useState(300_000)
  const savedValue = useRef(300_000)
  const [contextInfo, setContextInfo] = useState<ContextInfo>({})
  const [problem, setProblem] = useState<string>()
  const [busy, setBusy] = useState(true)
  const saving = useRef(false)
  const generation = useRef(0)
  useEffect(() => {
    ++generation.current
    let cancelled = false
    saving.current = false
    setBusy(true)
    setProblem(undefined)
    setContextInfo({})
    void readBudget(String(sessionId)).then(result => {
      const next = unwrapRemoteResult('zerowall.environment.sessionContextBudget', result)
      if (!cancelled && Number.isSafeInteger(next) && next >= MIN && next <= MAX) {
        savedValue.current = next
        setValue(next)
      }
    }).catch(() => { if (!cancelled) setProblem(t('contextBudgetLoadFailed')) })
      .finally(() => { if (!cancelled) setBusy(false) })
    void readInfo(String(sessionId)).then(result => {
      const next = unwrapRemoteResult('zerowall.environment.sessionContextInfo', result)
      if (!cancelled) setContextInfo(next)
    }).catch(() => { /* Model capacity is unavailable until the session has a selected model. */ })
    return () => { cancelled = true; ++generation.current }
  }, [readBudget, readInfo, sessionId, t])
  const save = (next: number) => {
    if (saving.current || !Number.isSafeInteger(next) || next < MIN || next > MAX || next === savedValue.current) return
    saving.current = true
    const epoch = generation.current
    setBusy(true)
    setProblem(undefined)
    void saveBudget(String(sessionId), next).then(result => {
      unwrapRemoteResult('zerowall.environment.saveSessionContextBudget', result)
      if (generation.current !== epoch) return
      savedValue.current = next
      setContextInfo({})
    }).catch(() => {
      if (generation.current !== epoch) return
      setValue(savedValue.current)
      setProblem(t('contextBudgetSaveFailed'))
    }).finally(() => { if (generation.current === epoch) { saving.current = false; setBusy(false) } })
  }
  const requested = `${Math.round(value / 1000)}k`
  const effective = contextInfo.effectiveBudget === undefined ? undefined : `${Math.round(contextInfo.effectiveBudget / 1000)}k`
  const window = contextInfo.contextWindow === undefined ? undefined : `${Math.round(contextInfo.contextWindow / 1000)}k`
  const threshold = contextInfo.pressureThreshold === undefined ? undefined : `${Math.round(contextInfo.pressureThreshold / 1000)}k`
  const title = [t('contextBudgetTitle'), `${t('contextBudgetRequested')}: ${requested}`, window ? `${t('contextModelWindow')}: ${window}` : undefined, effective ? `${t('contextBudgetEffective')}: ${effective}` : undefined, threshold ? `${t('contextCompactionThreshold')}: ${threshold}` : undefined].filter(Boolean).join(' · ')
  return <label className={css.sessionBudget} title={title}>
    <span aria-hidden>{effective ? `${requested}/${effective}` : requested}</span>
    <input type="range" min={MIN} max={MAX} step={4_000} value={value} disabled={busy} aria-label={t('contextBudgetTitle')} aria-valuetext={`${requested} ${t('contextBudgetRequested')}${window ? `, ${window} ${t('contextModelWindow')}` : ''}${effective ? `, ${effective} ${t('contextBudgetEffective')}` : ''}${threshold ? `, ${threshold} ${t('contextCompactionThreshold')}` : ''}`} onChange={event => setValue(Number(event.target.value))} onPointerUp={event => save(Number(event.currentTarget.value))} onKeyUp={event => save(Number(event.currentTarget.value))} onBlur={event => save(Number(event.currentTarget.value))} />
    {problem && <small role="alert">{problem}</small>}
  </label>
}
