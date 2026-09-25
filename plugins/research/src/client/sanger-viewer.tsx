import { useEffect, useMemo, useRef, useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { DataAssetRecord, ViewerSessionRecord } from '@zerowallscience/research-store/types'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'
import type { BidirectionalSangerReview, SangerAnalysis, SangerTrace } from '../shared/sanger.js'
import type { ScienceViewerRequest } from '../shared/types.js'
import { useWorkbenchSelection } from './workbench-selection.js'

type Remote = TypertRemoteNamespaceMap['zerowallResearch']
type SangerResponse = { trace?: SangerTrace; analysis?: SangerAnalysis; review?: BidirectionalSangerReview; viewer?: ViewerSessionRecord; artifact?: { name: string; uri: string; checksum: string } }
const colours = { A: '#2f8f46', C: '#2867b2', G: '#a06b00', T: '#b52b3b' } as const

export function SangerViewer({ remote, sessionId, viewOnly = false, onPickFile }: { remote: Remote; sessionId: string; viewOnly?: boolean; onPickFile?: () => void }): JSX.Element {
  const [assets, setAssets] = useState<DataAssetRecord[]>([])
  const [viewers, setViewers] = useState<ViewerSessionRecord[]>([])
  const [assetId, setAssetId] = useState('')
  const [viewer, setViewer] = useState<ViewerSessionRecord>()
  const [trace, setTrace] = useState<SangerTrace>()
  const [analysis, setAnalysis] = useState<SangerAnalysis>()
  const [review, setReview] = useState<BidirectionalSangerReview>()
  const [threshold, setThreshold] = useState(.8)
  const [window, setWindow] = useState(5)
  const [reference, setReference] = useState('')
  const [reverseViewerId, setReverseViewerId] = useState('')
  const [editPosition, setEditPosition] = useState(1)
  const [editCall, setEditCall] = useState('N')
  const [editReason, setEditReason] = useState('')
  const [sampleStart, setSampleStart] = useState(0)
  const [sampleWindow, setSampleWindow] = useState(2000)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const selection = useWorkbenchSelection()
  const handled = useRef('')
  const call = async (input: Omit<ScienceViewerRequest, 'sessionId'>): Promise<SangerResponse & { assets?: DataAssetRecord[]; viewers?: ViewerSessionRecord[] }> => { const result = unwrapRemoteResult('scienceViewer', await remote.scienceViewer({ ...input, sessionId })) as unknown as SangerResponse & { sanger?: SangerResponse; assets?: DataAssetRecord[]; viewers?: ViewerSessionRecord[] }; return result.sanger ?? result }
  const refresh = async (): Promise<void> => {
    const current = generation.current
    const response = await call({ action: 'list' })
    if (current !== generation.current) return
    setAssets(response.assets ?? []); setViewers((response.viewers ?? []).filter(item => item.state.traceTool === 'sanger'))
  }
  useEffect(() => { const current = ++generation.current; setAssets([]); setViewers([]); setAssetId(''); setReference(''); setThreshold(.8); setWindow(5); setViewer(undefined); setTrace(undefined); setAnalysis(undefined); setMessage(''); setBusy(false); setReview(undefined); setReverseViewerId(''); setEditPosition(1); setEditCall('N'); setEditReason(''); setSampleStart(0); void refresh().catch(error => { if (current === generation.current) setMessage(String(error)) }); return () => { generation.current++ } }, [remote, sessionId])
  const run = async (input: Omit<ScienceViewerRequest, 'sessionId'>): Promise<void> => {
    if (busy) return
    const current = generation.current
    setBusy(true); setMessage('')
    try {
      const response = await call(input)
      if (current !== generation.current) return
      if (response.viewer) { setViewer(response.viewer); setThreshold(Number(response.viewer.state.threshold)); setWindow(Number(response.viewer.state.window)); setReference(String(response.viewer.state.reference ?? '')) }
      if (response.trace) setTrace(response.trace)
      setAnalysis(response.analysis)
      setReview(response.review)
      if (response.artifact) setMessage(`已登记产物：${response.artifact.name}\n${response.artifact.uri}\nSHA-256: ${response.artifact.checksum}`)
      await refresh()
    } catch (error) { if (current === generation.current) setMessage(error instanceof Error ? error.message : String(error)) } finally { if (current === generation.current) setBusy(false) }
  }
  // Mirror the workbench sidebar pick into the local dropdown, so the panel shows
  // the file the user selected. An empty selection leaves the dropdown untouched,
  // because then the user is choosing inside the viewer.
  useEffect(() => { if (selection.assetId) setAssetId(selection.assetId) }, [selection.assetId])
  useEffect(() => {
    if (!selection.assetId || selection.revision == null) return
    // Keyed by revision: selecting the same asset again is a second request, but a
    // re-render of the same selection must not reissue the remote open call.
    const key = `${selection.assetId}:${selection.revision}`
    if (handled.current === key) return
    handled.current = key
    // Fired from the effect, so it runs before any user interaction can flip run()'s
    // busy guard and swallow the requested open.
    void run({ action: 'sanger_open', assetId: selection.assetId })
  }, [selection.assetId, selection.revision])
  const traces = useMemo(() => trace ? trace.channels : undefined, [trace])
  const start = Math.min(sampleStart, Math.max(0, (trace?.sampleCount ?? 1) - 1))
  const end = Math.min(trace?.sampleCount ?? 0, start + sampleWindow)
  const displayed = useMemo(() => traces ? { A: traces.A.slice(start, end), C: traces.C.slice(start, end), G: traces.G.slice(start, end), T: traces.T.slice(start, end) } : undefined, [traces, start, end])
  const max = useMemo(() => { let result = 1; for (const channel of Object.values(displayed ?? {})) for (const value of channel) result = Math.max(result, value); return result }, [displayed])
  const width = 860; const height = 220
  const path = (values: number[]): string => values.length < 2 ? '' : values.map((value, index) => `${index ? 'L' : 'M'} ${(index / (values.length - 1)) * width} ${height - (value / max) * (height - 18)}`).join(' ')
  if (viewOnly) return <section data-empty={!trace} aria-label="Sanger 峰图查看器"><div><button type="button" data-choose-file="true" onClick={onPickFile}>选择文件</button><select aria-label="Sanger 资产" value={assetId} onChange={event => setAssetId(event.target.value)}><option value="">选择 SCF/AB1 资产</option>{assets.filter(asset => /\.(scf|ab1)$/iu.test(asset.uri)).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select><button type="button" disabled={!assetId || busy} onClick={() => void run({ action: 'sanger_open', assetId })}>打开</button></div><p role="status">{busy ? '正在加载' : message ? `打开失败：${message}` : trace ? '已加载' : '未选择文件'}</p>{trace && <><p>{assets.find(asset => asset.id === viewer?.assetId)?.name} · {trace.sampleCount} samples · {trace.bases.length} calls</p><div><label>显示起点 <input aria-label="峰图样本起点" type="number" min={0} max={Math.max(0, trace.sampleCount - 1)} value={start} onChange={event => setSampleStart(Math.max(0, Math.trunc(Number(event.target.value))))} /></label><label>显示窗口 <input aria-label="峰图样本窗口" type="number" min={50} max={10000} value={sampleWindow} onChange={event => setSampleWindow(Math.min(10000, Math.max(50, Math.trunc(Number(event.target.value)))))}/></label></div><div style={{ overflowX: 'auto' }}><svg role="img" aria-label="四色 Sanger 峰图" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>{(['A', 'C', 'G', 'T'] as const).map(base => <path key={base} d={path(displayed?.[base] ?? [])} fill="none" stroke={colours[base]} strokeWidth="1.3" />)}{trace.bases.filter(base => base.peak >= start && base.peak < end).slice(0, 300).map(base => <text key={base.position} x={(base.peak - start) / Math.max(1, end - start - 1) * width} y={13} fontSize={11} fill={colours[base.base as keyof typeof colours] ?? '#353b39'}>{base.base}</text>)}</svg></div></>}</section>
  return <section aria-label="Sanger 峰图查看与分析" style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 14 }}>
    <h3>Sanger 峰图查看与分析</h3>
    <p>当前支持 SCF 与 AB1；AB1 的 PCON 为仪器 Phred Q，裁剪使用 1−10^(−Q/10)；SCF 使用存储的概率值，缺失质量保持未知。AB1 通道和调用标签缺失时会明确拒绝。</p>
    <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
      <label>SCF/AB1 资产 <select aria-label="Sanger 资产" value={assetId} onChange={event => setAssetId(event.target.value)}><option value="">选择 SCF/AB1 资产</option>{assets.filter(asset => /\.(scf|ab1)$/iu.test(asset.uri)).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
      <button type="button" disabled={!assetId} onClick={() => void run({ action: 'sanger_open', assetId })}>打开峰图</button>
      <button type="button" onClick={() => void refresh()}>刷新资产</button>
      <div role="tablist" aria-label="已保存 Sanger 视图" style={{ margin: '12px 0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>{viewers.map(item => <button type="button" role="tab" aria-selected={item.id === viewer?.id} key={item.id} onClick={() => void run({ action: 'sanger_analyze', viewerId: item.id, expectedVersion: item.version })}>{assets.find(asset => asset.id === item.assetId)?.name ?? 'SCF'} · v{item.version}</button>)}</div>
      {viewer && trace && <>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}><label>端点概率阈值 <input aria-label="端点概率阈值" type="number" min={0} max={1} step={.05} value={threshold} onChange={event => setThreshold(Number(event.target.value))} /></label><label>质量窗口 <input aria-label="质量窗口" type="number" min={1} max={100} value={window} onChange={event => setWindow(Number(event.target.value))} /></label><label style={{ flex: 1, minWidth: 260 }}>参考序列 <input aria-label="Sanger 参考序列" style={{ width: '100%' }} value={reference} onChange={event => setReference(event.target.value)} placeholder="可选，A/C/G/T/N" /></label></div>
        <div><label>显示起点 <input aria-label="峰图样本起点" type="number" min={0} max={Math.max(0, trace.sampleCount - 1)} value={start} onChange={e => setSampleStart(Math.max(0, Math.trunc(Number(e.target.value))))}/></label><label>显示窗口 <input aria-label="峰图样本窗口" type="number" min={50} max={10000} value={sampleWindow} onChange={e => setSampleWindow(Math.min(10000, Math.max(50, Math.trunc(Number(e.target.value)))))}/></label><span>显示样本 [{start}, {end})；原始峰数据和计算不降采样。</span></div>
        <div aria-label="四色峰图" style={{ overflowX: 'auto', border: '1px solid var(--dsw-alias-border-l1)', padding: 6 }}><svg role="img" aria-label="四色 Sanger 峰图" width={width} height={height} viewBox={`0 0 ${width} ${height}`}><line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke="currentColor" opacity=".35" />{(['A', 'C', 'G', 'T'] as const).map(base => <path key={base} d={path(displayed?.[base] ?? [])} fill="none" stroke={colours[base]} strokeWidth="1.3" />)}{trace.bases.filter(base => base.peak >= start && base.peak < end).slice(0, 300).map(base => <text key={base.position} x={(base.peak - start) / Math.max(1, end - start - 1) * width} y={13} fontSize={11} fill={base.quality === null ? '#9a3b9f' : 'currentColor'}><title>{`调用 ${base.position}，峰位 ${base.peak}，质量 ${base.quality ?? '未知'}`}</title>{base.base}</text>)}</svg></div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>{(['A', 'C', 'G', 'T'] as const).map(base => <span key={base} style={{ color: colours[base] }}>■ {base}</span>)}<span>{trace.sampleCount} samples · {trace.bases.length} calls · {trace.format.toUpperCase()} {trace.version}</span></div>
        <fieldset aria-label="人工碱基修订"><legend>人工碱基修订</legend><p>保留原始峰和调用历史；修订调用不继承仪器质量分数。修订后概率裁剪设为 0，旧产物和下游证据需要重新复核。</p><label>原始调用位置 <input aria-label="修订碱基位置" type="number" min={1} max={trace.bases.length} value={editPosition} onChange={e => { const position = Number(e.target.value); setEditPosition(position); const base = trace.bases[position - 1]; if (base) setSampleStart(Math.max(0, base.peak - 100)) }}/></label><span>当前调用：{trace.bases[editPosition - 1]?.base ?? '—'}，峰位：{trace.bases[editPosition - 1]?.peak ?? '—'}</span><label>修订为 <select aria-label="修订碱基" value={editCall} onChange={e => setEditCall(e.target.value)}>{'ACGTNRYSWKMBDHV'.split('').map(base => <option key={base}>{base}</option>)}</select></label><label>修订依据 <input aria-label="碱基修订依据" value={editReason} onChange={e => setEditReason(e.target.value)} placeholder="例如正反向峰图支持的混合峰"/></label><button type="button" disabled={!editReason.trim() || !trace.bases[editPosition - 1] || editCall === trace.bases[editPosition - 1]?.base} onClick={() => { const from = trace.bases[editPosition - 1]?.base; if (from) void run({ action: 'sanger_revise', viewerId: viewer.id, expectedVersion: viewer.version, sanger: { sessionId, action: 'revise', edits: [{ position: editPosition, from, to: editCall as typeof from, reason: editReason }] } }) }}>登记碱基修订</button><span>历史修订批次：{Array.isArray(viewer.state.editHistory) ? viewer.state.editHistory.length : 0}</span></fieldset>
        <div><label>反向读段 <select aria-label="反向读段" value={reverseViewerId} onChange={e => setReverseViewerId(e.target.value)}><option value="">选择已打开的另一峰图</option>{viewers.filter(v => v.id !== viewer.id).map(v => <option key={v.id} value={v.id}>{assets.find(a => a.id === v.assetId)?.name ?? v.id} · v{v.version}</option>)}</select></label><button type="button" disabled={!viewers.some(v => v.id === reverseViewerId && v.id !== viewer.id)} onClick={() => { const reverse = viewers.find(v => v.id === reverseViewerId); if (reverse) void run({ action: 'sanger_review', viewerId: viewer.id, expectedVersion: viewer.version, reverseViewerId: reverse.id, expectedReverseVersion: reverse.version, threshold, window, ...(reference.trim() ? { reference } : {}) }) }}>双向核对</button></div>
        <div style={{ marginTop: 10 }}><button type="button" onClick={() => void run({ action: 'sanger_analyze', viewerId: viewer.id, expectedVersion: viewer.version, threshold, window, ...(reference.trim() ? { reference } : {}) })}>裁剪并比对</button><button type="button" onClick={() => void run({ action: 'sanger_export', viewerId: viewer.id, expectedVersion: viewer.version, threshold, window, ...(reference.trim() ? { reference } : {}) })}>导出并登记</button></div>
      </>}
    </fieldset>
    {analysis && <div aria-label="Sanger 分析结果"><p>裁剪区间：{analysis.trim.start}–{analysis.trim.end} · {analysis.trim.sequence.length} bp</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{analysis.trim.sequence || '端点阈值移除了全部调用'}</pre>{analysis.reference && <><p>参考比对 identity：{(analysis.reference.identity * 100).toFixed(2)}% · mismatch：{analysis.reference.mismatches.length}</p><pre style={{ overflowX: 'auto' }}>{analysis.reference.alignedRead}{'\n'}{analysis.reference.alignedReference}</pre></>}<ul>{analysis.notes.map(note => <li key={note}>{note}</li>)}{analysis.reference?.notes.map(note => <li key={note}>{note}</li>)}</ul></div>}
    {review && <div aria-label="双向 Sanger 核对"><p>双向核对：{review.status === 'concordant' ? '一致' : review.status === 'discordant' ? '存在不一致' : '信息不足'} · {review.disagreements.length} 个直接不一致</p><pre>{review.forward}{'\n'}{review.reverseComplement}</pre><ul>{review.notes.map(note => <li key={note}>{note}</li>)}</ul></div>}
    {message && <pre role="status" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message}</pre>}
  </section>
}
