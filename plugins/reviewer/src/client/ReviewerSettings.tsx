import { useEffect, useState } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import css from './ReviewerSettings.module.css'

export interface ReviewerSettingsValue {
  autoReview: boolean
  modelMode: 'follow-session' | 'fixed'
  provider: string
  model: string
  reasoningEffort?: string
}

export interface ReviewerSettingsInjected {
  scope: SettingsScope<ReviewerSettingsValue>
  api: Pick<IApiClient, 'llm'>
}

export type ReviewerSettingsProps = PropsRuntime<'settings.general.item'> & PropsLocale<'zerowall'> & InjectFace<ReviewerSettingsInjected>

export function ReviewerSettings({ scope, api }: ReviewerSettingsProps) {
  const snapshot = scope.getSnapshot()
  const value = snapshot.value ?? { autoReview: false, modelMode: 'follow-session' as const, provider: '', model: '', reasoningEffort: '' }
  const [busy, setBusy] = useState(false)
  const [models, setModels] = useState<readonly { provider: string; id: string; name: string }[]>([])
  useEffect(() => {
    let active = true
    void api.llm.models({}).then(response => {
      if (!active || !response.result.ok) return
      const rows = response.result.value.groups.flatMap(group => group.models
        .filter(model => !/^(?:gpt-)?image(?:-|$)|imagegen|dall-e/iu.test(model.id))
        .map(model => ({ provider: group.id, id: model.id, name: model.name })))
      setModels(rows)
    }).catch(() => undefined)
    return () => { active = false }
  }, [api])
  const providers = [...new Set(models.map(model => model.provider))]
  const modelOptions = models.filter(model => model.provider === value.provider)
  useEffect(() => scope.subscribe(() => setBusy(false)), [scope])
  const update = async (field: string, next: unknown) => {
    setBusy(true)
    await scope.set(field, next)
  }
  return (
    <section className={css.card} aria-label="Reviewer settings">
      <label className={css.toggle}><input type="checkbox" checked={value.autoReview} disabled={!snapshot.writable || busy} onChange={event => void update('autoReview', event.target.checked)} /><span>Automatic review</span></label>
      <label><span>Model mode</span><select value={value.modelMode} disabled={!snapshot.writable || busy} onChange={event => void update('modelMode', event.target.value)}><option value="follow-session">Follow session</option><option value="fixed">Fixed model</option></select></label>
      {value.modelMode === 'fixed' ? <>
        <label><span>Provider</span><select value={value.provider} disabled={!snapshot.writable || busy} onChange={event => { void update('provider', event.target.value); void update('model', '') }}><option value="">Select a provider</option>{providers.map(provider => <option key={provider} value={provider}>{provider}</option>)}</select></label>
        <label><span>Model</span><select value={value.model} disabled={!snapshot.writable || busy || value.provider === ''} onChange={event => void update('model', event.target.value)}><option value="">Select a chat model</option>{modelOptions.map(model => <option key={model.id} value={model.id}>{model.name} ({model.id})</option>)}</select></label>
        <label><span>Reasoning effort</span><input value={value.reasoningEffort ?? ''} disabled={!snapshot.writable || busy} placeholder="Optional" onChange={event => void update('reasoningEffort', event.target.value)} /></label>
      </> : null}
      {snapshot.status === 'unavailable' ? <p className={css.note}>Reviewer settings are unavailable in this connection.</p> : null}
      {!snapshot.writable && snapshot.status !== 'unavailable' ? <p className={css.note}>Settings are read-only in this connection.</p> : null}
    </section>
  )
}
