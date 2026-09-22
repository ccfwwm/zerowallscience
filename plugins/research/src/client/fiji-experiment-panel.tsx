import { useEffect, useRef, useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { FijiExperimentId, FijiImageConfig } from '../shared/fiji-experiments.js'
import type { DataAssetRecord, RunRecord } from '@zerowallscience/research-store/types'
import { FijiReviewControls } from './fiji-review-controls.js'
import type { FijiExperimentRequest, FijiExperimentResponse } from '../shared/types.js'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'

type Remote = TypertRemoteNamespaceMap['zerowallResearch']
const examples: Record<FijiExperimentId, string> = {
  'scratch-wound': '[{"sampleId":"S1","time":"0h","initialArea":100,"remainingArea":100}]',
  'colony-formation': '[{"wellId":"A1","independentCount":12}]',
  'bacterial-cfu': '[{"plateId":"P1","colonyCount":50,"dilutionFactor":1000,"platedVolumeMl":0.1}]',
  'tube-formation': '[{"sampleId":"S1","unit":"um","unitScale":0.5,"length":240,"endpoints":8,"junctions":5,"segments":12,"meshes":3}]',
}

const imageExamples: Record<FijiExperimentId, object> = {
  'scratch-wound': { kind: 'scratch-wound', sampleId: 'S1', time: '24h', initialArea: 100, threshold: 128, polarity: 'bright', roi: { x: 0, y: 0, width: 10, height: 10 } },
  'colony-formation': { kind: 'colony-formation', wellId: 'A1', threshold: 128, polarity: 'dark', minArea: 2, maxArea: 100, stainUnit: 'pixel', roi: { x: 0, y: 0, width: 10, height: 10 } },
  'bacterial-cfu': { kind: 'bacterial-cfu', plateId: 'P1', dilutionFactor: null, platedVolumeMl: null, threshold: 128, polarity: 'bright', minArea: 2, maxArea: 100, roi: { x: 0, y: 0, width: 10, height: 10 } },
  'tube-formation': { kind: 'tube-formation', sampleId: 'S1', threshold: 128, polarity: 'bright', unit: 'pixel', unitScale: 1, roi: { x: 0, y: 0, width: 10, height: 10 } },
}

export function FijiExperimentPanel({ remote, sessionId }: { remote: Remote; sessionId: string }): JSX.Element {
  const [experiment, setExperiment] = useState<FijiExperimentId>('scratch-wound')
  const [text, setText] = useState(examples['scratch-wound'])
  const [mode, setMode] = useState<'measurements' | 'image'>('measurements')
  const [previews, setPreviews] = useState<Array<{ name: string; src: string }>>([])
  const [measurements, setMeasurements] = useState<unknown[]>([])
  const generation = useRef(0); const request = useRef<{ signature: string; id: string }>()
  const [assets, setAssets] = useState<DataAssetRecord[]>([]); const [assetId, setAssetId] = useState('')
  useEffect(() => { let current = true; generation.current++; setAssets([]); setAssetId(''); setPreviews([]); setMeasurements([]); setDetails(undefined); setHistory([]); setSelectedRun(''); setBusy(false); request.current = undefined; void remote.scienceViewer({ sessionId, action: 'list' }).then(value => { if (current) setAssets((unwrapRemoteResult('scienceViewer', value).assets ?? []).filter(asset => asset.location === 'local' && /\.(png|tiff?|pgm)$/iu.test(asset.uri))) }).catch(error => { if (current) setMessage(String(error)) }); return () => { current = false; generation.current++ } }, [remote, sessionId])
  const [history,setHistory]=useState<RunRecord[]>([])
  const previewName=(name:string)=>({'mask.png':'接受的分割掩膜','automatic-mask.png':'原始自动掩膜','exclusion-mask.png':'反光及边缘排除掩膜','overlay.png':'边界质控叠加','skeleton.png':'原生骨架'}[name]??name)
  const [details,setDetails]=useState<FijiExperimentResponse>()
  const [selectedRun,setSelectedRun]=useState('')
  const call=async(input:FijiExperimentRequest):Promise<FijiExperimentResponse>=>unwrapRemoteResult('fijiExperiment',await remote.fijiExperiment(input))
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (): Promise<void> => {
    if (busy) return
    const current = generation.current
    setBusy(true); setMessage(''); setPreviews([]); setMeasurements([])
    try {
      const values = JSON.parse(text)
      if (mode === 'measurements' && !Array.isArray(values)) throw new Error('实验测量必须是 JSON 数组。')
      if (mode === 'image' && (!assetId || !values || Array.isArray(values))) throw new Error('请选择项目图像并填写图像参数对象。')
      const signature = JSON.stringify({ experiment, mode, values, assetId })
      if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() }
      const result = unwrapRemoteResult('fijiExperiment', await remote.fijiExperiment({ sessionId, action: 'analyze', experiment, requestId: request.current.id, ...(mode === 'measurements' ? { measurements: values } : { sourceAssetId: assetId, image: values as FijiImageConfig }) })) as { run?: { status: string; error?: string }; result?: { measurements: unknown[] }; artifacts?: Array<{ name: string; projectId: string; uri: string; checksum?: string }> }
      if (current !== generation.current) return
      setDetails(result as FijiExperimentResponse);setSelectedRun((result.run as any)?.id??'');setMeasurements(result.result?.measurements ?? [])
      for (const artifact of result.artifacts ?? []) {
        if (!['automatic-mask.png', 'exclusion-mask.png', 'mask.png', 'overlay.png', 'skeleton.png'].includes(artifact.name)) continue
        const preview = unwrapRemoteResult('preview', await remote.preview({ projectId: artifact.projectId, uri: artifact.uri, mediaType: 'image/png' }))
        if (current !== generation.current) return
        setPreviews(previous => [...previous, { name: artifact.name, src: `data:image/png;base64,${preview.base64}` }])
      }
      setMessage(`状态：${result.run?.status ?? 'unknown'}${result.run?.error ? `：${result.run.error}` : ''}；测量行：${result.result?.measurements?.length ?? 0}；产物：${result.artifacts?.[0]?.uri ?? '无'}`)
    } catch (error) { if (current === generation.current) setMessage(error instanceof Error ? error.message : String(error)) }
    finally { if (current === generation.current) setBusy(false) }
  }
  return <section style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 14, marginTop: 14 }}>
    <h3 style={{ marginTop: 0 }}>Fiji 实验分析</h3>
    <p>划痕、克隆形成和细菌菌落使用已安装的 ImageJ 分析原始 8 位灰度单平面图，保存 ROI、掩膜、边界叠加和颗粒表。参数中的 ROI 使用原图像素坐标；划痕初始面积使用像素，物理染色面积需提供 pixelArea 校准。成管使用 Skeletonize3D／AnalyzeSkeleton，网孔字段表示独立图环 E−V+C；不是空间网孔面积。长度使用显式等距标定，保留插件原始字段。</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <select aria-label="Fiji 实验" disabled={busy} value={experiment} onChange={event => { const next = event.target.value as FijiExperimentId; setExperiment(next); const nextMode = mode; setMode(nextMode); setText(nextMode === 'image' ? JSON.stringify(imageExamples[next], null, 2) : examples[next]) }}>{Object.keys(examples).map(id => <option key={id} value={id}>{id}</option>)}</select>
      <select aria-label="实验输入" disabled={busy} value={mode} onChange={event => { const next = event.target.value as typeof mode; setMode(next); setText(next === 'image' ? JSON.stringify(imageExamples[experiment], null, 2) : examples[experiment]) }}><option value="measurements">已测量数据汇总</option><option value="image">图像分割与定量</option></select>
      {mode === 'image' && <select aria-label="实验图像" disabled={busy} value={assetId} onChange={event => setAssetId(event.target.value)}><option value="">选择已登记图像</option>{assets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select>}
      <button type="button" onClick={() => void run()} disabled={busy}>{busy ? '计算中…' : mode === 'image' ? '分析图像' : '汇总测量'}</button>
    </div>
    {mode==='image'&&assetId&&<FijiReviewControls sessionId={sessionId} assetId={assetId} text={text} setText={setText} call={call}/>}
    <div><button type="button" disabled={busy} onClick={()=>void call({sessionId,action:'list'}).then(result=>setHistory(result.runs??[])).catch(reason=>setMessage(String(reason)))}>刷新实验任务</button><select aria-label="Fiji 历史任务" value={selectedRun} onChange={event=>setSelectedRun(event.target.value)}><option value="">选择任务</option>{history.map(run=><option key={run.id} value={run.id}>{run.name} · {run.status} · {run.id}</option>)}</select><button type="button" disabled={busy||!selectedRun} onClick={()=>{const current=generation.current;void call({sessionId,action:'status',runId:selectedRun}).then(async result=>{if(current!==generation.current)return;setDetails(result);setMeasurements(result.result?.measurements??[]);setPreviews([]);for(const artifact of result.artifacts??[]){if(!['automatic-mask.png','exclusion-mask.png','mask.png','overlay.png','skeleton.png'].includes(artifact.name))continue;const preview=unwrapRemoteResult('preview',await remote.preview({projectId:artifact.projectId,uri:artifact.uri,mediaType:'image/png'}));if(current!==generation.current)return;setPreviews(previous=>[...previous,{name:artifact.name,src:'data:image/png;base64,'+preview.base64}])}}).catch(reason=>setMessage(String(reason)))}}>恢复实验结果</button></div>
    <textarea aria-label="Fiji 实验测量 JSON" disabled={busy} value={text} onChange={event => setText(event.target.value)} rows={8} style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, fontFamily: 'ui-monospace, monospace' }} />
    {previews.length > 0 && <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{previews.map(preview => <figure key={preview.name}><img src={preview.src} alt={previewName(preview.name)} style={{ width: 260, maxWidth: '100%', maxHeight: 260, objectFit: 'contain', imageRendering: 'pixelated' }} /><figcaption>{previewName(preview.name)+'（ROI 局部坐标）'}</figcaption></figure>)}</div>}
    {details?.result?.reviewState==='needs_recheck'&&<p role="alert">结果需要重新复核：{details.result.reviewReasons?.join(', ')}</p>}
    {details?.result?.timeline&&<p>已观察时间：{details.result.timeline.observedHours.join(', ')} h；缺失：{details.result.timeline.missingHours.join(', ')||'无'}；重复记录：{details.result.timeline.duplicateHours.join(', ')||'无'}</p>}
    {selectedRun&&<button type="button" onClick={()=>void call({sessionId,action:'status',runId:selectedRun}).then(result=>{setDetails(result);setMeasurements(result.result?.measurements??[])}).catch(reason=>setMessage(String(reason)))}>检查结果与源修订</button>}
    {measurements.length > 0 && <pre aria-label="实验结果" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(measurements, null, 2)}</pre>}
    {message && <pre style={{ whiteSpace: 'pre-wrap' }} role="status">{message}</pre>}
  </section>
}
