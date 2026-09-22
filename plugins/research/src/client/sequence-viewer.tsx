import { useEffect, useRef, useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '../../lib/typert.remote-client.js'
import type { DataAssetRecord, ViewerSessionRecord } from '@zerowallscience/research-store/types'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'
import type { ScienceViewerRequest, SequenceAnalysis, SequenceViewState, SequenceWindow } from '../shared/types.js'
import { SequenceFeatureMap } from './sequence-feature-map.js'
import type { SequenceSimulationOptions } from '../shared/sequence.js'

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
  const [forwardPrimer,setForwardPrimer]=useState('');const [reversePrimer,setReversePrimer]=useState('')
  const [forwardAnneal,setForwardAnneal]=useState('');const [reverseAnneal,setReverseAnneal]=useState('')
  const [templateTopology,setTemplateTopology]=useState<'linear'|'circular'>('linear')
  const [fragmentOrder,setFragmentOrder]=useState('1+, 2+');const [productTopology,setProductTopology]=useState<'linear'|'circular'>('circular')
  const [minimumOverlap,setMinimumOverlap]=useState(20);const [enzyme,setEnzyme]=useState<'BsaI'|'BsmBI'>('BsaI')
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
    setForwardPrimer('');setReversePrimer('');setForwardAnneal('');setReverseAnneal('');setTemplateTopology('linear');setFragmentOrder('1+, 2+');setProductTopology('circular');setMinimumOverlap(20);setEnzyme('BsaI');setOperation('translate');setCrisprTarget('')
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
        setState({ recordIndex: Number(saved.recordIndex), start: Number(saved.start), count: Number(saved.count), selectionStart: Number(saved.selectionStart), selectionEnd: Number(saved.selectionEnd), ...(saved.mapMode === 'linear' || saved.mapMode === 'circular' ? { mapMode: saved.mapMode } : {}) })
      }
      if (response.window) { setWindow(response.window); setAnalysis(undefined) }
      if (response.analysis) setAnalysis(response.analysis)
      if (response.artifact) setMessage(`已登记产物：${response.artifact.name}\n${response.artifact.uri}\nSHA-256: ${response.artifact.checksum}`)
      await list()
    } catch (error) { if (current === generation.current) setMessage(error instanceof Error ? error.message : String(error)) }
    finally { locked.current = false; if (current === generation.current) setBusy(false) }
  }
  const savedState = viewer?.state
  const simulate=(action:'analyze'|'export')=>{
    if(!viewer)return
    try{
      let sequenceOptions:SequenceSimulationOptions|undefined
      if(operation==='pcr')sequenceOptions={forwardPrimer,reversePrimer,templateTopology,...(forwardAnneal.trim()?{forwardAnnealLength:Number(forwardAnneal)}:{}),...(reverseAnneal.trim()?{reverseAnnealLength:Number(reverseAnneal)}:{})}
      if(operation==='gibson'||operation==='golden-gate'){
        const fragments=fragmentOrder.split(',').map(value=>{const match=/^\s*([1-9][0-9]*)([+-])\s*$/u.exec(value);if(!match)throw new Error('片段顺序格式为 1+, 2-, 3+：记录号从 1 开始，符号指定方向。');return{recordIndex:Number(match[1])-1,reverseComplement:match[2]==='-'}})
        sequenceOptions={fragments,productTopology:operation==='golden-gate'?'circular':productTopology,minimumOverlap,enzyme}
      }
      void run({action,viewerId:viewer.id,expectedVersion:viewer.version,operation,...(operation==='crispr'&&crisprTarget?{crisprTarget,crisprMaxMismatches:3}:{}),...(sequenceOptions?{sequenceOptions}:{})})
    }catch(error){setMessage(String(error))}
  }
  const dirty = Boolean(savedState && Object.entries(state).some(([key, value]) => savedState[key] !== value))
  const selection = (value: number, end: boolean) => setState(previous => end
    ? { ...previous, selectionEnd: Math.max(previous.selectionStart, value) }
    : { ...previous, selectionStart: value, selectionEnd: value })
  const rows = window ? Array.from({ length: Math.ceil(window.sequence.length / 60) }, (_, index) => ({ start: window.start + index * 60, bases: window.sequence.slice(index * 60, index * 60 + 60) })) : []
  return <section aria-label="序列查看与分析" style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 14 }}>
    <h3>序列、注释图谱与分析</h3>
    <p>支持本地核酸 FASTA/GenBank，最大 16 MiB；无需建立研究。点击碱基设起点，Shift＋点击设终点；所有显示坐标从 1 开始，包含末端。</p>
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
        <label>图谱布局 <select aria-label="图谱布局" value={state.mapMode ?? (window.topology === 'circular' ? 'circular' : 'linear')} onChange={event => setState(previous => ({ ...previous, mapMode: event.target.value as 'linear' | 'circular' }))}><option value="linear">线性</option><option value="circular">环形</option></select></label>
        <p>源记录拓扑：{window.topology === 'circular' ? '环状' : window.topology === 'linear' ? '线性' : '未声明'}；切换布局不改变源序列。显示 {window.features?.length ?? 0}/{window.featureCount ?? 0} 条注释（最多 500 条）。</p>
        {window.records[window.recordIndex] && <SequenceFeatureMap length={window.records[window.recordIndex]!.length} name={window.records[window.recordIndex]!.name} mode={state.mapMode ?? (window.topology === 'circular' ? 'circular' : 'linear')} features={window.features ?? []} selection={[state.selectionStart, state.selectionEnd]} onSelect={(start, end) => { if (end - start + 1 > 100000) { setMessage('该注释跨度超过交互选区 100,000 bp 上限，请缩小区间。'); return } setState(previous => ({ ...previous, recordIndex: window.recordIndex, start, selectionStart: start, selectionEnd: end })) }} />}
        {!!window.featureWarnings?.length && <details><summary>未映射注释与限制（{window.featureWarnings.length}）</summary><ul>{window.featureWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
        <div aria-label="碱基视图" style={{ overflow: 'auto', maxHeight: 360, fontFamily: 'monospace', border: '1px solid var(--dsw-alias-border-l1)', padding: 8 }}>{rows.map(row => <div key={row.start} style={{ whiteSpace: 'nowrap' }}><span style={{ display: 'inline-block', width: 75, textAlign: 'right', paddingRight: 12 }}>{row.start}</span>{Array.from(row.bases, (base, index) => {
          const position = row.start + index
          const selected = state.recordIndex === window.recordIndex && position >= state.selectionStart && position <= state.selectionEnd
          return <button type="button" key={position} disabled={state.recordIndex !== window.recordIndex} title={`${position}: ${base}`} aria-label={`碱基 ${position} ${base}`} onClick={event => selection(position, event.shiftKey)} style={{ border: 0, padding: '2px 1px', font: 'inherit', color: selected ? 'HighlightText' : 'inherit', background: selected ? 'Highlight' : 'transparent' }}>{base}</button>
        })}</div>)}</div>
        <div style={{ marginTop: 12 }}><select aria-label="序列分析操作" value={operation} onChange={event => { setOperation(event.target.value as SequenceAnalysis['operation']); setAnalysis(undefined) }}><option value="translate">标准密码表翻译</option><option value="reverse-complement">反向互补</option><option value="restriction">五种限制酶位点</option><option value="crispr">SpCas9/NGG 候选</option><option value="pcr">精确匹配 PCR 模拟</option><option value="gibson">Gibson 末端同源拼接</option><option value="golden-gate">Golden Gate Type IIS 拼接</option></select>
          {operation === 'crispr' && <label>目标 guide（可选） <input aria-label="CRISPR 目标" maxLength={20} value={crisprTarget} onChange={event => setCrisprTarget(event.target.value.toUpperCase())} placeholder="20 bp" /></label>}
          {operation==='pcr'&&<div><p>模板使用当前选区；环状模板必须选择完整记录。两条引物都按 5′→3′ 填写，退火长度留空表示完整引物，无 5′ 尾。</p><label>正向引物 <input aria-label="PCR 正向引物" value={forwardPrimer} onChange={e=>setForwardPrimer(e.target.value.trim().toUpperCase())}/></label><label>反向引物 <input aria-label="PCR 反向引物" value={reversePrimer} onChange={e=>setReversePrimer(e.target.value.trim().toUpperCase())}/></label><label>正向退火长度 <input aria-label="PCR 正向退火长度" type="number" min={12} max={120} value={forwardAnneal} onChange={e=>setForwardAnneal(e.target.value)}/></label><label>反向退火长度 <input aria-label="PCR 反向退火长度" type="number" min={12} max={120} value={reverseAnneal} onChange={e=>setReverseAnneal(e.target.value)}/></label><label>模板拓扑 <select aria-label="PCR 模板拓扑" value={templateTopology} onChange={e=>setTemplateTopology(e.target.value as 'linear'|'circular')}><option value="linear">线性</option><option value="circular">环状</option></select></label></div>}
          {(operation==='gibson'||operation==='golden-gate')&&<div><p>拼接使用当前文件内的完整记录，忽略选区。格式：1+, 2-, 3+；记录号从 1 开始，+ 为原方向，- 为反向互补。不会自动重排。</p><label>片段顺序 <input aria-label="拼接片段顺序" value={fragmentOrder} onChange={e=>setFragmentOrder(e.target.value)}/></label>{operation==='gibson'?<><label>最小同源长度 <input aria-label="Gibson 最小同源长度" type="number" min={12} max={80} value={minimumOverlap} onChange={e=>setMinimumOverlap(Number(e.target.value))}/></label><label>产物拓扑 <select aria-label="拼接产物拓扑" value={productTopology} onChange={e=>setProductTopology(e.target.value as 'linear'|'circular')}><option value="circular">圆形</option><option value="linear">线性</option></select></label></>:<label>Type IIS 酶 <select aria-label="Golden Gate 酶" value={enzyme} onChange={e=>setEnzyme(e.target.value as 'BsaI'|'BsmBI')}><option value="BsaI">BsaI</option><option value="BsmBI">BsmBI</option></select></label>}</div>}
          <button type="button" disabled={dirty} onClick={()=>simulate('analyze')}>{operation==='gibson'||operation==='golden-gate'?'模拟指定片段拼接':'分析选择区域'}</button>
          <button type="button" disabled={dirty} onClick={()=>simulate('export')}>导出并登记产物</button>
        </div>
      </>}
    </fieldset>
    {analysis?.simulation&&<div aria-label="序列模拟详情"><p>{analysis.simulation.algorithm} · 产物 {analysis.simulation.productLength} bp · {analysis.simulation.topology==='circular'?'圆形':'线性'} · 源记录 {analysis.simulation.sourceRecordIndices.map(i=>i+1).join(', ')}</p>{analysis.simulation.primerSites?.map(site=><p key={site.primer}>{site.primer==='forward'?'正向':'反向'}引物：{site.start}–{site.end}，退火 {site.annealLength} bp，5′ 尾 {site.tail||'无'}</p>)}{analysis.simulation.junctions.map((j,i)=><p key={i}>接头 {j.fromRecord+1} → {j.toRecord+1}：{j.overlap}（{j.length} bp）</p>)}<details><summary>实际模拟参数与方向</summary><pre>{JSON.stringify(analysis.simulation.parameters,null,2)}</pre></details></div>}
    {analysis && <div aria-label="序列分析结果"><p>{analysis.operation} · {analysis.start}–{analysis.end}</p>{analysis.sequence !== undefined && <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{analysis.sequence || '没有完整密码子可供翻译'}</pre>}{analysis.sites && <table><thead><tr><th>酶</th><th>识别起点</th><th>正链切口在碱基之后</th></tr></thead><tbody>{analysis.sites.map((site, index) => <tr key={index}><td>{site.enzyme}</td><td>{site.recognitionStart}</td><td>{site.cutAfter}</td></tr>)}</tbody></table>}{analysis.candidates && <table><thead><tr><th>链</th><th>guide</th><th>PAM</th><th>坐标</th><th>错配</th></tr></thead><tbody>{analysis.candidates.map((candidate, index) => <tr key={index}><td>{candidate.strand === 1 ? '+' : '-'}</td><td>{candidate.protospacer}</td><td>{candidate.pam}</td><td>{candidate.start}–{candidate.end}</td><td>{candidate.mismatches}</td></tr>)}</tbody></table>}{analysis.sites?.length === 0 && <p>选择区域内未找到这些酶的精确识别位点。</p>}<ul>{analysis.notes.map(note => <li key={note}>{note}</li>)}</ul></div>}
    {message && <pre role="status" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message}</pre>}
  </section>
}
