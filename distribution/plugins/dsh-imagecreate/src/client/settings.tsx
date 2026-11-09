/** Image-owned settings, with explicit saves that protect user choices from account sync. */
import { useEffect, useRef, useState } from 'react'
import { Button, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { AiCloudManagedModel } from '@zerowall/dsh-plugin-ai-cloud/account-types'
import type { ImageGenerationQuality, ImageModelSelection, ImageSettingsView } from '../shared/types.js'
import { NS } from './settings-locales.js'
import css from './settings.module.css'

export interface ImageSettingsFace {
  load(): Promise<{ settings: ImageSettingsView; models: AiCloudManagedModel[] }>
  refresh(): Promise<void>
  save(input: { selection?: ImageModelSelection; quality: string }): Promise<ImageSettingsView>
  notify(success: boolean): void
}
type Props = InjectFace<ImageSettingsFace> & PropsLocale<typeof NS> & { view?: string }
const identity = (model: ImageModelSelection | AiCloudManagedModel) => JSON.stringify([model.providerId, model.groupId, model.modelId, 'profileId' in model ? model.profileId ?? '' : ''])

/** Render the plugin's own model and protocol parameters without environment service controls. */
export function ImageSettingsPanel({ load, refresh, save, notify, t, view }: Props) {
  const [settings, setSettings] = useState<ImageSettingsView>()
  const [selection, setSelection] = useState<ImageModelSelection>()
  const [quality, setQuality] = useState<ImageGenerationQuality>('medium')
  const [models, setModels] = useState<AiCloudManagedModel[]>([])
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const dirty = useRef(false)
  const revision = useRef(0)
  const editSelection = (next: ImageModelSelection | undefined) => { dirty.current = true; revision.current++; setSelection(next) }
  useEffect(() => {
    let active = true
    let loading = false
    const read = async () => {
      if (loading) return
      loading = true
      const started = revision.current
      try {
        const value = await load()
        if (active && started === revision.current) {
          setSettings(value.settings); setModels(value.models)
          if (!dirty.current) { setSelection(value.settings.selection); setQuality(value.settings.quality) }
        }
      } catch { if (active) setFailed(true) }
      finally { loading = false }
    }
    void read()
    const timer = setInterval(() => { void read() }, 3000)
    return () => { active = false; clearInterval(timer) }
  }, [load])
  if (view !== undefined && view !== 'page') return null
  const selected = models.find(model => selection && identity(model) === identity(selection))
  const savedTier = selection?.imageSize || ({ '512': '512', '1024': '1K', '2048': '2K', '4096': '4K' } as Record<string, string>)[selection?.resolution ?? ''] || ''
  const resolutions = selected?.resolutions ?? []
  const groups = [...new Set(models.map(model => model.groupId))]
  const operation = async (action: () => Promise<void>, feedback: boolean) => {
    setBusy(true); setFailed(false)
    try { await action(); if (feedback) notify(true) } catch { setFailed(true); if (feedback) notify(false) } finally { setBusy(false) }
  }
  return <section className={css.root} aria-label={t('title')} aria-busy={busy}>
    <h2>{t('title')}</h2><p>{t('description')}</p>
    {settings && <p role="status">{t(settings.origin === 'user' ? 'userChoice' : settings.availability === 'ready' ? 'automatic' : 'pending')}</p>}
    {settings && settings.availability !== 'ready' && settings.availability !== 'pending' && <p>{t(settings.availability === 'signed-out' ? 'signedOut' : settings.availability)}</p>}
    {failed && <p role="alert">{t('failed')}</p>}
    <label>{t('model')}<select value={selection ? identity(selection) : ''} disabled={busy || !settings} onChange={event => {
      const model = models.find(row => identity(row) === event.target.value)
      editSelection(model ? { providerId: model.providerId, groupId: model.groupId, modelId: model.modelId, ...('profileId' in model && typeof model.profileId === 'string' ? { profileId: model.profileId } : {}) } : undefined)
    }}>
      <option value="">{t('choose')}</option>
      {selection && !selected && <option value={identity(selection)} disabled>{selection.modelId} · {t('unavailable')}</option>}
      {groups.map(group => <optgroup key={group} label={models.find(model => model.groupId === group)!.groupName}>{models.filter(model => model.groupId === group).map(model => <option key={identity(model)} value={identity(model)} disabled={model.stale}>{model.modelId}{'profileId' in model ? ` · ${String(model.profileId)}` : ''}</option>)}</optgroup>)}
    </select></label>
    {selected && <p>{t('protocol')}: {selected.imageProtocol === 'gemini' ? 'Gemini generateContent' : 'OpenAI Images'}</p>}
    {selection && (selected?.imageProtocol === 'gemini' ? <label>{t('imageSize')}<select value={savedTier} disabled={busy} onChange={event => editSelection({ ...selection, imageSize: event.target.value, resolution: '' })}>
      <option value="">{t('default')}</option>{(selected.imageSizes?.length ? selected.imageSizes : ['512', '1K', '2K', '4K']).map(size => <option key={size}>{size}</option>)}
    </select></label> : <label>{t('resolution')}<select value={selection.resolution ?? ''} disabled={busy} onChange={event => editSelection({ ...selection, resolution: event.target.value })}><option value="">{t('default')}</option>{resolutions.map(size => <option key={size}>{size}</option>)}</select></label>)}
    {selection && <label>{t('aspectRatio')}<select value={selection.aspectRatio ?? ''} disabled={busy} onChange={event => editSelection({ ...selection, aspectRatio: event.target.value })}><option value="">{t('default')}</option>{selected?.aspectRatios?.map(size => <option key={size}>{size}</option>)}</select></label>}
    {selected?.imageProtocol === 'gemini' ? <p>{t('geminiQuality')}</p> : <label>{t('quality')}<select value={quality} disabled={busy || !settings} onChange={event => { dirty.current = true; revision.current++; setQuality(event.target.value as ImageGenerationQuality) }}>{(['auto', 'low', 'medium', 'high', 'xhigh', 'max'] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>}
    <div className={css.actions}>
      <Button disabled={busy} onClick={() => { void operation(async () => { await refresh(); const value = await load(); setModels(value.models); setSettings(value.settings); if (!dirty.current) { setSelection(value.settings.selection); setQuality(value.settings.quality) } }, false) }}>{t('refresh')}</Button>
      <Button disabled={busy || !settings || !selection} onClick={() => { void operation(async () => { const next = await save({ selection, quality }); revision.current++; dirty.current = false; setSettings(next); setSelection(next.selection); setQuality(next.quality) }, true) }}>{t('save')}</Button>
    </div>
  </section>
}

/** Feedback remains mounted when a configuration detail closes. */
export function ImageSettingsFeedback({ subscribe, snapshot, clear, t }: PropsLocale<typeof NS> & { subscribe(listener: () => void): () => void; snapshot(): boolean | undefined; clear(): void }) {
  const [value, setValue] = useState(snapshot)
  useEffect(() => subscribe(() => setValue(snapshot())), [subscribe, snapshot])
  return value === undefined ? null : <Toast text={t(value ? 'saved' : 'failed')} onDone={clear} {...value ? { tone: 'success' as const } : {}} />
}
