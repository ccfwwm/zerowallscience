import { useEffect, useMemo, useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ScientificEngineConfig, ScientificEngineHealth, ScientificEngineId, ScientificEngineStatus } from '../shared/types.js'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'

type Remote = TypertRemoteNamespaceMap['zerowallResearch']
/** Managed atlas state as returned by the Host install action. */
interface ManagedAtlasState { status?: string; directory?: string; name?: string; atlasVersion?: string | null; shape?: number[] | null; resolution?: number[] | null; regionCount?: number | null }
type EngineApi = Omit<Remote, 'installBrainAtlas'> & {
  getScientificEngineConfigs?: (input: { sessionId: string }) => Promise<RemoteResult<ScientificEngineConfig[]>>
  setScientificEngineConfig?: (input: { sessionId: string; config: ScientificEngineConfig }) => Promise<RemoteResult<ScientificEngineConfig>>
  resetScientificEngineConfig?: (input: { sessionId: string; engine: ScientificEngineId }) => Promise<RemoteResult<ScientificEngineConfig>>
  probeScientificEngine?: (input: { sessionId: string; engine: ScientificEngineId }) => Promise<RemoteResult<ScientificEngineStatus>>
  installBrainAtlas?: (input: { sessionId: string; atlasDirectory?: string }) => Promise<RemoteResult<{ atlas?: ManagedAtlasState }>>
}

const IDS: ScientificEngineId[] = ['fiji', 'napari', 'brain-globe', 'he-python', 'he-stardist', 'remote-r']
const labels: Record<ScientificEngineId, string> = { fiji: 'Fiji / ImageJ', napari: 'napari', 'brain-globe': 'BrainGlobe', 'he-python': 'HE Python', 'he-stardist': 'HE StarDist', 'remote-r': '远程 R' }

