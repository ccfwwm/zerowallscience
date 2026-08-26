import { useEffect, useMemo, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { EnvironmentVariableInfo, ImageModelSelection } from '../shared/types.js'
import css from './section.module.css'

interface Props extends PropsRuntime<'settings.section'> {
  reviewerScope: SettingsScope<any>
  environmentRemote: any
  accountRemote: any
  mcpRemote: any
  unwrap(value: any): Promise<any>
  modelCatalog(check?: boolean): Promise<{ groups: any[]; failures: any[] }>
}

const defaultReviewer = { autoReview: false, modelMode: 'follow-session' as const, provider: '', model: '', reasoningEffort: '' }
const VALUE_SEPARATOR = '\u0000'
const SCI_MASTER_KEY_URL = 'https://scimaster.bohrium.com/vibe-write/home'

type LoadState = 'loading' | 'ready' | 'unavailable' | 'error'

export function EnvironmentSection({ reviewerScope, environmentRemote, accountRemote, mcpRemote, unwrap, modelCatalog }: Props) {
  const [reviewer, setReviewerValue] = useState(() => reviewerScope.getSnapshot().value ?? defaultReviewer)
  const [catalogGroups, setCatalogGroups] = useState<any[]>([])
  const [imageModels, setImageModels] = useState<any[]>([])
  const [variables, setVariables] = useState<EnvironmentVariableInfo[]>([])
  const [sciConfigured, setSciConfigured] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const [sciKey, setSciKey] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState<Record<string, LoadState>>({ account: 'loading', catalog: 'loading', variables: 'loading', image: 'loading', mcp: 'loading' })
  const [image, setImage] = useState<ImageModelSelection>({ providerId: '', groupId: '', modelId: '' })

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
      if (accountRemote?.current === undefined) throw new Error('账户服务不可用')
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
      if (environmentRemote?.listVariables === undefined) throw new Error('环境变量服务不可用')
      const value = await unwrap(environmentRemote.listVariables())
      if (!cancelled) setVariables(Array.isArray(value) ? value : [])
    })
    void load('image', async () => {
      if (environmentRemote?.getImageModelSelection === undefined) throw new Error('生图配置服务不可用')
      const value = await unwrap(environmentRemote.getImageModelSelection()) as ImageModelSelection | undefined
      if (!cancelled && value) setImage(value)
    })
    void load('mcp', async () => {
      if (mcpRemote?.getSciMasterCredentialStatus === undefined) throw new Error('MCP 服务不可用')
      const value = await unwrap(mcpRemote.getSciMasterCredentialStatus()) as any
      if (!cancelled) setSciConfigured(value?.configured === true)
    })
    return () => { cancelled = true }
  }, [accountRemote, environmentRemote, mcpRemote, modelCatalog, unwrap])

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
      const group = groups.get(key) ?? { providerId: model.providerId, groupId: model.groupId, label: model.groupName ?? model.groupId, models: [] }
      group.models.push(model)
      groups.set(key, group)
    }
    return [...groups.values()]
  }, [imageModels])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try { await action() } catch (value) { setError(value instanceof Error ? value.message : String(value)) } finally { setBusy(false) }
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
  const statusText = (key: string, ready = '已加载') => status[key] === 'loading' ? '正在加载…' : status[key] === 'error' || status[key] === 'unavailable' ? '服务暂不可用' : ready

  return <section className={css.root}>
    <header className={css.header}>
      <div><span className={css.eyebrow}>ZeroWall Science</span><h2>环境配置</h2><p>集中管理审核模型、SciMaster、生图模型和运行时变量。</p></div>
      <span className={css.securityNote}>敏感值仅保存在本机安全存储中</span>
    </header>
    {error ? <p className={css.error} role="alert">{error}</p> : null}
    <div className={css.grid}>
      <article className={css.card}>
        <div className={css.cardHeader}><div><h3>Reviewer</h3><p>审核使用设置中的模型目录，不单独维护供应商。</p></div><span className={css.status}>{statusText('catalog', '模型目录已同步')}</span></div>
        <div className={css.formGrid}>
          <label className={css.checkboxField}><input type="checkbox" checked={reviewer.autoReview === true} disabled={busy} onChange={event => void setReviewer('autoReview', event.target.checked)} /><span>启用自动审核</span></label>
          <label className={css.field}><span>审核模型模式</span><select className={css.control} value={reviewer.modelMode ?? 'follow-session'} disabled={busy} onChange={event => void setReviewer('modelMode', event.target.value)}><option value="follow-session">跟随当前对话模型</option><option value="fixed">固定审核模型</option></select></label>
          {reviewer.modelMode === 'fixed' ? <>
            <label className={`${css.field} ${css.fullWidth}`}><span>审核模型</span><select className={css.control} value={reviewerModelIsKnown ? reviewerModelValue : ''} disabled={busy || reviewerModels.length === 0} onChange={event => selectReviewerModel(event.target.value)}><option value="">请选择模型</option>{!reviewerModelIsKnown && reviewer.provider && reviewer.model ? <option value={reviewerModelValue}>{reviewer.provider} / {reviewer.model}（当前配置）</option> : null}{catalogGroups.map((group: any) => <optgroup key={group.id} label={group.name ?? group.id}>{(Array.isArray(group.models) ? group.models : []).map((model: any) => <option key={`${group.id}${VALUE_SEPARATOR}${model.id}`} value={`${group.id}${VALUE_SEPARATOR}${model.id}`}>{model.name ?? model.id}</option>)}</optgroup>)}</select></label>
            <label className={css.field}><span>推理强度</span><select className={css.control} value={reviewer.reasoningEffort ?? ''} disabled={busy || reviewerEfforts.length === 0} onChange={event => void setReviewer('reasoningEffort', event.target.value)}><option value="">跟随模型默认{selectedReviewerModel?.reasoning?.defaultEffort ? `（${selectedReviewerModel.reasoning.defaultEffort}）` : ''}</option>{reviewer.reasoningEffort && !reviewerEfforts.some((effort: any) => effort.id === reviewer.reasoningEffort) ? <option value={reviewer.reasoningEffort}>{reviewer.reasoningEffort}（当前配置）</option> : null}{reviewerEfforts.map((effort: any) => <option key={effort.id} value={effort.id}>{effort.name ?? effort.id}</option>)}</select><small>{reviewerEfforts.length === 0 ? '当前模型未声明可选推理强度' : '可按模型目录提供的能力选择'}</small></label>
          </> : null}
        </div>
      </article>

      <article className={css.card}>
        <div className={css.cardHeader}><div><h3>SciMaster</h3><p>用于科研写作和 MCP 服务连接。</p></div><span className={sciConfigured ? css.statusGood : css.status}>{status.mcp === 'loading' ? '正在加载…' : sciConfigured ? '已配置' : '未配置'}</span></div>
        <div className={css.keyRow}><input className={css.control} type="password" placeholder="输入 SciMaster API Key" value={sciKey} onChange={event => setSciKey(event.target.value)} autoComplete="off" /><button className={css.primaryButton} type="button" disabled={busy || !sciKey.trim() || mcpRemote?.setSciMasterApiKey === undefined} onClick={() => void saveSci()}>保存 Key</button><button className={css.secondaryButton} type="button" disabled={busy || !sciConfigured || mcpRemote?.clearSciMasterApiKey === undefined} onClick={() => void run(async () => { await unwrap(mcpRemote.clearSciMasterApiKey()); setSciConfigured(false) })}>清除</button></div>
        <a className={css.helpLink} href={SCI_MASTER_KEY_URL} target="_blank" rel="noreferrer">打开 SciMaster 获取 API Key ↗</a>
      </article>

      <article className={css.card}>
        <div className={css.cardHeader}><div><h3>生图模型</h3><p>只显示账户模型目录中明确支持生图的候选项。</p></div><span className={css.status}>{statusText('account', '候选模型已同步')}</span></div>
        <label className={css.field}><span>当前生图模型</span><select className={css.control} value={imageModelIsKnown ? imageModelValue : ''} disabled={busy || status.account !== 'ready'} onChange={event => { const [providerId = '', groupId = '', modelId = ''] = event.target.value.split(VALUE_SEPARATOR); saveImageSelection({ providerId, groupId, modelId }) }}><option value="">自动选择</option>{!imageModelIsKnown && imageModelValue ? <option value={imageModelValue}>{image.providerId} / {image.modelId}（当前配置）</option> : null}{imageGroups.map(group => <optgroup key={`${group.providerId}${VALUE_SEPARATOR}${group.groupId}`} label={group.label}>{group.models.map((model: any) => <option key={`${model.providerId}${VALUE_SEPARATOR}${model.groupId}${VALUE_SEPARATOR}${model.modelId}`} value={`${model.providerId}${VALUE_SEPARATOR}${model.groupId}${VALUE_SEPARATOR}${model.modelId}`}>{model.modelId}{model.name && model.name !== model.modelId ? ` · ${model.name}` : ''}</option>)}</optgroup>)}</select></label>
      </article>

      <article className={`${css.card} ${css.variablesCard}`}>
        <div className={css.cardHeader}><div><h3>自定义变量</h3><p>变量可供 Host、MCP 和允许继承环境的子进程使用。</p></div><span className={css.status}>{statusText('variables', `${variables.length} 个变量`)}</span></div>
        <div className={css.variableList}>{variables.length === 0 ? <span className={css.muted}>暂无变量</span> : variables.map(variable => <div className={css.variableRow} key={variable.name}><code>{variable.name}</code><span>{variable.configured ? '已配置' : '未配置'}</span><button className={css.textButton} type="button" disabled={busy} onClick={() => void run(async () => setVariables(await unwrap(environmentRemote.deleteVariable(variable.name))))}>删除</button></div>)}</div>
        <div className={css.variableForm}><input className={css.control} placeholder="变量名，例如 SCI_KEY" value={newName} onChange={event => setNewName(event.target.value)} /><input className={css.control} type="password" placeholder="变量值" value={newValue} onChange={event => setNewValue(event.target.value)} autoComplete="off" /><button className={css.primaryButton} type="button" disabled={busy || !newName.trim() || !newValue} onClick={() => void saveVariable()}>添加变量</button></div>
      </article>
    </div>
  </section>
}
