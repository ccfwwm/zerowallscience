import { useEffect, useMemo, useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ScientificEngineConfig, ScientificEngineHealth, ScientificEngineId, ScientificEngineStatus } from '../shared/types.js'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'
import { NativeEnginePanel } from './native-engine-panel.js'

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
const pathLabels: Record<ScientificEngineId, string> = {
  fiji: 'Fiji / ImageJ 程序路径', napari: 'ZeroWall 共享 Python 环境',
  'brain-globe': 'ZeroWall Python（共享运行环境）', 'he-python': 'ZeroWall Python（HE 运行环境）',
  'he-stardist': 'ZeroWall Python（StarDist 运行环境）', 'remote-r': 'RMCP 服务地址',
}
const descriptions: Record<ScientificEngineId, string> = {
  fiji: '此路径用于本机启动 Fiji / ImageJ，可按需自定义。',
  napari: 'napari 使用软件唯一的共享 Python；优先发现共享 site-packages 中的 napari.exe，找不到时使用共享 Python -m napari。',
  'brain-globe': 'BrainGlobe 使用软件集成的 Python；图谱由应用托管在本机数据目录。此路径由运行时统一解析。',
  'he-python': 'HE 查看和相关任务使用软件集成的 Python，不创建第二套虚拟环境。',
  'he-stardist': '当前 HE 分割 runner 使用共享 Python 的 StarDist2D API 和冻结的 H&E 模型。stardist-predict2d.exe / stardist-predict3d.exe 是同环境命令入口；此 runner 不调用 Fiji / ImageJ。',
  'remote-r': '远程 R 通过 RMCP MCP 连接器访问；此处显示连接器采用的默认服务地址。',
}
function pathValue(config: ScientificEngineConfig, status?: ScientificEngineStatus): string {
  if (config.id === 'fiji') return config.installDirectory ?? config.executablePath ?? ''
  if (config.id === 'remote-r') return config.remoteEndpoint ?? ''
  return status?.path ?? status?.version ?? '由软件共享 Python 环境统一管理'
}
function pathPatch(id: ScientificEngineId, value: string): Partial<ScientificEngineConfig> {
  if (id === 'fiji') return { installDirectory: value }
  return {}
}
function editable(id: ScientificEngineId): boolean { return id === 'fiji' }

/** Settings surface for all managed scientific engines. It only submits explicit user choices to Host. */
export function ScientificEngineCenter({ remote, sessionId, showLaunch = true }: { remote: Remote; sessionId: string; showLaunch?: boolean }): JSX.Element {
  const api = remote as EngineApi
  const [configs, setConfigs] = useState<ScientificEngineConfig[]>([])
  const [statuses, setStatuses] = useState<Record<string, ScientificEngineStatus>>({})
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
    try { const result = unwrapRemoteResult('setScientificEngineConfig', await api.setScientificEngineConfig({ sessionId, config })); setConfigs(items => items.map(item => item.id === config.id ? result : item)); setMessage(`${labels[config.id]} 已保存。`) } catch (error) { setMessage(String(error)) } finally { setBusy(undefined) }
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
  const rows = useMemo(() => IDS.map(id => configs.find(item => item.id === id) ?? ({ id, enabled: true, source: 'default' as const, status: 'unknown' as ScientificEngineHealth })), [configs])
  return <section aria-label="科研引擎中心" style={{ display: 'grid', gap: 12 }}>
    <header><h2>科研引擎中心</h2><p>本机可配置 Fiji 路径；napari、BrainGlobe 和 HE 共用软件的唯一 Python 环境。</p></header>
    {rows.map(config => {
      const status = statuses[config.id]
      const canEdit = editable(config.id)
      const value = pathValue(config, status)
      return <article key={config.id} style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 12 }}>
        <strong>{labels[config.id]}</strong>
        <label style={{ display: 'block', marginTop: 8 }}>{pathLabels[config.id]}<input aria-label={`${labels[config.id]} 路径`} value={value} readOnly={!canEdit} onChange={event => update(config.id, pathPatch(config.id, event.target.value))} style={{ display: 'block', width: '100%', boxSizing: 'border-box' }} /></label>
        <small style={{ display: 'block', marginTop: 5 }}>{descriptions[config.id]}</small>
        {config.id === 'fiji' && <label style={{ display: 'block', marginTop: 6 }}>Fiji Java（可选）<input aria-label="Fiji Java 路径" value={config.javaPath ?? ''} onChange={event => update(config.id, event.target.value ? { javaPath: event.target.value } : { javaPath: undefined })} style={{ display: 'block', width: '100%' }} /></label>}
        {canEdit && <label><input type="checkbox" checked={config.enabled} onChange={event => update(config.id, { enabled: event.target.checked })} /> 启用</label>}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {canEdit && <button type="button" disabled={busy === config.id} onClick={() => void save(config)}>保存</button>}
          <button type="button" disabled={busy === config.id} onClick={() => void probe(config)}>测试</button>
          {canEdit && <button type="button" disabled={busy === config.id} onClick={() => void reset(config)}>恢复默认</button>}
          {config.id === 'brain-globe' && <button type="button" disabled={busy === config.id} onClick={() => void installAtlas(config)}>{busy === config.id ? '处理中…' : '安装托管图谱'}</button>}
          <small>{status?.status ?? config.status} · {status?.version ?? config.version ?? ''} · {status?.path ?? status?.reason ?? config.source}</small>
        </div>
        {config.id === 'brain-globe' && atlas && <small style={{ display: 'block', marginTop: 4 }}>托管图谱：{atlas.status === 'installed' ? '已安装' : '已存在并复核'} · {atlas.name ?? 'allen_mouse_25um'} · {atlas.atlasVersion ?? '版本未返回'} · {atlas.shape ? `${atlas.shape.join('×')} 体素` : '形状未返回'} · {atlas.directory ?? ''}</small>}
        {(status?.diagnostic ?? config.diagnostic) && <details><summary>诊断</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{status?.diagnostic ?? config.diagnostic}</pre></details>}
      </article>
    })}
    {showLaunch && <section aria-label="科研引擎启动" style={{ display: 'grid', gap: 8 }}><h3>本机查看器启动</h3><NativeEnginePanel remote={remote} sessionId={sessionId} /></section>}
    {message && <p role="status">{message}</p>}
  </section>
}