/** Settings surface for all managed scientific engines. It only submits explicit user choices to Host. */
export function ScientificEngineCenter({ remote, sessionId }: { remote: Remote; sessionId: string }): JSX.Element {
  const api = remote as EngineApi
  const [configs, setConfigs] = useState<ScientificEngineConfig[]>([])
  const [statuses, setStatuses] = useState<Record<string, ScientificEngineStatus>>({})
  const [scope, setScope] = useState<'user' | 'project'>('user')
  const [busy, setBusy] = useState<string>()
  const [atlas, setAtlas] = useState<ManagedAtlasState>()
  const [message, setMessage] = useState('')
  const load = async (): Promise<void> => {
    if (!api.getScientificEngineConfigs) { setMessage('当前 Host 尚未提供引擎配置接口。'); return }
    try { setConfigs(unwrapRemoteResult('getScientificEngineConfigs', await api.getScientificEngineConfigs({ sessionId }))) } catch (error) { setMessage(String(error)) }
  }
  useEffect(() => { void load() }, [sessionId, remote])
  type EnginePatch = { [K in keyof ScientificEngineConfig]?: ScientificEngineConfig[K] | undefined }
  const update = (id: ScientificEngineId, patch: EnginePatch): void => setConfigs(items => items.map(item => item.id === id ? { ...item, ...patch, id: item.id } as ScientificEngineConfig : item))
  const save = async (config: ScientificEngineConfig): Promise<void> => {
    if (!api.setScientificEngineConfig) { setMessage('当前 Host 尚未提供保存接口。'); return }
    setBusy(config.id); setMessage('')
    try { const result = unwrapRemoteResult('setScientificEngineConfig', await api.setScientificEngineConfig({ sessionId, config: { ...config, source: scope } })); setConfigs(items => items.map(item => item.id === config.id ? result : item)); setMessage(`${labels[config.id]} 已保存。`) } catch (error) { setMessage(String(error)) } finally { setBusy(undefined) }
  }
  const probe = async (config: ScientificEngineConfig): Promise<void> => {
    if (!api.probeScientificEngine) { setMessage('当前 Host 尚未提供探测接口。'); return }
    setBusy(config.id); try { const result = unwrapRemoteResult('probeScientificEngine', await api.probeScientificEngine({ sessionId, engine: config.id })); setStatuses(items => ({ ...items, [config.id]: result })); setMessage(`${labels[config.id]} 探测完成。`) } catch (error) { setMessage(String(error)) } finally { setBusy(undefined) }
  }
  const installAtlas = async (config: ScientificEngineConfig): Promise<void> => {
    if (!api.installBrainAtlas) { setMessage('当前 Host 尚未提供托管图谱安装接口。'); return }
    setBusy(config.id); setMessage('正在下载托管图谱 allen_mouse_25um，可能需要数分钟；期间其他 BrainGlobe 操作不可用。')
    try {
      const result = unwrapRemoteResult('installBrainAtlas', await api.installBrainAtlas({ sessionId }))
      setAtlas(result.atlas)
      // Re-probe so the reported package/atlas state reflects the install
      // instead of the stale pre-install diagnostic.
      await probe(config)
      setMessage(`托管图谱${result.atlas?.status === 'already-present' ? '已存在并复核' : '已安装'}：${result.atlas?.directory ?? '未返回目录'}`)
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(undefined) }
  }
  const reset = async (config: ScientificEngineConfig): Promise<void> => {
    if (!api.resetScientificEngineConfig) { setMessage('当前 Host 尚未提供恢复默认接口。'); return }
    setBusy(config.id); try { const result = unwrapRemoteResult('resetScientificEngineConfig', await api.resetScientificEngineConfig({ sessionId, engine: config.id })); setConfigs(items => items.map(item => item.id === config.id ? result : item)); setMessage(`${labels[config.id]} 已恢复默认。`) } catch (error) { setMessage(String(error)) } finally { setBusy(undefined) }
  }
  const rows = useMemo(() => IDS.map(id => configs.find(item => item.id === id) ?? ({ id, enabled: true, source: scope, status: 'unknown' as ScientificEngineHealth })), [configs, scope])
  return <section aria-label="科研引擎中心" style={{ display: 'grid', gap: 12 }}>
    <header><h2>科研引擎中心</h2><p>配置路径、环境和远程端点；探测结果来自 Host，未配置环境不会被标记为可用。</p><label>作用域 <select value={scope} onChange={event => setScope(event.target.value as 'user' | 'project')}><option value="user">用户</option><option value="project">当前项目</option></select></label></header>
    {rows.map(config => { const status = statuses[config.id]; const path = config.id === 'fiji' ? (config.installDirectory ?? config.executablePath ?? '') : config.id === 'remote-r' ? (config.remoteEndpoint ?? '') : (config.pythonPath ?? config.executablePath ?? config.environmentPath ?? ''); const pathPatch = (value: string): Partial<ScientificEngineConfig> => config.id === 'fiji' ? { installDirectory: value } : config.id === 'remote-r' ? { remoteEndpoint: value } : { pythonPath: value }; return <article key={config.id} style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 12 }}><strong>{labels[config.id]}</strong><label style={{ display: 'block', marginTop: 8 }}>路径 / 环境 / 端点<input aria-label={`${labels[config.id]} 路径`} value={path} onChange={event => update(config.id, pathPatch(event.target.value))} style={{ display: 'block', width: '100%' }} /></label>{config.id === 'fiji' && <label style={{ display: 'block', marginTop: 6 }}>Fiji Java（可选）<input aria-label="Fiji Java 路径" value={config.javaPath ?? ''} onChange={event => update(config.id, event.target.value ? { javaPath: event.target.value } : { javaPath: undefined })} style={{ display: 'block', width: '100%' }} /></label>}<label><input type="checkbox" checked={config.enabled} onChange={event => update(config.id, { enabled: event.target.checked })} /> 启用</label><div style={{ display: 'flex', gap: 6, marginTop: 8 }}><button type="button" disabled={busy === config.id} onClick={() => void save(config)}>保存</button><button type="button" disabled={busy === config.id} onClick={() => void probe(config)}>测试</button><button type="button" disabled={busy === config.id} onClick={() => void reset(config)}>恢复默认</button>{config.id === 'brain-globe' && <button type="button" disabled={busy === config.id} onClick={() => void installAtlas(config)}>{busy === config.id ? '处理中…' : '安装托管图谱'}</button>}<small>{status?.status ?? config.status} · {status?.version ?? config.version ?? ''} · {status?.path ?? status?.reason ?? config.source}</small></div>{config.id === 'brain-globe' && atlas && <small style={{ display: 'block', marginTop: 4 }}>托管图谱：{atlas.status === 'installed' ? '已安装' : '已存在并复核'} · {atlas.name ?? 'allen_mouse_25um'} · {atlas.atlasVersion ?? '版本未返回'} · {atlas.shape ? `${atlas.shape.join('×')} 体素` : '形状未返回'} · {atlas.directory ?? ''}</small>}{(status?.diagnostic ?? config.diagnostic) && <details><summary>诊断</summary><pre>{status?.diagnostic ?? config.diagnostic}</pre></details>}</article> })}
    {message && <p role="status">{message}</p>}
  </section>
}
