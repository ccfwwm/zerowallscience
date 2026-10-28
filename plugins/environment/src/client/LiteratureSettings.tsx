import { useEffect, useRef, useState } from 'react'
import { Save, Trash2, ExternalLink, Activity } from 'lucide-react'
import { DEFAULTS, SERVICES, SOURCES, type PubmedStatus, type PubmedConfig, type ServiceId } from '../../../pubmed/src/shared/types.js'
import css from './literature.module.css'
import type { EnvironmentKey, EnvironmentTranslate } from './locales.js'
import { messageFromError, renderMessage, type LocalizedMessage } from './messages.js'

interface Props { remote: any; unwrap(value: any): Promise<any>; t: EnvironmentTranslate; refreshToken?: number }
const sourceKeys = { dedicated: 'dedicated', variable: 'variablesTitle', environment: 'startupEnvironment', none: 'notConfigured' } as const
const probeKeys: Record<string, EnvironmentKey> = { available: 'querySuccess', anonymous: 'anonymous', 'authentication-failed': 'authFailed', 'rate-limited': 'rateLimited', 'network-failed': 'networkFailed', disabled: 'disabled' }
export function LiteratureSettings({ remote, unwrap, t, refreshToken = 0 }: Props) {
  const toggleLabels = { AUTO_GRAPH: t('autoGraph'), PUBTATOR: t('pubtator'), EUROPEPMC_ENABLED: 'Europe PMC', S2_ENABLED: 'Semantic Scholar', OPENALEX_ENABLED: 'OpenAlex', PUBTATOR_EDGE_EVIDENCE: t('edgeEvidence') }
  const [status, setStatus] = useState<PubmedStatus>()
  const [draft, setDraft] = useState<PubmedConfig>(DEFAULTS)
  const [values, setValues] = useState<Record<string, string>>({})
  const [messages, setMessages] = useState<Record<string, LocalizedMessage>>({})
  const [busy, setBusy] = useState<string[]>([])
  const [error, setError] = useState<LocalizedMessage>('')
  const initialConfigLoaded = useRef(false)
  useEffect(() => {
    let disposed = false
    if (!remote?.getConfigStatus) { setError({ key: 'literatureUnavailable' }); return }
    void unwrap(remote.getConfigStatus()).then((value: PubmedStatus) => { if (!disposed) { setStatus(value); if (!initialConfigLoaded.current) { setDraft(value.config); initialConfigLoaded.current = true } setError('') } }).catch(() => { if (!disposed) setError({ key: 'literatureLoadFailed' }) })
    return () => { disposed = true }
  }, [remote, unwrap, refreshToken])
  const run = async (id: string, action: () => Promise<void>) => {
    setBusy(current => [...current, id]); setError('')
    try { await action() } catch (error) { setError(error instanceof Error ? messageFromError(error) : { key: 'operationFailed' }) }
    finally { setBusy(current => current.filter(key => key !== id)) }
  }
  const save = (service: typeof SERVICES[number]) => run(service.id, async () => {
    const result = await unwrap(remote.setKey({ name: service.key, value: values[service.id] ?? '' }))
    setStatus(result); setValues(current => ({ ...current, [service.id]: '' })); setMessages(current => ({ ...current, [service.id]: { key: 'savedUntested' } }))
  })
  const clear = (service: typeof SERVICES[number]) => run(service.id, async () => {
    const result: PubmedStatus = await unwrap(remote.clearKey(service.key)); setStatus(result)
    const key = result.keys.find(k => k.name === service.key)
    setMessages(current => ({ ...current, [service.id]: key?.configured ? { key: 'clearedUsingSource', params: { source: sourceKeys[key.source] } } : { key: 'clearedNoKey' } }))
  })
  const probe = (id: ServiceId) => run(id, async () => {
    const result = await unwrap(remote.testConnection(id))
    setMessages(current => ({ ...current, [id]: { key: probeKeys[result.state] ?? 'testDone' } }))
  })
  return <details className={css.root} aria-labelledby="literature-settings-title">
    <summary className={css.header}><h3 id="literature-settings-title">{t('literatureTitle')}</h3><label onClick={event => event.stopPropagation()}><input aria-label={t('enableLiterature')} type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />{t('enable')}</label></summary>
    {error && <p role="alert" className={css.error}>{renderMessage(error, t)}</p>}
    <div className={css.sourceList}>
      {SERVICES.map(service => {
        const key = status?.keys.find(k => k.name === service.key); const disabled = busy.includes(service.id) || !status
        return <details className={css.sourceItem} key={service.id}><summary className={css.sourceSummary}><span>{service.label}</span><span className={`${css.sourceStatus} ${!status ? '' : !service.key || key?.configured ? css.sourceConfigured : css.sourceMissing}`}>{!status ? t('loadingShort') : service.key ? key?.configured ? t('configuredPrefix') + t(sourceKeys[key.source]) : t('missingFailed') : t('publicService')}</span></summary>
          <div className={css.sourceBody}><div className={css.sourceSetting}>{service.key ? <><code>{service.key}</code><input aria-label={service.key} type="password" autoComplete="off" placeholder={t('optionalKey')} value={values[service.id] ?? ''} onChange={e => setValues(current => ({ ...current, [service.id]: e.target.value }))} /></> : t('noKeyNeeded')}</div>
            <small role="status">{renderMessage(messages[service.id] ?? '', t)}</small>
            <div className={css.actions}>{service.key && <><button type="button" title={t('saveServiceKey', { service: service.label })} aria-label={t('saveServiceKey', { service: service.label })} disabled={disabled || !values[service.id]?.trim()} onClick={() => void save(service)}><Save size={16} /></button><button type="button" title={t('clearServiceKey', { service: service.label })} aria-label={t('clearServiceKey', { service: service.label })} disabled={disabled || !key?.configured} onClick={() => void clear(service)}><Trash2 size={16} /></button></>}<button type="button" title={t('testService', { service: service.label })} aria-label={t('testService', { service: service.label })} disabled={disabled} onClick={() => void probe(service.id)}><Activity size={16} /></button><a href={service.url} target="_blank" rel="noreferrer" aria-label={`${service.label} ${service.key ? t('getKey') : t('officialDocs')}`}>{service.key ? t('getKey') : t('officialDocs')}<ExternalLink size={14} /></a></div>
          </div></details>
      })}
    </div>
    <details className={css.advanced}><summary>{t('advanced')}</summary><div className={css.fields}>
      <fieldset><legend>{t('defaultSources')}</legend>{SOURCES.map(source => <label key={source}><input type="checkbox" checked={draft.defaultSources.includes(source)} onChange={e => setDraft({ ...draft, defaultSources: e.target.checked ? [...draft.defaultSources, source] : draft.defaultSources.filter(s => s !== source) })} />{SERVICES.find(s => s.id === source)?.label}</label>)}</fieldset>
      <fieldset><legend>{t('graphCapabilities')}</legend>{Object.entries(toggleLabels).map(([key, label]) => <label key={key}><input type="checkbox" checked={draft[key as keyof typeof toggleLabels]} onChange={e => setDraft({ ...draft, [key]: e.target.checked })} />{label}</label>)}</fieldset>
      <label>{t('ncbiEmail')}<input type="email" value={draft.NCBI_ADMIN_EMAIL} onChange={e => setDraft({ ...draft, NCBI_ADMIN_EMAIL: e.target.value })} /></label>
      {(['EUTILS_BASE_URL', 'EPMC_BASE_URL', 'PUBTATOR_BASE_URL', 'S2_BASE_URL', 'OPENALEX_BASE_URL'] as const).map(key => <label key={key}>{key}<input type="url" value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></label>)}
      <label>{t('conceptsPerPaper')}<input type="number" min={1} max={6} value={draft.PUBTATOR_RELATION_PROBE} onChange={e => setDraft({ ...draft, PUBTATOR_RELATION_PROBE: Number(e.target.value) })} /></label>
      <label>{t('papersPerBatch')}<input type="number" min={1} max={50} value={draft.PUBTATOR_RELATION_PROBE_ARTICLES} onChange={e => setDraft({ ...draft, PUBTATOR_RELATION_PROBE_ARTICLES: Number(e.target.value) })} /></label>
    </div></details>
    <div className={css.footer}><span>{t('keysNote')}</span><button type="button" disabled={!status || busy.includes('config')} onClick={() => void run('config', async () => { const value = await unwrap(remote.updateConfig(draft)); setStatus(value); setDraft(value.config); setMessages({}) })}><Save size={16} />{t('saveConfig')}</button></div>
  </details>
}
