import { useEffect, useMemo, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { EnvironmentVariableInfo, ImageGenerationQuality, ImageModelSelection } from '../shared/types.js'
import css from './section.module.css'
import { LiteratureSettings } from './LiteratureSettings.js'
import type { EnvironmentTranslate } from './locales.js'
import { LocalizedError, messageFromError, renderMessage, type LocalizedMessage } from './messages.js'
import type {} from '@deepseek-ai/dsh-client-locale/client'

interface Props extends PropsRuntime<'settings.section'> {
  t: EnvironmentTranslate
  reviewerScope: SettingsScope<any>
  environmentRemote: any
  accountRemote: any
  mcpRemote: any
  mineruRemote?: any
  pubmedRemote?: any
  unwrap(value: any): Promise<any>
  modelCatalog(check?: boolean): Promise<{ groups: any[]; failures: any[] }>
}

const defaultReviewer = { autoReview: false, modelMode: 'follow-session' as const, provider: '', model: '', reasoningEffort: '' }
const VALUE_SEPARATOR = '\u0000'
const SCI_MASTER_KEY_URL = 'https://scimaster.bohrium.com/vibe-write/home'

type LoadState = 'loading' | 'ready' | 'unavailable' | 'error'

export function EnvironmentSection({ reviewerScope, environmentRemote, accountRemote, mcpRemote, mineruRemote, pubmedRemote, unwrap, modelCatalog, t }: Props) {
  const [reviewer, setReviewerValue] = useState(() => reviewerScope.getSnapshot().value ?? defaultReviewer)
  const [catalogGroups, setCatalogGroups] = useState<any[]>([])
  const [imageModels, setImageModels] = useState<any[]>([])
  const [variables, setVariables] = useState<EnvironmentVariableInfo[]>([])
  const [sciConfigured, setSciConfigured] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const [sciKey, setSciKey] = useState('')
  const [error, setError] = useState<LocalizedMessage>('')
  const [status, setStatus] = useState<Record<string, LoadState>>({ account: 'loading', catalog: 'loading', variables: 'loading', image: 'loading', mcp: 'loading' })
  const [image, setImage] = useState<ImageModelSelection>({ providerId: '', groupId: '', modelId: '' })
  const [imageQuality, setImageQuality] = useState<ImageGenerationQuality>('medium')
  const [mineru, setMineru] = useState<any>({ apiBaseUrl: 'https://mineru.net', mode: 'auto', modelVersion: 'vlm', language: 'ch', tokenConfigured: false, available: false, registeredTools: [] })
  const [mineruToken, setMineruToken] = useState('')
  const [chemConfigured, setChemConfigured] = useState(false)
  const [chemKey, setChemKey] = useState('')
  const [chemConnection, setChemConnection] = useState<LocalizedMessage>('')
  const [rdatalinuxConfigured, setRdatalinuxConfigured] = useState(false)
  const [rdatalinuxEndpoint, setRdatalinuxEndpoint] = useState('http://103.217.185.141:8099/r-platform/mcp')
  const [rdatalinuxAuthorization, setRdatalinuxAuthorization] = useState('')
  const [rdatalinuxConnection, setRdatalinuxConnection] = useState<LocalizedMessage>('')

  useEffect(() => {
    setReviewerValue(reviewerScope.getSnapshot().value ?? defaultReviewer)
    return reviewerScope.subscribe(() => setReviewerValue(reviewerScope.getSnapshot().value ?? defaultReviewer))
  }, [reviewerScope])

  useEffect(() => {
    let cancelled = false
    const load = async (key: string, task: () => Promise<void>) => {
      try {
        await task()
        if (!cancelled) setStatus(current => ({ ...current, [key]: 'ready' }))
      } catch {
        if (!cancelled) setStatus(current => ({ ...current, [key]: 'error' }))
      }
    }
    void load('account', async () => {
      if (accountRemote?.current === undefined) throw new LocalizedError('accountUnavailable')
      const snapshot = await unwrap(accountRemote.current()) as any
      if (cancelled) return
      const rows = Array.isArray(snapshot?.models) ? snapshot.models : []
      setImageModels(rows.filter((model: any) => model.capability === 'image-generation'))
    })
    void load('catalog', async () => {
      const value = await modelCatalog(false)
      if (!cancelled) setCatalogGroups(Array.isArray(value?.groups) ? value.groups : [])
    })
    void load('variables', async () => {
      if (environmentRemote?.listVariables === undefined) throw new LocalizedError('variablesUnavailable')
      const value = await unwrap(environmentRemote.listVariables())
      if (!cancelled) setVariables(Array.isArray(value) ? value : [])
    })
    void load('image', async () => {
      if (environmentRemote?.getImageModelSelection === undefined) throw new LocalizedError('imageUnavailable')
      const value = await unwrap(environmentRemote.getImageModelSelection()) as ImageModelSelection | undefined
      if (!cancelled && value) setImage(value)
    })
    void load('imageQuality', async () => {
      const value = environmentRemote?.getImageQuality === undefined
        ? 'medium'
        : await unwrap(environmentRemote.getImageQuality())
      if (!cancelled && ['auto', 'low', 'medium', 'high'].includes(value)) setImageQuality(value)
    })
    void load('mcp', async () => {
      if (mcpRemote?.getSciMasterCredentialStatus === undefined) throw new LocalizedError('mcpUnavailable')
      const value = await unwrap(mcpRemote.getSciMasterCredentialStatus()) as any
      if (!cancelled) setSciConfigured(value?.configured === true)
    })
    void load('chem', async () => {
      const value = await unwrap(mcpRemote.getHuagongsheCredentialStatus())
      if (!cancelled) setChemConfigured(value?.configured === true)
    })
    void load('rdatalinux', async () => {
      if (mcpRemote?.getRdatalinuxCredentialStatus === undefined) throw new LocalizedError('mcpUnavailable')
      const value = await unwrap(mcpRemote.getRdatalinuxCredentialStatus()) as any
      if (!cancelled) { setRdatalinuxConfigured(value?.configured === true); setRdatalinuxEndpoint(value?.endpoint ?? 'http://103.217.185.141:8099/r-platform/mcp') }
    })
    void load('mineru', async () => {
      if (mineruRemote?.getConfigStatus === undefined) throw new LocalizedError('mineruUnavailable')
      const value = await unwrap(mineruRemote.getConfigStatus())
      if (!cancelled && value) setMineru(value)
    })
    return () => { cancelled = true }
  }, [accountRemote, environmentRemote, mcpRemote, mineruRemote, modelCatalog, unwrap])

  const reviewerModels = useMemo(() => catalogGroups.flatMap((group: any) => (Array.isArray(group.models) ? group.models.map((model: any) => ({
    ...model,
    providerId: group.id,
    providerName: group.name ?? group.id,
    modelId: model.id,
  })) : [])), [catalogGroups])
  const selectedReviewerModel = reviewerModels.find((model: any) => model.providerId === reviewer.provider && model.modelId === reviewer.model)
  const reviewerEfforts = selectedReviewerModel?.reasoning?.efforts ?? []
  const reviewerModelValue = reviewer.provider && reviewer.model ? `${reviewer.provider}${VALUE_SEPARATOR}${reviewer.model}` : ''
  const reviewerModelIsKnown = reviewerModels.some((model: any) => model.providerId === reviewer.provider && model.modelId === reviewer.model)

  const imageModelValue = image.providerId && image.groupId && image.modelId
    ? `${image.providerId}${VALUE_SEPARATOR}${image.groupId}${VALUE_SEPARATOR}${image.modelId}`
    : ''
  const imageModelIsKnown = imageModels.some((model: any) => model.providerId === image.providerId && model.groupId === image.groupId && model.modelId === image.modelId)
  const imageGroups = useMemo(() => {
    const groups = new Map<string, { providerId: string; groupId: string; label: string; models: any[] }>()
    for (const model of imageModels) {
      const key = `${model.providerId}${VALUE_SEPARATOR}${model.groupId}`
      const group: { providerId: string; groupId: string; label: string; models: any[] } = groups.get(key) ?? { providerId: model.providerId, groupId: model.groupId, label: model.groupName ?? model.groupId, models: [] }
      group.models.push(model)
      groups.set(key, group)
    }
    return [...groups.values()]
  }, [imageModels])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try { await action() } catch (value) { setError(messageFromError(value)) } finally { setBusy(false) }
  }
  const setReviewer = async (field: string, value: unknown) => run(async () => { await reviewerScope.set(field, value) })
  const selectReviewerModel = (value: string) => {
    const [provider = '', model = ''] = value.split(VALUE_SEPARATOR)
    void run(async () => {
      await reviewerScope.set('provider', provider)
      await reviewerScope.set('model', model)
      await reviewerScope.set('reasoningEffort', '')
    })
  }
  const saveVariable = async () => {
    if (!newName.trim() || !newValue) return
    await run(async () => {
      setVariables(await unwrap(environmentRemote.setVariable(newName, newValue)))
      setNewName('')
      setNewValue('')
    })
  }
  const saveSci = async () => {
    if (!sciKey.trim()) return
    await run(async () => {
      await unwrap(mcpRemote.setSciMasterApiKey(sciKey))
      setSciConfigured(true)
      setSciKey('')
    })
  }
  const saveImageSelection = (value: ImageModelSelection) => {
    setImage(value)
    void run(async () => { await unwrap(environmentRemote.setImageModelSelection(value)) })
  }
  const saveRdatalinux = () => void run(async () => {
    const key = rdatalinuxAuthorization.trim().replace(/^Bearer\s+/iu, '')
    if (!key) throw new LocalizedError('rmcpRequired')
    const value = await unwrap(mcpRemote.setRdatalinuxAuthorization(`Bearer ${key}`)) as any
    setRdatalinuxConfigured(true)
    setRdatalinuxAuthorization('')
    if (value?.runtimeState === 'active') setRdatalinuxConnection({ key: 'connectedTools', params: { count: (value.tools ?? []).length } })
    else setRdatalinuxConnection(value?.runtimeError ? { key: 'testFailed', params: { error: value.runtimeError } } : { key: 'credentialSaved' })
  })
  const saveImageQuality = (value: ImageGenerationQuality) => {
    setImageQuality(value)
    void run(async () => {
      if (environmentRemote?.setImageQuality !== undefined) await unwrap(environmentRemote.setImageQuality(value))
    })
  }
  const saveMineru = async (changes: Record<string, unknown>) => run(async () => { const value = await unwrap(mineruRemote.updateConfig(changes)); setMineru(value) })
  const statusText = (key: string, ready = t('loaded')) => status[key] === 'loading' ? t('loading') : status[key] === 'error' || status[key] === 'unavailable' ? t('unavailable') : ready

  return <section className={css.root}>
    <header className={css.header}>
      <div><span className={css.eyebrow}>ZeroWall Science</span><h2>{t('title')}</h2></div>
      <span className={css.securityNote}>{t('securityNote')}</span>
    </header>
    {error ? <p className={css.error} role="alert">{renderMessage(error, t)}</p> : null}
    <div className={css.grid}>
      <LiteratureSettings remote={pubmedRemote} unwrap={unwrap} t={t} />
      <article className={css.card}>
        <div className={css.cardHeader}><div><h3>Reviewer</h3><p>{t('reviewerDescription')}</p></div><span className={css.status}>{statusText('catalog', t('catalogSynced'))}</span></div>
        <div className={css.formGrid}>
          <label className={css.checkboxField}><input type="checkbox" checked={reviewer.autoReview === true} disabled={busy} onChange={event => void setReviewer('autoReview', event.target.checked)} /><span>{t('autoReview')}</span></label>
          <label className={css.field}><span>{t('reviewMode')}</span><select className={css.control} value={reviewer.modelMode ?? 'follow-session'} disabled={busy} onChange={event => void setReviewer('modelMode', event.target.value)}><option value="follow-session">{t('followSession')}</option><option value="fixed">{t('fixedModel')}</option></select></label>
          {reviewer.modelMode === 'fixed' ? <>
            <label className={`${css.field} ${css.fullWidth}`}><span>{t('reviewModel')}</span><select className={css.control} value={reviewerModelIsKnown ? reviewerModelValue : ''} disabled={busy || reviewerModels.length === 0} onChange={event => selectReviewerModel(event.target.value)}><option value="">{t('selectModel')}</option>{!reviewerModelIsKnown && reviewer.provider && reviewer.model ? <option value={reviewerModelValue}>{reviewer.provider} / {reviewer.model}{t('currentConfig')}</option> : null}{catalogGroups.map((group: any) => <optgroup key={group.id} label={group.name ?? group.id}>{(Array.isArray(group.models) ? group.models : []).map((model: any) => <option key={`${group.id}${VALUE_SEPARATOR}${model.id}`} value={`${group.id}${VALUE_SEPARATOR}${model.id}`}>{model.name ?? model.id}</option>)}</optgroup>)}</select></label>
            <label className={css.field}><span>{t('reasoningEffort')}</span><select className={css.control} value={reviewer.reasoningEffort ?? ''} disabled={busy || reviewerEfforts.length === 0} onChange={event => void setReviewer('reasoningEffort', event.target.value)}><option value="">{t('modelDefault')}{selectedReviewerModel?.reasoning?.defaultEffort ? `（${selectedReviewerModel.reasoning.defaultEffort}）` : ''}</option>{reviewer.reasoningEffort && !reviewerEfforts.some((effort: any) => effort.id === reviewer.reasoningEffort) ? <option value={reviewer.reasoningEffort}>{reviewer.reasoningEffort}{t('currentConfig')}</option> : null}{reviewerEfforts.map((effort: any) => <option key={effort.id} value={effort.id}>{effort.name ?? effort.id}</option>)}</select><small>{reviewerEfforts.length === 0 ? t('noEfforts') : t('chooseEffort')}</small></label>
          </> : null}
        </div>
      </article>

      <article className={css.card}>
        <div className={css.cardHeader}><div><h3>rdatalinux rmcp</h3><p>{t('rmcpDescription')}</p></div><span className={rdatalinuxConfigured ? css.statusGood : css.status}>{statusText('rdatalinux', rdatalinuxConfigured ? t('configured') : t('notConfigured'))}</span></div>
        <label className={css.field}><span>Endpoint</span><input className={css.control} value={rdatalinuxEndpoint} readOnly /></label>
        <div className={css.keyRow}><input className={css.control} type="password" placeholder={t('enterMcpKey')} value={rdatalinuxAuthorization} onChange={event => setRdatalinuxAuthorization(event.target.value)} autoComplete="off" /><button className={css.primaryButton} type="button" disabled={busy || !rdatalinuxAuthorization.trim() || !mcpRemote?.setRdatalinuxAuthorization} onClick={saveRdatalinux}>{t('saveKey')}</button><button className={css.secondaryButton} type="button" disabled={busy || !rdatalinuxConfigured || !mcpRemote?.clearRdatalinuxAuthorization} onClick={() => void run(async () => { await unwrap(mcpRemote.clearRdatalinuxAuthorization()); setRdatalinuxConfigured(false); setRdatalinuxConnection('') })}>{t('clear')}</button><button className={css.secondaryButton} type="button" disabled={busy || !mcpRemote?.list} onClick={() => void run(async () => { const rows = await unwrap(mcpRemote.list()); const record = rows.find((row: any) => row.serverName === 'rmcp'); if (!record) throw new LocalizedError('rmcpMissing'); const value = await unwrap(mcpRemote.reload(record.id)); if (value.runtimeState !== 'active') throw new Error(value.runtimeError || t('rmcpUnavailable')); setRdatalinuxConnection({ key: 'connectedTools', params: { count: (value.tools ?? []).length } }) })}>{t('testConnection')}</button></div>
        {rdatalinuxConnection ? <p className={css.muted} role="status">{renderMessage(rdatalinuxConnection, t)}</p> : null}
      </article>

      <article className={css.card}>
        <div className={css.cardHeader}><div><h3>{t('mineruTitle')}</h3><p>{t('mineruDescription')}</p></div><span className={mineru.tokenConfigured && mineru.available ? css.statusGood : css.status}>{statusText('mineru', !mineru.available ? t('toolsInactive') : mineru.tokenConfigured ? t('tokenConfigured') : t('localParsing'))}</span></div>
        <div className={`${css.keyRow} ${css.mineruTokenRow}`}><input className={css.control} type="password" placeholder={t('enterMineruToken')} value={mineruToken} onChange={event => setMineruToken(event.target.value)} autoComplete="off" /><button className={css.primaryButton} type="button" disabled={busy || !mineruToken.trim() || mineruRemote?.setToken === undefined} onClick={() => void run(async () => { const value = await unwrap(mineruRemote.setToken(mineruToken)); setMineru(value); setMineruToken('') })}>{t('saveToken')}</button><button className={css.secondaryButton} type="button" disabled={busy || !mineru.tokenConfigured || mineruRemote?.clearToken === undefined} onClick={() => void run(async () => setMineru(await unwrap(mineruRemote.clearToken()))) }>{t('clear')}</button></div>
        <div className={css.formGrid}>
          <label className={css.field}><span>API Base URL</span><input className={css.control} value={mineru.apiBaseUrl ?? ''} onChange={event => setMineru((current: any) => ({ ...current, apiBaseUrl: event.target.value }))} onBlur={() => void saveMineru({ apiBaseUrl: mineru.apiBaseUrl })} /></label>
          <label className={css.field}><span>{t('parsingMode')}</span><select className={css.control} value={mineru.mode ?? 'auto'} onChange={event => void saveMineru({ mode: event.target.value })}><option value="auto">{t('auto')}</option><option value="precision">Precision</option><option value="agent">Agent</option></select></label>
          <label className={css.field}><span>{t('modelVersion')}</span><select className={css.control} value={mineru.modelVersion ?? 'vlm'} onChange={event => void saveMineru({ modelVersion: event.target.value })}><option value="vlm">vlm</option><option value="pipeline">pipeline</option><option value="MinerU-HTML">MinerU-HTML</option></select></label>
          <label className={css.field}><span>{t('languagePack')}</span><input className={css.control} value={mineru.language ?? 'ch'} onChange={event => setMineru((current: any) => ({ ...current, language: event.target.value }))} onBlur={() => void saveMineru({ language: mineru.language })} /></label>
          <label className={css.checkboxField}><input type="checkbox" checked={mineru.enableTable !== false} disabled={busy} onChange={event => void saveMineru({ enableTable: event.target.checked })} /><span>{t('extractTables')}</span></label>
          <label className={css.checkboxField}><input type="checkbox" checked={mineru.enableFormula !== false} disabled={busy} onChange={event => void saveMineru({ enableFormula: event.target.checked })} /><span>{t('extractFormulas')}</span></label>
          <label className={css.checkboxField}><input type="checkbox" checked={mineru.isOcr === true} disabled={busy} onChange={event => void saveMineru({ isOcr: event.target.checked })} /><span>{t('enableOcr')}</span></label>
          <label className={css.field}><span>{t('timeout')}</span><input className={css.control} type="number" min={10000} max={3600000} step={1000} value={mineru.timeoutMs ?? 600000} onChange={event => setMineru((current: any) => ({ ...current, timeoutMs: Number(event.target.value) }))} onBlur={() => void saveMineru({ timeoutMs: mineru.timeoutMs })} /></label>
          <label className={css.field}><span>{t('pollInterval')}</span><input className={css.control} type="number" min={500} max={60000} step={100} value={mineru.pollIntervalMs ?? 3000} onChange={event => setMineru((current: any) => ({ ...current, pollIntervalMs: Number(event.target.value) }))} onBlur={() => void saveMineru({ pollIntervalMs: mineru.pollIntervalMs })} /></label>
          <label className={css.field}><span>{t('dailyLimit')}</span><input className={css.control} type="number" min={1} max={5000} value={mineru.dailyLimit ?? 5000} onChange={event => setMineru((current: any) => ({ ...current, dailyLimit: Number(event.target.value) }))} onBlur={() => void saveMineru({ dailyLimit: mineru.dailyLimit })} /></label>
        </div>
        <div className={`${css.keyRow} ${css.mineruActionsRow}`}><button className={css.secondaryButton} type="button" disabled={busy || mineruRemote?.testConnection === undefined} onClick={() => void run(async () => { await unwrap(mineruRemote.testConnection()) })}>{t('testConnection')}</button><a className={css.helpLink} href="https://mineru.net/apiManage/token" target="_blank" rel="noreferrer">{t('getMineruToken')}</a></div>
      </article>

      <article className={css.card}>
        <div className={css.cardHeader}><div><h3>SciMaster</h3><p>{t('sciDescription')}</p></div><span className={sciConfigured ? css.statusGood : css.status}>{status.mcp === 'loading' ? t('loading') : sciConfigured ? t('configured') : t('notConfigured')}</span></div>
        <div className={css.keyRow}><input className={css.control} type="password" placeholder={t('enterSciKey')} value={sciKey} onChange={event => setSciKey(event.target.value)} autoComplete="off" /><button className={css.primaryButton} type="button" disabled={busy || !sciKey.trim() || mcpRemote?.setSciMasterApiKey === undefined} onClick={() => void saveSci()}>{t('saveKey')}</button><button className={css.secondaryButton} type="button" disabled={busy || !sciConfigured || mcpRemote?.clearSciMasterApiKey === undefined} onClick={() => void run(async () => { await unwrap(mcpRemote.clearSciMasterApiKey()); setSciConfigured(false) })}>{t('clear')}</button></div>
        <a className={css.helpLink} href={SCI_MASTER_KEY_URL} target="_blank" rel="noreferrer">{t('getSciKey')}</a>
      </article>

      <article className={css.card}>
        <div className={css.cardHeader}><div><h3>{t('chemTitle')}</h3><p>{t('chemDescription')}</p></div><span className={chemConfigured ? css.statusGood : css.status}>{statusText('chem', chemConfigured ? t('tokenConfigured') : t('publicQueries'))}</span></div>
        <div className={css.keyRow}>
          <input className={css.control} aria-label={t('chemToken')} type="password" placeholder={t('enterChemToken')} value={chemKey} onChange={event => setChemKey(event.target.value)} autoComplete="off" />
          <button className={css.primaryButton} type="button" disabled={busy || !chemKey.trim() || !mcpRemote?.setHuagongsheApiKey} onClick={() => void run(async () => { const value = await unwrap(mcpRemote.setHuagongsheApiKey(chemKey)); setChemConfigured(true); setChemKey(''); setChemConnection({ key: value.runtimeState === 'active' ? 'connected' : 'tokenSaved' }) })}>{t('saveToken')}</button>
          <button className={css.secondaryButton} type="button" disabled={busy || !chemConfigured} onClick={() => void run(async () => { await unwrap(mcpRemote.clearHuagongsheApiKey()); setChemConfigured(false); setChemConnection('') })}>{t('clear')}</button>
          <button className={css.secondaryButton} type="button" disabled={busy || !mcpRemote?.list} onClick={() => void run(async () => { const rows = await unwrap(mcpRemote.list()); const record = rows.find((row: any) => row.serverName === 'huagongshe'); if (!record) throw new LocalizedError('chemMissing'); const value = await unwrap(mcpRemote.reload(record.id)); if (value.runtimeState !== 'active') throw new Error(value.runtimeError || t('chemUnavailable')); setChemConnection({ key: 'connectedTools', params: { count: value.tools.length } }) })}>{t('testConnection')}</button>
        </div>
        <a className={css.helpLink} href="https://huagongshe.com/mcp-guide" target="_blank" rel="noreferrer">{t('getChemToken')}</a>
        {chemConnection ? <p className={css.muted} role="status">{renderMessage(chemConnection, t)}</p> : null}
      </article>

      <article className={css.card}>
        <div className={css.cardHeader}><div><h3>{t('imageTitle')}</h3><p>{t('imageDescription')}</p></div><span className={css.status}>{statusText('account', t('imageSynced'))}</span></div>
        <label className={css.field}><span>{t('currentImageModel')}</span><select className={css.control} value={imageModelIsKnown ? imageModelValue : ''} disabled={busy || status.account !== 'ready'} onChange={event => { const [providerId = '', groupId = '', modelId = ''] = event.target.value.split(VALUE_SEPARATOR); saveImageSelection({ providerId, groupId, modelId }) }}><option value="">{t('autoSelect')}</option>{!imageModelIsKnown && imageModelValue ? <option value={imageModelValue}>{image.providerId} / {image.modelId}{t('currentConfig')}</option> : null}{imageGroups.map(group => <optgroup key={`${group.providerId}${VALUE_SEPARATOR}${group.groupId}`} label={group.label}>{group.models.map((model: any) => <option key={`${model.providerId}${VALUE_SEPARATOR}${model.groupId}${VALUE_SEPARATOR}${model.modelId}`} value={`${model.providerId}${VALUE_SEPARATOR}${model.groupId}${VALUE_SEPARATOR}${model.modelId}`}>{model.modelId}{model.name && model.name !== model.modelId ? ` · ${model.name}` : ''}</option>)}</optgroup>)}</select></label>
        <label className={css.field}><span>{t('defaultQuality')}</span><select className={css.control} value={imageQuality} disabled={busy} onChange={event => saveImageQuality(event.target.value as ImageGenerationQuality)}><option value="auto">{t('auto')}</option><option value="low">{t('low')}</option><option value="medium">{t('medium')}</option><option value="high">{t('high')}</option></select><small>{t('qualityNote')}</small></label>
      </article>

      <article className={`${css.card} ${css.variablesCard}`}>
        <div className={css.cardHeader}><div><h3>{t('variablesTitle')}</h3><p>{t('variablesDescription')}</p></div><span className={css.status}>{statusText('variables', t('variableCount', { count: variables.length }))}</span></div>
        <div className={css.variableList}>{variables.length === 0 ? <span className={css.muted}>{t('noVariables')}</span> : variables.map(variable => <div className={css.variableRow} key={variable.name}><code>{variable.name}</code><span>{variable.configured ? t('configured') : t('notConfigured')}</span>{variable.configured && <button className={css.textButton} type="button" disabled={busy} onClick={() => void run(async () => { const value = await unwrap(environmentRemote.readVariable(variable.name)); if (value !== undefined) await navigator.clipboard?.writeText(value) })}>查看并复制</button>}<button className={css.textButton} type="button" disabled={busy} onClick={() => void run(async () => setVariables(await unwrap(environmentRemote.deleteVariable(variable.name))))}>{t('delete')}</button></div>)}</div>
        <div className={css.variableForm}><input className={css.control} placeholder={t('variableName')} value={newName} onChange={event => setNewName(event.target.value)} /><input className={css.control} type="password" placeholder={t('variableValue')} value={newValue} onChange={event => setNewValue(event.target.value)} autoComplete="off" /><button className={css.primaryButton} type="button" disabled={busy || !newName.trim() || !newValue} onClick={() => void saveVariable()}>{t('addVariable')}</button></div>
      </article>
    </div>
  </section>
}
