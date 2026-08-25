import { useEffect, useMemo, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { EnvironmentVariableInfo, ImageModelSelection } from '../shared/types.js'

interface Props extends PropsRuntime<'settings.section'> {
  reviewerScope: SettingsScope<any>
  environmentRemote: any
  accountRemote: any
  mcpRemote: any
  unwrap(value: any): Promise<any>
}

export function EnvironmentSection({ reviewerScope, environmentRemote, accountRemote, mcpRemote, unwrap }: Props) {
  const reviewer = reviewerScope.getSnapshot().value ?? { autoReview: false, modelMode: 'follow-session', provider: '', model: '', reasoningEffort: '' }
  const [models, setModels] = useState<any[]>([])
  const [chatModels, setChatModels] = useState<any[]>([])
  const [variables, setVariables] = useState<EnvironmentVariableInfo[]>([])
  const [sciConfigured, setSciConfigured] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const [sciKey, setSciKey] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState<Record<string, 'loading' | 'ready' | 'unavailable' | 'error'>>({ account: 'loading', variables: 'loading', image: 'loading', mcp: 'loading' })
  const [image, setImage] = useState<ImageModelSelection>({ providerId: '', groupId: '', modelId: '' })
  useEffect(() => {
    let cancelled = false
    const load = async (key: string, task: () => Promise<void>) => {
      if (!task) { setStatus(current => ({ ...current, [key]: 'unavailable' })); return }
      try { await task(); if (!cancelled) setStatus(current => ({ ...current, [key]: 'ready' })) }
      catch { if (!cancelled) setStatus(current => ({ ...current, [key]: 'error' })) }
    }
    void load('account', async () => {
      if (accountRemote?.current === undefined) throw new Error('账户服务不可用')
      const snapshot = await unwrap(accountRemote.current()) as any
      if (cancelled) return
      const rows = Array.isArray(snapshot?.models) ? snapshot.models : []
      setModels(rows.filter((m: any) => m.capability === 'image-generation'))
      setChatModels(rows.filter((m: any) => m.capability !== 'image-generation'))
    })
    void load('variables', async () => {
      if (environmentRemote?.listVariables === undefined) throw new Error('环境变量服务不可用')
      setVariables(await unwrap(environmentRemote.listVariables()) as EnvironmentVariableInfo[])
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
  }, [accountRemote, environmentRemote, mcpRemote, unwrap])
  const reviewerModels = useMemo(() => chatModels, [chatModels])
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(''); try { await action() } catch (value) { setError(value instanceof Error ? value.message : String(value)) } finally { setBusy(false) } }
  const setReviewer = async (field: string, value: unknown) => run(async () => { await reviewerScope.set(field, value) })
  const saveVariable = async () => { if (!newName.trim() || !newValue) return; await run(async () => { setVariables(await unwrap(environmentRemote.setVariable(newName, newValue))); setNewName(''); setNewValue('') }) }
  const saveSci = async () => { if (!sciKey.trim()) return; await run(async () => { await unwrap(mcpRemote.setSciMasterApiKey(sciKey)); setSciConfigured(true); setSciKey('') }) }
  const selectedReviewerModels = reviewerModels.filter((m: any) => m.providerId === reviewer.provider)
  const selectedImageModels = models.filter((m: any) => m.providerId === image.providerId)
  return <section style={{ display: 'grid', gap: 16, maxWidth: 720 }}>
    <h2>环境配置</h2><p style={{ color: 'var(--dsw-alias-label-secondary, #667085)' }}>配置运行时使用的审核、连接和环境变量。敏感值不会显示在页面中。</p>{error ? <p role="alert" style={{ color: '#b42318' }}>{error}</p> : null}
    <fieldset><legend>Reviewer</legend>
      <label>自动审核 <input type="checkbox" checked={reviewer.autoReview} disabled={busy} onChange={e => void setReviewer('autoReview', e.target.checked)} /></label>
      <label>模型模式 <select value={reviewer.modelMode} disabled={busy} onChange={e => void setReviewer('modelMode', e.target.value)}><option value="follow-session">跟随当前对话</option><option value="fixed">固定模型</option></select></label>
      {reviewer.modelMode === 'fixed' ? <>
        <label>Provider <select value={reviewer.provider} disabled={busy} onChange={e => { void setReviewer('provider', e.target.value); void setReviewer('model', '') }}><option value="">请选择</option>{[...new Set(reviewerModels.map((m: any) => m.providerId))].map((id: string) => <option key={id} value={id}>{id}</option>)}</select></label>
        <label>模型 <select value={reviewer.model} disabled={busy} onChange={e => void setReviewer('model', e.target.value)}><option value="">请选择</option>{selectedReviewerModels.map((m: any) => <option key={m.id ?? m.modelId} value={m.id ?? m.modelId}>{m.name ?? m.modelId}</option>)}</select></label>
        <label>推理强度 <input value={reviewer.reasoningEffort ?? ''} disabled={busy} onChange={e => void setReviewer('reasoningEffort', e.target.value)} /></label>
      </> : null}
    </fieldset>
    <fieldset><legend>SciMaster</legend><p>{status.mcp === 'loading' ? '正在加载…' : status.mcp === 'unavailable' ? 'MCP 服务不可用' : sciConfigured ? '已配置' : '未配置'}</p><input type="password" placeholder="输入 SciMaster API Key" value={sciKey} onChange={e => setSciKey(e.target.value)} /><button type="button" disabled={busy || !sciKey || mcpRemote?.setSciMasterApiKey === undefined} onClick={() => void saveSci()}>保存 Key</button><button type="button" disabled={busy || !sciConfigured || mcpRemote?.clearSciMasterApiKey === undefined} onClick={() => void run(async () => { await unwrap(mcpRemote.clearSciMasterApiKey()); setSciConfigured(false) })}>清除 Key</button></fieldset>
    <fieldset><legend>生图模型</legend><select value={image.providerId} disabled={busy} onChange={e => { const next = models.find((m: any) => m.providerId === e.target.value); const value = { providerId: e.target.value, groupId: next?.groupId ?? '', modelId: '' }; setImage(value); void run(async () => { await unwrap(environmentRemote.setImageModelSelection(value)) }) }}><option value="">自动选择</option>{[...new Set(models.map((m: any) => m.providerId))].map((id: string) => <option key={id} value={id}>{id}</option>)}</select><select value={image.modelId} disabled={busy || !image.providerId} onChange={e => { const model = selectedImageModels.find((m: any) => (m.modelId ?? m.id) === e.target.value); const next = { ...image, modelId: e.target.value, groupId: model?.groupId ?? image.groupId }; setImage(next); void run(async () => { await unwrap(environmentRemote.setImageModelSelection(next)) }) }}><option value="">选择模型</option>{selectedImageModels.map((m: any) => <option key={m.modelId ?? m.id} value={m.modelId ?? m.id}>{m.modelId ?? m.name}</option>)}</select></fieldset>
    <fieldset><legend>自定义变量</legend>{variables.map(variable => <div key={variable.name}><code>{variable.name}</code><span>{variable.configured ? '已配置' : '未配置'}</span><button type="button" disabled={busy} onClick={() => void unwrap(environmentRemote.deleteVariable(variable.name)).then(setVariables)}>删除</button></div>)}<input placeholder="变量名，例如 SCI_KEY" value={newName} onChange={e => setNewName(e.target.value)} /><input type="password" placeholder="变量值" value={newValue} onChange={e => setNewValue(e.target.value)} /><button type="button" disabled={busy || !newName || !newValue} onClick={() => void saveVariable()}>添加变量</button></fieldset>
  </section>
}
