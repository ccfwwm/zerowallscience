import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Eye, EyeOff, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import type {} from '@zerowallscience/plugin-base/client-helpers'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { EnvironmentVariableInfo, ImageGenerationQuality, ImageModelSelection } from '../shared/types.js'
import css from './section.module.css'
import { LiteratureSettings } from './LiteratureSettings.js'
import { VariableActionDialog, type VariableAction } from './VariableActionDialog.js'
import type { EnvironmentTranslate } from './locales.js'
import { LocalizedError, messageFromError, renderMessage, type LocalizedMessage } from './messages.js'
import type {} from '@deepseek-ai/dsh-client-locale/client'

interface Props extends PropsRuntime<'settings.section'> {
  t: EnvironmentTranslate
  environmentRemote: any
  accountRemote: any
  mcpRemote: any
  mineruRemote?: any
  pubmedRemote?: any
  unwrap(value: any): Promise<any>
  modelCatalog(): Promise<{ groups: any[]; failures: any[] }>
}

const VALUE_SEPARATOR = '\u0000'
const SCI_MASTER_KEY_URL = 'https://scimaster.bohrium.com/vibe-write/home'
const mediaIdentity = (model: any): string => JSON.stringify([model.providerId, model.groupId, model.modelId, model.profileId ?? ''])
const isImageGroup = (name: unknown): boolean => typeof name === 'string' && /生图|图片/u.test(name.trim())

type LoadState = 'loading' | 'ready' | 'unavailable' | 'error'

