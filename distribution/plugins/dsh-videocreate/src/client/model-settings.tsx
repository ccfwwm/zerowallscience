/** Profile-wide media defaults; opening the page never changes the saved selection. */
import { useEffect, useState } from 'react'
import type { AiCloudMediaModel } from '@zerowall/dsh-plugin-ai-cloud/account-types'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import styles from './media.css?inline'

export const NS = 'zerowall.videoSettings'
export const en = { title: 'Media model settings', video: 'Video', music: 'Music', model: 'Model', automatic: 'Automatic selection', parameters: 'Model parameters (JSON)', loading: 'Loading settings…', loadFailed: 'Could not load media settings. Sign in to AI Cloud and retry.', invalid: 'Parameters must be a JSON object.', save: 'Save settings', saved: 'Saved. New tasks use these settings immediately.', saveFailed: 'Could not save settings. Retry.', retry: 'Retry', unavailable: 'Saved model unavailable' }
export const zh: typeof en = { title: '媒体模型配置', video: '视频', music: '音乐', model: '模型', automatic: '自动选择', parameters: '模型参数（JSON）', loading: '正在加载配置…', loadFailed: '无法加载媒体配置，请登录 AI 云平台后重试。', invalid: '参数必须是 JSON 对象。', save: '保存配置', saved: '已保存，新任务立即使用这些配置。', saveFailed: '配置保存失败，请重试。', retry: '重试', unavailable: '已保存的模型不可用' }
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'zerowall.videoSettings': keyof typeof en } }
export type MediaChoices = Record<string, { selection: { groupId: string; modelId: string; profileId: string; operation: string }; parameters: { size?: string; quality?: string; resolution?: string; aspect_ratio?: string; duration?: number } }>
export interface MediaSettingsApi { load(): Promise<{ models: AiCloudMediaModel[]; choices: MediaChoices }>; save(choices: MediaChoices): Promise<void> }
const identity = (model: { groupId: string; modelId: string; profileId: string }) => JSON.stringify([model.groupId, model.modelId, model.profileId])
const kinds = ['video', 'music'] as const
/** Edit defaults without creating a Session or submitting a generation request. */
export function MediaModelSettings({ api, t }: { api: MediaSettingsApi; t: Translate<keyof typeof en> }) {
  const [revision, retry] = useState(0)
  const [data, setData] = useState<{ models: AiCloudMediaModel[]; choices: MediaChoices }>()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<'loading' | 'ready' | 'loadFailed' | 'saved' | 'invalid' | 'saveFailed'>('loading')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let disposed = false
    setStatus('loading')
    void api.load().then(value => { if (disposed) return; setData(value); setDrafts(Object.fromEntries(kinds.map(kind => [kind, JSON.stringify(value.choices[kind]?.parameters ?? {}, null, 2)]))); setStatus('ready') }, () => { if (!disposed) setStatus('loadFailed') })
    return () => { disposed = true }
  }, [api, revision])
  const save = async () => {
    if (!data || busy) return
    const choices = { ...data.choices }
    try {
      for (const kind of kinds) {
        const value: unknown = JSON.parse(drafts[kind] ?? '{}')
        if (value === null || Array.isArray(value) || typeof value !== 'object') throw new Error('invalid')
        if (choices[kind]) choices[kind] = { ...choices[kind], parameters: value }
      }
    } catch { setStatus('invalid'); return }
    setBusy(true)
    try { await api.save(choices); setStatus('saved') } catch { setStatus('saveFailed') } finally { setBusy(false) }
  }
  if (status === 'loading') return <p role="status">{t('loading')}</p>
  if (status === 'loadFailed') return <div><p role="alert">{t('loadFailed')}</p><button onClick={() => retry(value => value + 1)}>{t('retry')}</button></div>
  return <section className="media-studio media-section"><style>{styles}</style><h3>{t('title')}</h3>{data && kinds.map(kind => {
    const operation = kind === 'video' ? 'video' : 'chat_music'
    const available = data.models.filter(model => !model.stale && model.operations.includes(operation))
    const choice = data.choices[kind]
    const selected = choice ? identity(choice.selection) : ''
    return <fieldset key={kind} disabled={busy}><legend>{t(kind)}</legend><label>{t('model')}<select aria-label={t(kind)} value={selected} onChange={event => {
      const model = available.find(model => identity(model) === event.target.value)
      const choices = { ...data.choices }
      if (model) choices[kind] = { selection: { groupId: model.groupId, modelId: model.modelId, profileId: model.profileId, operation }, parameters: choice?.parameters ?? {} }
      else delete choices[kind]
      setData({ ...data, choices }); setStatus('ready')
    }}><option value="">{t('automatic')}</option>{choice && !available.some(model => identity(model) === selected) && <option value={selected}>{choice.selection.modelId} · {t('unavailable')}</option>}{available.map(model => <option key={identity(model)} value={identity(model)}>{model.modelId} · {model.groupName}</option>)}</select></label><label>{t('parameters')}<textarea aria-label={t('parameters') + ' · ' + t(kind)} value={drafts[kind] ?? '{}'} onChange={event => { setDrafts({ ...drafts, [kind]: event.target.value }); setStatus('ready') }} /></label></fieldset>
  })}<button disabled={busy || !data} onClick={() => void save()}>{t('save')}</button>{status !== 'ready' && <p role={status === 'saved' ? 'status' : 'alert'}>{t(status)}</p>}</section>
}
