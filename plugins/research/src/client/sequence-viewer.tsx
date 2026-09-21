import { useEffect, useRef, useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '../../lib/typert.remote-client.js'
import type { DataAssetRecord, ViewerSessionRecord } from '@zerowallscience/research-store/types'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'
import type { ScienceViewerRequest, SequenceAnalysis, SequenceViewState, SequenceWindow } from '../shared/types.js'

type Remote = TypertRemoteNamespaceMap['zerowallResearch']
const defaults: SequenceViewState = { recordIndex: 0, start: 1, count: 2400, selectionStart: 1, selectionEnd: 1 }
const inputStyle = { width: 95 }

export function SequenceViewer({ remote, sessionId }: { remote: Remote; sessionId: string }): JSX.Element {
  const [assets, setAssets] = useState<DataAssetRecord[]>([])
  const [viewers, setViewers] = useState<ViewerSessionRecord[]>([])
  const [assetId, setAssetId] = useState('')
  const [viewer, setViewer] = useState<ViewerSessionRecord>()
  const [window, setWindow] = useState<SequenceWindow>()
  const [state, setState] = useState<SequenceViewState>(defaults)
  const [operation, setOperation] = useState<SequenceAnalysis['operation']>('translate')
  const [analysis, setAnalysis] = useState<SequenceAnalysis>()
  const [crisprTarget, setCrisprTarget] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const locked = useRef(false)

  const call = async (input: Omit<ScienceViewerRequest, 'sessionId'>) => unwrapRemoteResult('scienceViewer', await remote.scienceViewer({ ...input, sessionId }))
  const list = async () => {
    const current = generation.current
    const response = await call({ action: 'list' })
    if (current !== generation.current) return
    setAssets(response.assets ?? []); setViewers(response.viewers?.filter(item => item.tool === 'sequence') ?? [])
  }
  useEffect(() => {
    generation.current++
    const current = generation.current
    setViewer(undefined); setWindow(undefined); setAnalysis(undefined); setAssets([]); setViewers([]); setAssetId(''); setMessage('')
    void list().catch(error => { if (current === generation.current) setMessage(String(error)) })
    return () => { generation.current++ }
  }, [remote, sessionId])

  const run = async (input: Omit<ScienceViewerRequest, 'sessionId'>) => {
    if (locked.current) return
    locked.current = true
    const current = generation.current
    setBusy(true); setMessage('')
    try {
      const response = await call(input)
      if (current !== generation.current) return
      if (response.viewer) {
        setViewer(response.viewer)
        const saved = response.viewer.state
        setState({ recordIndex: Number(saved.recordIndex), start: Number(saved.start), count: Number(saved.count), selectionStart: Number(saved.selectionStart), selectionEnd: Number(saved.selectionEnd) })
      }
      if (response.window) { setWindow(response.window); setAnalysis(undefined) }
      if (response.analysis) setAnalysis(response.analysis)
      if (response.artifact) setMessage(`已登记产物：${response.artifact.name}\n${response.artifact.uri}\nSHA-256: ${response.artifact.checksum}`)
      await list()
    } catch (error) { if (current === generation.current) setMessage(error instanceof Error ? error.message : String(error)) }
    finally { locked.current = false; if (current === generation.current) setBusy(false) }
  }
  const savedState = viewer?.state
  const dirty = Boolean(savedState && Object.entries(state).some(([key, value]) => savedState[key] !== value))
  const selection = (value: number, end: boolean) => setState(previous => end
    ? { ...previous, selectionEnd: Math.max(previous.selectionStart, value) }
    : { ...previous, selectionStart: value, selectionEnd: value })
  const rows = window ? Array.from({ length: Math.ceil(window.sequence.length / 60) }, (_, index) => ({ start: window.start + index * 60, bases: window.sequence.slice(index * 60, index * 60 + 60) })) : []
  return <section aria-label="序列查看与分析" style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 14 }}>
    <h3>FASTA 序列查看与分析</h3>
    <p>支持本地核酸 FASTA，最大 16 MiB；无需建立研究。点击碱基设起点，Shift＋点击设终点；所有显示坐标从 1 开始，包含末端。</p>
    <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
      <label>项目资产 <select aria-label="序列资产" value={assetId} onChange={event => setAssetId(event.target.value)}><option value="">选择 FASTA/GenBank 资产</option>{assets.filter(asset => /\.(fa|fasta|fna|ffn|frn|gb|gbk)$/iu.test(asset.uri)).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
      <button type="button" disabled={!assetId} onClick={() => void run({ action: 'open', assetId })}>打开序列</button>
      <button type="button" onClick={() => void run({ action: 'list' })}>刷新资产</button>
      <div role="tablist" aria-label="已保存序列视图" style={{ margin: '12px 0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>{viewers.map(item => <button type="button" role="tab" aria-selected={item.id === viewer?.id} key={item.id} onClick={() => void run({ action: 'read', viewerId: item.id })}>{assets.find(asset => asset.id === item.assetId)?.name ?? '序列'} · v{item.version}</button>)}</div>
      {viewer && window && <>
        <label>序列记录 <select aria-label="序列记录" value={state.recordIndex} onChange={event => setState({ ...defaults, recordIndex: Number(event.target.value) })}>{window.records.map(record => <option key={record.index} value={record.index}>{record.name} · {record.length} bp · GC {record.gcPercent === null ? '未知' : record.gcPercent.toFixed(2) + '%'}</option>)}</select></label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '12px 0' }}>{([['start', '窗口起点'], ['count', '窗口长度'], ['selectionStart', '选择起点'], ['selectionEnd', '选择终点']] as const).map(([key, label]) => <label key={key}>{label} <input style={inputStyle} type="number" min={1} aria-label={label} value={state[key]} onChange={event => setState(previous => ({ ...previous, [key]: Number(event.target.value) }))} /></label>)}
          <button type="button" onClick={() => void run({ action: 'save', viewerId: viewer.id, expectedVersion: viewer.version, state })}>保存并查看</button>
        </div>
        <p>当前显示记录：{window.records[window.recordIndex]?.name} · {window.start}–{window.end} · 选择 {state.selectionStart}–{state.selectionEnd}{dirty ? '（修改尚未保存，保存后才能分析）' : ''}</p>
        <div aria-label="碱基视图" style={{ overflow: 'auto', maxHeight: 360, fontFamily: 'monospace', border: '1px solid var(--dsw-alias-border-l1)', padding: 8 }}>{rows.map(row => <div key={row.start} style={{ whiteSpace: 'nowrap' }}><span style={{ display: 'inline-block', width: 75, textAlign: 'right', paddingRight: 12 }}>{row.start}</span>{Array.from(row.bases, (base, index) => {
          const position = row.start + index
          const selected = state.recordIndex === window.recordIndex && position >= state.selectionStart && position <= state.selectionEnd
          return <button type="button" key={position} disabled={state.recordIndex !== window.recordIndex} title={`${position}: ${base}`} aria-label={`碱基 ${position} ${base}`} onClick={event => selection(position, event.shiftKey)} style={{ border: 0, padding: '2px 1px', font: 'inherit', color: selected ? 'HighlightText' : 'inherit', background: selected ? 'Highlight' : 'transparent' }}>{base}</button>
        })}</div>)}</div>
        <div style={{ marginTop: 12 }}><select aria-label="序列分析操作" value={operation} onChange={event => { setOperation(event.target.value as SequenceAnalysis['operation']); setAnalysis(undefined) }}><option value="translate">标准密码表翻译</option><option value="reverse-complement">反向互补</option><option value="restriction">五种限制酶位点</option><option value="crispr">SpCas9/NGG 候选</option></select>
          {operation === 'crispr' && <label>目标 guide（可选） <input aria-label="CRISPR 目标" maxLength={20} value={crisprTarget} onChange={event => setCrisprTarget(event.target.value.toUpperCase())} placeholder="20 bp" /></label>}
          <button type="button" disabled={dirty} onClick={() => void run({ action: 'analyze', viewerId: viewer.id, expectedVersion: viewer.version, operation, ...(operation === 'crispr' && crisprTarget ? { crisprTarget, crisprMaxMismatches: 3 } : {}) })}>分析选择区域</button>
          <button type="button" disabled={dirty} onClick={() => void run({ action: 'export', viewerId: viewer.id, expectedVersion: viewer.version, operation, ...(operation === 'crispr' && crisprTarget ? { crisprTarget, crisprMaxMismatches: 3 } : {}) })}>导出并登记产物</button>
        </div>
      </>}
    </fieldset>
    {analysis && <div aria-label="序列分析结果"><p>{analysis.operation} · {analysis.start}–{analysis.end}</p>{analysis.sequence !== undefined && <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{analysis.sequence || '没有完整密码子可供翻译'}</pre>}{analysis.sites && <table><thead><tr><th>酶</th><th>识别起点</th><th>正链切口在碱基之后</th></tr></thead><tbody>{analysis.sites.map((site, index) => <tr key={index}><td>{site.enzyme}</td><td>{site.recognitionStart}</td><td>{site.cutAfter}</td></tr>)}</tbody></table>}{analysis.candidates && <table><thead><tr><th>链</th><th>guide</th><th>PAM</th><th>坐标</th><th>错配</th></tr></thead><tbody>{analysis.candidates.map((candidate, index) => <tr key={index}><td>{candidate.strand === 1 ? '+' : '-'}</td><td>{candidate.protospacer}</td><td>{candidate.pam}</td><td>{candidate.start}–{candidate.end}</td><td>{candidate.mismatches}</td></tr>)}</tbody></table>}{analysis.sites?.length === 0 && <p>选择区域内未找到这些酶的精确识别位点。</p>}<ul>{analysis.notes.map(note => <li key={note}>{note}</li>)}</ul></div>}
    {message && <pre role="status" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message}</pre>}
  </section>
}