export function EnvironmentSection({ environmentRemote, accountRemote, mcpRemote, mineruRemote, pubmedRemote, unwrap, modelCatalog, t }: Props) {
  const [imageModels, setImageModels] = useState<any[]>([])
  const [variables, setVariables] = useState<EnvironmentVariableInfo[]>([])
  const [sciConfigured, setSciConfigured] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const [variableAction, setVariableAction] = useState<VariableAction>()
  const cancelVariableAction = useCallback(() => setVariableAction(undefined), [])
  const [viewingVariable, setViewingVariable] = useState<{ name: string; value: string }>()
  const [variableRevealed, setVariableRevealed] = useState(false)
  const [variableCopied, setVariableCopied] = useState(false)
  const [variableCopyError, setVariableCopyError] = useState(false)
  const variableDialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (viewingVariable === undefined) return
    const previous = document.activeElement as HTMLElement | null
    variableDialog.current?.showModal()
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      setViewingVariable(undefined)
    }
    window.addEventListener('keydown', escape, true)
    return () => { window.removeEventListener('keydown', escape, true); previous?.focus() }
  }, [viewingVariable])
  const [sciKey, setSciKey] = useState('')
  const [error, setError] = useState<LocalizedMessage>('')
  const [status, setStatus] = useState<Record<string, LoadState>>({ account: 'loading', catalog: 'loading', variables: 'loading', image: 'loading', mcp: 'loading', chem: 'loading', rdatalinux: 'loading', mineru: 'loading' })
  const [image, setImage] = useState<ImageModelSelection>({ providerId: '', groupId: '', modelId: '' })
  const [imageQuality, setImageQuality] = useState<ImageGenerationQuality>('medium')
  const [contextBudget, setContextBudget] = useState(300_000)
  const [mineru, setMineru] = useState<any>({ apiBaseUrl: 'https://mineru.net', mode: 'auto', modelVersion: 'vlm', language: 'ch', tokenConfigured: false, available: false, registeredTools: [] })
  const [mineruToken, setMineruToken] = useState('')
  const [credentialRefresh, setCredentialRefresh] = useState(0)
  const [chemConfigured, setChemConfigured] = useState(false)
  const [chemKey, setChemKey] = useState('')
  const [chemConnection, setChemConnection] = useState<LocalizedMessage>('')
  const [rdatalinuxConfigured, setRdatalinuxConfigured] = useState(false)
  const [rdatalinuxEndpoint, setRdatalinuxEndpoint] = useState('https://rmcp.chengxunkeji.cn/r-platform/mcp')
  const [rdatalinuxAuthorization, setRdatalinuxAuthorization] = useState('')
  const [rdatalinuxConnection, setRdatalinuxConnection] = useState<LocalizedMessage>('')

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
      let snapshot = await unwrap(accountRemote.current()) as any
      if (snapshot?.status === 'signedIn' && accountRemote.discoverModels) {
        try { snapshot = await unwrap(accountRemote.discoverModels()) } catch { /* Keep the last available directory when offline. */ }
      }
      if (cancelled) return
      const rows = [...(Array.isArray(snapshot?.models) ? snapshot.models.filter((model: any) => model.capability === 'image-generation' || (model.capability === undefined && isImageGroup(model.groupName))) : []), ...(Array.isArray(snapshot?.mediaModels) ? snapshot.mediaModels.filter((model: any) => model.mediaType === 'image') : [])]
      const available = rows.filter((model: any) => isImageGroup(model.groupName) && !model.stale)
      setImageModels([...new Map(available.map((model: any) => [mediaIdentity(model), model])).values()])
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
      if (!cancelled && ['auto', 'low', 'medium', 'high', 'xhigh', 'max'].includes(value)) setImageQuality(value)
    })
    void load('contextBudget', async () => {
      if (environmentRemote?.getContextBudget === undefined) return
      const value = await unwrap(environmentRemote.getContextBudget())
      if (!cancelled && Number.isSafeInteger(value) && value >= 32_000 && value <= 1_000_000) setContextBudget(value)
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
      if (!cancelled) { setRdatalinuxConfigured(value?.configured === true); setRdatalinuxEndpoint(value?.endpoint ?? 'https://rmcp.chengxunkeji.cn/r-platform/mcp') }
    })
    void load('mineru', async () => {
      if (mineruRemote?.getConfigStatus === undefined) throw new LocalizedError('mineruUnavailable')
      const value = await unwrap(mineruRemote.getConfigStatus())
      if (!cancelled && value) setMineru(value)
    })
    return () => { cancelled = true }
  }, [accountRemote, environmentRemote, mcpRemote, mineruRemote, modelCatalog, unwrap])

  const imageModelValue = image.providerId && image.groupId && image.modelId
    ? `${image.providerId}${VALUE_SEPARATOR}${image.groupId}${VALUE_SEPARATOR}${image.modelId}${VALUE_SEPARATOR}${image.profileId ?? ""}`
    : ''
  const imageModelIsKnown = imageModels.some((model: any) => mediaIdentity(model) === mediaIdentity(image))
  const selectedImageModel = imageModels.find((model: any) => mediaIdentity(model) === mediaIdentity(image))
  const imageQualityChoices = ['auto', ...(['low', 'medium', 'high', 'xhigh', 'max'] as const).filter(quality => !selectedImageModel?.qualities?.length || selectedImageModel.qualities.includes(quality) || quality === imageQuality)]
  const imageGroups = useMemo(() => {
    const groups = new Map<string, { providerId: string; groupId: string; label: string; models: any[] }>()
    const modelCounts = new Map<string, number>()
    for (const model of imageModels) {
      const key = `${model.providerId}${VALUE_SEPARATOR}${model.groupId}${VALUE_SEPARATOR}${model.modelId}`
      modelCounts.set(key, (modelCounts.get(key) ?? 0) + 1)
    }
    for (const model of imageModels) {
      const key = `${model.providerId}${VALUE_SEPARATOR}${model.groupId}`
      const group: { providerId: string; groupId: string; label: string; models: any[] } = groups.get(key) ?? { providerId: model.providerId, groupId: model.groupId, label: model.groupName ?? model.groupId, models: [] }
      const modelKey = `${model.providerId}${VALUE_SEPARATOR}${model.groupId}${VALUE_SEPARATOR}${model.modelId}`
      group.models.push(modelCounts.get(modelKey)! > 1 && model.profileId ? { ...model, name: `${model.name ?? model.modelId} · ${model.profileId}` } : model)
      groups.set(key, group)
    }
    return [...groups.values()]
  }, [imageModels])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try { await action() } catch (value) { setError(messageFromError(value)) } finally { setBusy(false) }
  }
  const saveVariable = async () => {
    if (!newName.trim() || !newValue) return
    await run(async () => {
      setVariables(await unwrap(environmentRemote.setVariable(newName, newValue)))
      setNewName('')
      setNewValue('')
      await refreshCredentials()
    })
  }
  const confirmVariableAction = (value?: string) => void run(async () => {
    if (!variableAction) return
    if (variableAction.kind === 'sync') {
      if (environmentRemote?.restoreOfficialDefaults === undefined) throw new LocalizedError('variablesUnavailable')
      setVariables(await unwrap(environmentRemote.restoreOfficialDefaults()))
    } else if (variableAction.kind === 'delete') {
      setVariables(await unwrap(environmentRemote.deleteVariable(variableAction.name)))
    } else {
      setVariables(await unwrap(environmentRemote.setVariable(variableAction.name, value)))
    }
    await refreshCredentials()
    setVariableAction(undefined)
  })
  const editVariable = (name: string) => void run(async () => {
    const value = await unwrap(environmentRemote.readVariable(name))
    setVariableAction({ kind: 'edit', name, value: value ?? '' })
  })
  const refreshCredentials = async () => {
    const loadRemote = async (remote: any, method: string) => {
      try {
        if (typeof remote?.[method] !== 'function') throw new Error('Remote service unavailable')
        return { ok: true as const, value: await unwrap(remote[method]()) }
      } catch { return { ok: false as const } }
    }
    const [sci, chem, rmcp, mineruStatus] = await Promise.all([
      loadRemote(mcpRemote, 'getSciMasterCredentialStatus'),
      loadRemote(mcpRemote, 'getHuagongsheCredentialStatus'),
      loadRemote(mcpRemote, 'getRdatalinuxCredentialStatus'),
      loadRemote(mineruRemote, 'getConfigStatus'),
    ])
    if (sci.ok) setSciConfigured(sci.value?.configured === true)
    if (chem.ok) setChemConfigured(chem.value?.configured === true)
    if (rmcp.ok) {
      setRdatalinuxConfigured(rmcp.value?.configured === true)
      setRdatalinuxEndpoint(rmcp.value?.endpoint ?? 'https://rmcp.chengxunkeji.cn/r-platform/mcp')
    }
    if (mineruStatus.ok) setMineru(mineruStatus.value)
    setStatus(current => ({ ...current,
      mcp: sci.ok ? 'ready' : 'error',
      chem: chem.ok ? 'ready' : 'error',
      rdatalinux: rmcp.ok ? 'ready' : 'error',
      mineru: mineruStatus.ok ? 'ready' : 'error',
    }))
    setCredentialRefresh(value => value + 1)
  }
  const viewVariable = async (name: string) => run(async () => {
    const value = await unwrap(environmentRemote.readVariable(name))
    if (value === undefined) throw new LocalizedError('variablesUnavailable')
    setViewingVariable({ name, value })
    setVariableRevealed(false)
    setVariableCopied(false)
    setVariableCopyError(false)
  })
  const copyVariable = async () => {
    if (viewingVariable === undefined) return
    try {
      setVariableCopyError(false)
      if (window.zerowallDesktop?.copyText !== undefined) {
        if (!await window.zerowallDesktop.copyText(viewingVariable.value)) throw new Error('clipboard unavailable')
      } else {
        await navigator.clipboard.writeText(viewingVariable.value)
      }
      setVariableCopied(true)
    } catch {
      setVariableCopied(false)
      setVariableCopyError(true)
    }
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
  const saveContextBudget = (value: number) => {
    if (environmentRemote?.setContextBudget === undefined) return
    void run(async () => { await unwrap(environmentRemote.setContextBudget(value)) })
  }
  const saveMineru = async (changes: Record<string, unknown>) => run(async () => { const value = await unwrap(mineruRemote.updateConfig(changes)); setMineru(value) })
  const statusText = (key: string, ready = t('loaded')) => status[key] === 'loading' ? t('loading') : status[key] === 'error' || status[key] === 'unavailable' ? t('unavailable') : ready
  const statusClass = (key: string, configured: boolean) => status[key] === 'loading' ? css.status : status[key] === 'error' || status[key] === 'unavailable' || !configured ? css.statusBad : css.statusGood
  const configuredVariables = variables.filter(variable => variable.configured).length

  return <section className={css.root}>
    <header className={css.header}>
      <div><span className={css.eyebrow}>ZeroWall Science</span><h2>{t('title')}</h2></div>
      <span className={css.securityNote}>{t('securityNote')}</span>
    </header>
    {error ? <p className={css.error} role="alert">{renderMessage(error, t)}</p> : null}
    <div className={css.grid}>
      <details className={css.card} open>
        <summary className={css.cardSummary}><div className={css.cardHeader}><div><h3>{t('contextBudgetTitle')}</h3><p>{t('contextBudgetDescription')}</p></div></div></summary>
        <label className={css.field}><span>{t('contextBudgetTitle')}</span><output className={css.budgetValue}>{Math.round(contextBudget / 1000)}k</output><input className={css.budgetSlider} type="range" min={32_000} max={1_000_000} step={4_000} value={contextBudget} disabled={busy || environmentRemote?.setContextBudget === undefined} aria-label={t('contextBudgetTitle')} aria-valuetext={`${Math.round(contextBudget / 1000)}k tokens`} onChange={event => setContextBudget(Number(event.target.value))} onPointerUp={event => saveContextBudget(Number(event.currentTarget.value))} onKeyUp={event => saveContextBudget(Number(event.currentTarget.value))} /><small>{t('contextBudgetDescription')}</small></label>
      </details>
      <details className={css.card}>
        <summary className={css.cardSummary}><div className={css.cardHeader}><div><h3>rdatalinux rmcp</h3><p>{t('rmcpDescription')}</p></div><span className={statusClass('rdatalinux', rdatalinuxConfigured)}>{statusText('rdatalinux', rdatalinuxConfigured ? t('configured') : t('missingFailed'))}</span></div></summary>
        <label className={css.field}><span>Endpoint</span><input className={css.control} value={rdatalinuxEndpoint} readOnly /></label>
        <div className={css.keyRow}><input className={css.control} type="password" placeholder={t('enterMcpKey')} value={rdatalinuxAuthorization} onChange={event => setRdatalinuxAuthorization(event.target.value)} autoComplete="off" /><button className={css.primaryButton} type="button" disabled={busy || !rdatalinuxAuthorization.trim() || !mcpRemote?.setRdatalinuxAuthorization} onClick={saveRdatalinux}>{t('saveKey')}</button><button className={css.secondaryButton} type="button" disabled={busy || !rdatalinuxConfigured || !mcpRemote?.clearRdatalinuxAuthorization} onClick={() => void run(async () => { await unwrap(mcpRemote.clearRdatalinuxAuthorization()); await refreshCredentials(); setRdatalinuxConnection('') })}>{t('clear')}</button><button className={css.secondaryButton} type="button" disabled={busy || !mcpRemote?.list} onClick={() => void run(async () => { const rows = await unwrap(mcpRemote.list()); const record = rows.find((row: any) => row.serverName === 'rmcp'); if (!record) throw new LocalizedError('rmcpMissing'); const value = await unwrap(mcpRemote.reload(record.id)); if (value.runtimeState !== 'active') throw new Error(value.runtimeError || t('rmcpUnavailable')); setRdatalinuxConnection({ key: 'connectedTools', params: { count: (value.tools ?? []).length } }) })}>{t('testConnection')}</button></div>
        {rdatalinuxConnection ? <p className={css.muted} role="status">{renderMessage(rdatalinuxConnection, t)}</p> : null}
      </details>

      <LiteratureSettings remote={pubmedRemote} unwrap={unwrap} t={t} refreshToken={credentialRefresh} />

      <details className={css.card}>
        <summary className={css.cardSummary}><div className={css.cardHeader}><div><h3>{t('mineruTitle')}</h3><p>{t('mineruDescription')}</p></div><span className={statusClass('mineru', mineru.tokenConfigured)}>{statusText('mineru', mineru.tokenConfigured ? t('tokenConfigured') : t('missingFailed'))}</span></div></summary>
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
      </details>

      <details className={css.card}>
        <summary className={css.cardSummary}><div className={css.cardHeader}><div><h3>SciMaster</h3><p>{t('sciDescription')}</p></div><span className={statusClass('mcp', sciConfigured)}>{statusText('mcp', sciConfigured ? t('configured') : t('missingFailed'))}</span></div></summary>
        <div className={css.keyRow}><input className={css.control} type="password" placeholder={t('enterSciKey')} value={sciKey} onChange={event => setSciKey(event.target.value)} autoComplete="off" /><button className={css.primaryButton} type="button" disabled={busy || !sciKey.trim() || mcpRemote?.setSciMasterApiKey === undefined} onClick={() => void saveSci()}>{t('saveKey')}</button><button className={css.secondaryButton} type="button" disabled={busy || !sciConfigured || mcpRemote?.clearSciMasterApiKey === undefined} onClick={() => void run(async () => { await unwrap(mcpRemote.clearSciMasterApiKey()); await refreshCredentials() })}>{t('clear')}</button></div>
        <a className={css.helpLink} href={SCI_MASTER_KEY_URL} target="_blank" rel="noreferrer">{t('getSciKey')}</a>
      </details>

      <details className={css.card}>
        <summary className={css.cardSummary}><div className={css.cardHeader}><div><h3>{t('chemTitle')}</h3><p>{t('chemDescription')}</p></div><span className={statusClass('chem', chemConfigured)}>{statusText('chem', chemConfigured ? t('tokenConfigured') : t('missingFailed'))}</span></div></summary>
        <div className={css.keyRow}>
          <input className={css.control} aria-label={t('chemToken')} type="password" placeholder={t('enterChemToken')} value={chemKey} onChange={event => setChemKey(event.target.value)} autoComplete="off" />
          <button className={css.primaryButton} type="button" disabled={busy || !chemKey.trim() || !mcpRemote?.setHuagongsheApiKey} onClick={() => void run(async () => { const value = await unwrap(mcpRemote.setHuagongsheApiKey(chemKey)); setChemConfigured(true); setChemKey(''); setChemConnection({ key: value.runtimeState === 'active' ? 'connected' : 'tokenSaved' }) })}>{t('saveToken')}</button>
          <button className={css.secondaryButton} type="button" disabled={busy || !chemConfigured} onClick={() => void run(async () => { await unwrap(mcpRemote.clearHuagongsheApiKey()); await refreshCredentials(); setChemConnection('') })}>{t('clear')}</button>
          <button className={css.secondaryButton} type="button" disabled={busy || !mcpRemote?.list} onClick={() => void run(async () => { const rows = await unwrap(mcpRemote.list()); const record = rows.find((row: any) => row.serverName === 'huagongshe'); if (!record) throw new LocalizedError('chemMissing'); const value = await unwrap(mcpRemote.reload(record.id)); if (value.runtimeState !== 'active') throw new Error(value.runtimeError || t('chemUnavailable')); setChemConnection({ key: 'connectedTools', params: { count: value.tools.length } }) })}>{t('testConnection')}</button>
        </div>
        <a className={css.helpLink} href="https://huagongshe.com/mcp-guide" target="_blank" rel="noreferrer">{t('getChemToken')}</a>
        {chemConnection ? <p className={css.muted} role="status">{renderMessage(chemConnection, t)}</p> : null}
      </details>

      <details className={css.card}>
        <summary className={css.cardSummary}><div className={css.cardHeader}><div><h3>{t('imageTitle')}</h3><p>{t('imageDescription')}</p></div><span className={statusClass('image', Boolean(imageModelValue))}>{statusText('image', imageModelValue ? t('configured') : t('missingFailed'))}</span></div></summary>
        <label className={css.field}><span>{t('currentImageModel')}</span><select className={css.control} value={imageModelIsKnown ? imageModelValue : ''} disabled={busy || status.account !== 'ready'} onChange={event => { const [providerId = '', groupId = '', modelId = '', profileId = ''] = event.target.value.split(VALUE_SEPARATOR); saveImageSelection({ providerId, groupId, modelId, ...(profileId ? { profileId } : {}) }) }}><option value="">{t("selectImageModel")}</option>{!imageModelIsKnown && imageModelValue ? <option value={imageModelValue}>{image.providerId} / {image.modelId}{t('currentConfig')}</option> : null}{imageGroups.map(group => <optgroup key={`${group.providerId}${VALUE_SEPARATOR}${group.groupId}`} label={group.label}>{group.models.map((model: any) => <option key={`${model.providerId}${VALUE_SEPARATOR}${model.groupId}${VALUE_SEPARATOR}${model.modelId}${VALUE_SEPARATOR}${model.profileId}`} value={`${model.providerId}${VALUE_SEPARATOR}${model.groupId}${VALUE_SEPARATOR}${model.modelId}${VALUE_SEPARATOR}${model.profileId ?? ""}`}>{model.modelId}{model.name && model.name !== model.modelId ? ` · ${model.name}` : ''}</option>)}</optgroup>)}</select></label>
        {!imageModelIsKnown && imageModelValue && <p role="alert">历史模型或能力配置已失效，请重新选择。</p>}
        {imageModels.filter((m:any) => mediaIdentity(m) === mediaIdentity(image)).map((m:any) => <div key={`${m.providerId}${VALUE_SEPARATOR}${m.groupId}${VALUE_SEPARATOR}${m.modelId}${VALUE_SEPARATOR}${m.profileId}`}>
          {([['resolution','分辨率',m.resolutions],['aspectRatio','比例',m.aspectRatios]] as const).map(([key,label,values]) => values?.length ? <label className={css.field} key={key}><span>{label}</span><select className={css.control} value={image[key] ?? ''} disabled={busy} onChange={event=>saveImageSelection({...image,[key]:event.target.value})}><option value="">默认</option>{values.map((v:string)=><option key={v}>{v}</option>)}</select></label> : null)}
        </div>)}
        <label className={css.field}><span>{t('defaultQuality')}</span><select className={css.control} value={imageQuality} disabled={busy} onChange={event => saveImageQuality(event.target.value as ImageGenerationQuality)}>{!imageQualityChoices.includes(imageQuality) && <option value={imageQuality} disabled>{t(imageQuality)}{t("currentConfig")}</option>}{imageQualityChoices.map(quality => <option key={quality} value={quality}>{t(quality as ImageGenerationQuality)}</option>)}</select><small>{t('qualityNote')}</small></label>
      </details>

      <details className={`${css.card} ${css.variablesCard}`}>
        <summary className={css.cardSummary}><div className={css.cardHeader}><div><h3>{t('variablesTitle')}</h3><p>{t('variablesDescription')}</p></div><span className={statusClass('variables', variables.length > 0 && configuredVariables === variables.length)}>{statusText('variables', t('configuredCount', { configured: configuredVariables, total: variables.length }))}</span></div></summary>
        <div className={css.variableList}>{variables.length === 0 ? <span className={css.muted}>{status.variables === 'error' ? t('unavailable') : t('noVariables')}</span> : variables.map(variable => <div className={css.variableRow} key={variable.name}><code>{variable.name}</code><span className={variable.configured ? css.variableConfigured : css.variableMissing}>{variable.source === 'official' ? t('officialSource') : variable.source === 'environment' ? t('environmentSource') : variable.source === 'user' ? t('userSource') : variable.configured ? t('configured') : t('notConfigured')}</span><div className={css.variableActions}>{variable.configured && <button className={css.textButton} type="button" disabled={busy} onClick={() => void viewVariable(variable.name)}>{t('viewVariable')}</button>}<button className={css.textButton} type="button" disabled={busy} onClick={() => editVariable(variable.name)}>{t('editVariable')}</button><button className={css.textButton} type="button" disabled={busy} onClick={() => setVariableAction({ kind: 'delete', name: variable.name })}>{t('delete')}</button></div></div>)}</div>
        <div className={css.variableForm}><input className={css.control} placeholder={t('variableName')} value={newName} onChange={event => setNewName(event.target.value)} /><input className={css.control} type="password" placeholder={t('variableValue')} value={newValue} onChange={event => setNewValue(event.target.value)} autoComplete="off" /><button className={css.primaryButton} type="button" disabled={busy || !newName.trim() || !newValue.trim()} onClick={() => void saveVariable()}>{t('addVariable')}</button><button className={css.secondaryButton} type="button" disabled={busy || environmentRemote?.restoreOfficialDefaults === undefined} onClick={() => setVariableAction({ kind: 'sync' })}>{t('syncOfficialDefaults')}</button></div>
      </details>
    </div>
    {variableAction && <VariableActionDialog action={variableAction} busy={busy} error={renderMessage(error, t)} t={t} cancel={cancelVariableAction} confirm={confirmVariableAction} />}
    {viewingVariable !== undefined && createPortal(<dialog ref={variableDialog} className={css.variableDialog} aria-labelledby="environment-variable-title" onCancel={() => setViewingVariable(undefined)} onClick={event => { if (event.target === event.currentTarget) setViewingVariable(undefined) }}>
      <header className={css.variableDialogHeader}><div><span className={css.eyebrow}>{t('variablesTitle')}</span><h3 id="environment-variable-title">{viewingVariable.name}</h3></div><button className={css.iconButton} type="button" aria-label={t('close')} onClick={() => setViewingVariable(undefined)}><X size={17} /></button></header>
      <div className={css.variableValueBox}><input readOnly aria-label={t('variableValue')} type={variableRevealed ? 'text' : 'password'} value={viewingVariable.value} autoComplete="off" /><button className={css.iconButton} type="button" aria-label={t(variableRevealed ? 'hideValue' : 'showValue')} onClick={() => setVariableRevealed(value => !value)}>{variableRevealed ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
      {variableCopyError && <p className={css.error} role="alert">{t('copyFailed')}</p>}
      <footer className={css.variableDialogFooter}><span role="status">{variableCopied ? <><Check size={14} />{t('copied')}</> : t('valuePrivacy')}</span><button className={css.primaryButton} type="button" onClick={() => void copyVariable()}><Copy size={14} />{t('copyValue')}</button></footer>
    </dialog>, document.body)}
  </section>
}
