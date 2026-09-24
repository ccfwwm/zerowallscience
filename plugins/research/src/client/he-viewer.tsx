import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { DataAssetRecord, ViewerSessionRecord, RunRecord } from '@zerowallscience/research-store/types'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'
import type { HeAnalysis, HeRegion, HeSlideMetadata, HeTile } from '../shared/he.js'
import type { HeSegmentationResult } from '../shared/he-segmentation.js'
import type { HeResponse, ScienceViewerRequest } from '../shared/types.js'
import { useWorkbenchSelection } from './workbench-selection.js'

type Remote = TypertRemoteNamespaceMap['zerowallResearch']
export function HeViewer({ remote, sessionId }: { remote: Remote; sessionId: string }): JSX.Element {
  const selection = useWorkbenchSelection()
  const [assets,setAssets] = useState<DataAssetRecord[]>([])
  const [viewers,setViewers] = useState<ViewerSessionRecord[]>([])
  const [assetId,setAssetId] = useState('')
  const [viewer,setViewer] = useState<ViewerSessionRecord>()
  const [slide,setSlide] = useState<HeSlideMetadata>()
  const [tile,setTile] = useState<HeTile>()
  const [segmentation,setSegmentation] = useState<HeSegmentationResult>()
  const [segmentationRun,setSegmentationRun] = useState<RunRecord>()
  const [probability,setProbability] = useState(0.6924782541382084)
  const segmentRequest = useRef<{ signature:string; id:string }>()
  const [analysis,setAnalysis] = useState<HeAnalysis>()
  const [region,setRegion] = useState<Required<HeRegion>>({ x:0,y:0,width:1000,height:1000,page:0 })
  const [message,setMessage] = useState('')
  const [busy,setBusy] = useState(false)
  const generation = useRef(0)
  const drag = useRef<{ x:number;y:number }>()
  // The sidebar only bumps `revision` per explicit pick, so this pairing is what
  // separates a new request from a re-render of the one already handled.
  const openedSelection = useRef('')
  const call = async (input: Omit<ScienceViewerRequest,'sessionId'>): Promise<HeResponse & { assets?:DataAssetRecord[];viewers?:ViewerSessionRecord[] }> => {
    const result = unwrapRemoteResult('scienceViewer',await remote.scienceViewer({ ...input,sessionId })) as unknown as { he?:HeResponse;assets?:DataAssetRecord[];viewers?:ViewerSessionRecord[] }
    return (result.he ?? result) as HeResponse & { assets?:DataAssetRecord[];viewers?:ViewerSessionRecord[] }
  }
  const refresh = async (): Promise<void> => {
    const current = generation.current; const result = await call({ action:'list' })
    if (current !== generation.current) return
    setAssets(result.assets ?? []); setViewers((result.viewers ?? []).filter(item => item.state.heTool === 'he'))
  }
  useEffect(() => {
    const current = ++generation.current
    setAssets([]); setViewers([]); setViewer(undefined); setSlide(undefined); setTile(undefined); setAnalysis(undefined); setSegmentation(undefined); setSegmentationRun(undefined); segmentRequest.current=undefined; setMessage(''); setBusy(false)
    void refresh().catch(error => { if (current === generation.current) setMessage(String(error)) })
    return () => { generation.current++ }
  },[remote,sessionId])
  const run = async (input: Omit<ScienceViewerRequest,'sessionId'>): Promise<void> => {
    if (busy) return
    const current = generation.current; setBusy(true); setMessage('')
    try {
      const response = await call(input)
      if (current !== generation.current) return
      if (response.viewer) {
        setViewer(response.viewer); setAssetId(response.viewer.assetId)
        if (!response.run) {
          setSegmentation(undefined); setSegmentationRun(undefined)
          const restoredRunId=response.viewer.state.heSegmentationRunId
          if (typeof restoredRunId==='string') { const restored=await call({ action:'he_status',he:{sessionId,action:'status',runId:restoredRunId} }); if(current!==generation.current)return;setSegmentationRun(restored.run);setSegmentation(restored.segmentation) }
        }
      }
      if (response.run) setSegmentationRun(response.run)
      if (response.segmentation) setSegmentation(response.segmentation)
      if (response.he) { setSlide(response.he); if (!response.tile) setRegion(value => ({ ...value,width:Math.min(value.width,response.he!.width),height:Math.min(value.height,response.he!.height) })) }
      if (response.tile) { setTile(response.tile); setRegion(response.tile.region) }
      setAnalysis(response.analysis)
      if (response.artifact) setMessage('已登记产物：'+response.artifact.name+'\n'+response.artifact.uri+'\nSHA-256: '+response.artifact.checksum)
      await refresh()
    } catch (error) { if (current === generation.current) setMessage(error instanceof Error ? error.message : String(error)) }
    finally { if (current === generation.current) setBusy(false) }
  }
  // Declared after the mount reset so this assignment wins on first render; an
  // empty sidebar value leaves the user's own picker choice untouched.
  useEffect(() => { if (selection.assetId) setAssetId(selection.assetId) }, [selection.assetId])
  useEffect(() => {
    if (!selection.assetId || selection.revision == null) return
    const key = `${selection.assetId}:${selection.revision}`
    if (openedSelection.current === key) return
    openedSelection.current = key
    void run({ action:'he_open',assetId:selection.assetId })
  }, [selection.assetId, selection.revision, remote, sessionId])
  useEffect(() => {
    if (!segmentationRun || ['succeeded','failed','cancelled','timed_out'].includes(segmentationRun.status)) return
    const current=generation.current;let disposed=false;let timer:ReturnType<typeof setTimeout>|undefined
    const poll=async()=>{
      try{const response=await call({action:'he_status',he:{sessionId,action:'status',runId:segmentationRun.id}});if(disposed||current!==generation.current)return;setSegmentationRun(response.run);if(response.segmentation)setSegmentation(response.segmentation);if(response.run&&!['succeeded','failed','cancelled','timed_out'].includes(response.run.status))timer=setTimeout(()=>void poll(),1500)}catch(error){if(!disposed&&current===generation.current)setMessage(String(error))}
    }
    timer=setTimeout(()=>void poll(),1000);return()=>{disposed=true;clearTimeout(timer)}
  },[segmentationRun?.id,remote,sessionId])
  const segment=()=>{
    if(!viewer)return
    const signature=JSON.stringify({asset:viewer.assetId,region,probability})
    if(segmentRequest.current?.signature!==signature)segmentRequest.current={signature,id:crypto.randomUUID()}
    setSegmentation(undefined)
    void run({action:'he_segment',viewerId:viewer.id,expectedVersion:viewer.version,region,he:{sessionId,action:'segment',requestId:segmentRequest.current.id,segmentation:{probabilityThreshold:probability}}})
  }
  const read = (next: Required<HeRegion>): void => { if (viewer) void run({ action:'he_read',viewerId:viewer.id,expectedVersion:viewer.version,region:next }) }
  const navigate = (scale:number,dx=0,dy=0): void => {
    if (!tile || !slide) return
    const source = tile.region; const width = Math.min(slide.width,Math.max(1,Math.round(source.width*scale))); const height = Math.min(slide.height,Math.max(1,Math.round(source.height*scale)))
    const x = Math.round(Math.max(0,Math.min(slide.width-width,source.x+(source.width-width)/2+dx*source.width)))
    const y = Math.round(Math.max(0,Math.min(slide.height-height,source.y+(source.height-height)/2+dy*source.height)))
    const level = scale === 1 ? source.page : (slide.levels.find(item => width/item.downsample<=1024 && height/item.downsample<=1024)?.level ?? slide.levels.at(-1)!.level)
    read({ x,y,width,height,page:level })
  }
  const point = (event: PointerEvent<SVGSVGElement>): { x:number;y:number } => {
    const box = event.currentTarget.getBoundingClientRect()
    return { x:Math.round(Math.max(0,Math.min(slide!.width,tile!.region.x+(event.clientX-box.left)/Math.max(1,box.width)*tile!.coverageLevel0.width))),
      y:Math.round(Math.max(0,Math.min(slide!.height,tile!.region.y+(event.clientY-box.top)/Math.max(1,box.height)*tile!.coverageLevel0.height))) }
  }
  const selectRegion = (event: PointerEvent<SVGSVGElement>): void => {
    if (!drag.current || !tile) return
    const end = point(event); const start = drag.current
    if (start.x === end.x || start.y === end.y) return
    setRegion({ x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(end.x-start.x),height:Math.abs(end.y-start.y),page:tile.region.page })
  }
  return <section aria-label="HE 组织切片查看与分析" style={{ border:'1px solid var(--dsw-alias-border-l1)',borderRadius:8,padding:14 }}>
    <h3>HE 组织切片查看与分析</h3>
    <p>OpenSlide 按金字塔层级读取局部瓦片。拖动图像框选 ROI，坐标始终对应原始第 0 层；RGB 连通域统计是筛查基线；StarDist 独立任务按带上下文的块执行核分割，并保存标签、轮廓和核计数。本工作台用于科研，不提供临床诊断。</p>
    <fieldset disabled={busy} style={{ border:0,padding:0 }}>
      <label>切片资产 <select aria-label="HE 资产" value={assetId} onChange={event => setAssetId(event.target.value)}>
        <option value="">选择 SVS/NDPI/TIFF</option>{assets.filter(asset => /\.(svs|ndpi|tif|tiff)$/iu.test(asset.uri)).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
      </select></label>
      <button type="button" disabled={!assetId} onClick={() => void run({ action:'he_open',assetId })}>打开切片</button>
      <button type="button" onClick={() => void refresh().catch(error => setMessage(String(error)))}>刷新资产</button>
      <div role="tablist" aria-label="已保存 HE 视图" style={{ margin:'12px 0',display:'flex',gap:6,flexWrap:'wrap' }}>
        {viewers.map(item => <button key={item.id} role="tab" type="button" aria-selected={item.id===viewer?.id} onClick={() => void run({ action:'he_read',viewerId:item.id,expectedVersion:item.version })}>{assets.find(asset => asset.id===item.assetId)?.name ?? 'HE'} · v{item.version}</button>)}
      </div>
      {viewer && slide && <>
        <p>{slide.width}×{slide.height} · {slide.pages} 层 · {slide.engine} / {slide.format}</p>
        {slide.calibration ? <p>物理尺度：X {slide.calibration.x} µm/px，Y {slide.calibration.y} µm/px（{slide.calibration.source}）</p> : <p>物理尺度未知，仅报告像素单位。</p>}
        {slide.bounds && <p>有效边界：{slide.bounds.x},{slide.bounds.y} · {slide.bounds.width}×{slide.bounds.height}（{slide.bounds.source}）</p>}
        <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
          {(['x','y','width','height'] as const).map(key => <label key={key}>{key} <input aria-label={'HE '+key} type="number" min={key==='width'||key==='height'?1:0} value={region[key]} onChange={event => setRegion(value => ({ ...value,[key]:Number(event.target.value) }))} /></label>)}
          <label>层级 <select aria-label="HE page" value={region.page} onChange={event => setRegion(value => ({ ...value,page:Number(event.target.value) }))}>
            {(slide.levels ?? [{ level:0,width:slide.width,height:slide.height,downsample:1 }]).map(level => <option key={level.level} value={level.level}>L{level.level} · {level.width}×{level.height} · {level.downsample}×</option>)}
          </select></label>
        </div>
        <button type="button" onClick={() => read(region)}>读取区域</button>
        <button type="button" onClick={() => void run({ action:'he_analyze',viewerId:viewer.id,expectedVersion:viewer.version,region })}>统计 ROI</button>
        <button type="button" onClick={() => void run({ action:'he_export',viewerId:viewer.id,expectedVersion:viewer.version,region })}>导出并登记</button>
        <label>核概率阈值 <input aria-label="HE 核概率阈值" type="number" min={0.01} max={0.99} step={0.01} value={probability} onChange={event=>setProbability(Number(event.target.value))} /></label>
        <button type="button" disabled={!!segmentationRun&&!['succeeded','failed','cancelled','timed_out'].includes(segmentationRun.status)} onClick={segment}>StarDist 核分割</button>
        {tile && <>
          <div><button type="button" onClick={() => navigate(.5)}>放大</button><button type="button" onClick={() => navigate(2)}>缩小</button>
            <button type="button" onClick={() => navigate(1,-.5)}>向左</button><button type="button" onClick={() => navigate(1,.5)}>向右</button>
            <button type="button" onClick={() => navigate(1,0,-.5)}>向上</button><button type="button" onClick={() => navigate(1,0,.5)}>向下</button></div>
          <svg aria-label="HE 瓦片与 ROI 选择" role="img" viewBox={'0 0 '+tile.width+' '+tile.height} width={tile.width} height={tile.height}
            style={{ width:'100%',maxWidth:900,height:'auto',display:'block',background:'#fff',cursor:'crosshair',touchAction:'none' }}
            onPointerDown={event => { if (busy) return; drag.current=point(event); event.currentTarget.setPointerCapture?.(event.pointerId) }}
            onPointerMove={selectRegion} onPointerUp={event => { selectRegion(event); drag.current=undefined }} onPointerCancel={() => { drag.current=undefined }}>
            <image href={'data:image/png;base64,'+tile.pngBase64} width={tile.width} height={tile.height} />
            <rect x={(region.x-tile.region.x)/tile.downsample} y={(region.y-tile.region.y)/tile.downsample} width={region.width/tile.downsample} height={region.height/tile.downsample} fill="none" stroke="#d81b60" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </svg>
          <p>当前瓦片：L{tile.region.page}，{tile.width}×{tile.height} 像素，原始起点 {tile.region.x},{tile.region.y}</p>
        </>}
        {analysis && <div aria-label="HE 分析结果">
          <p>ROI {analysis.region.x},{analysis.region.y} · {analysis.region.width}×{analysis.region.height} · {analysis.pixels} 个采样像素</p>
          <p>平均 RGB：{analysis.meanRgb.r.toFixed(1)}, {analysis.meanRgb.g.toFixed(1)}, {analysis.meanRgb.b.toFixed(1)}</p>
          <p>核样本启发式比例：{(analysis.nucleiLikeFraction*100).toFixed(2)}%</p>
          {analysis.physical && <p>ROI 几何面积：{analysis.physical.roiAreaUm2.toFixed(2)} µm²；采样间距 {analysis.physical.samplePixelSizeUm.x}×{analysis.physical.samplePixelSizeUm.y} µm</p>}
          <ul>{analysis.notes.map(note => <li key={note}>{note}</li>)}</ul>
        </div>}
        <ul>{slide.notes.map(note => <li key={note}>{note}</li>)}</ul>
      </>}
    </fieldset>
    {segmentationRun && <div aria-label="HE 分割任务"><p>核分割任务：{segmentationRun.status} · {segmentationRun.id}</p>{segmentationRun.error&&<p role="alert">{segmentationRun.error}</p>}{!['succeeded','failed','cancelled','timed_out'].includes(segmentationRun.status)&&<button type="button" onClick={()=>void run({action:'he_cancel',he:{sessionId,action:'cancel',runId:segmentationRun.id}})}>取消核分割</button>}</div>}
    {segmentation && <div aria-label="HE StarDist 分割结果"><p>检测核数：{segmentation.count}；接触 ROI 边界：{segmentation.boundaryCount}；局部块：{segmentation.tiles}</p><img alt="HE 核分割叠加" src={'data:image/png;base64,'+segmentation.preview.pngBase64} style={{maxWidth:'100%',maxHeight:720}} /><p>绿色：核轮廓；橙色：接触 ROI 边界。模型 {segmentation.model.name}，原始标签 TIFF、核表 CSV、轮廓和执行清单已登记为任务产物。</p>{segmentation.physical&&<p>ROI 面积 {segmentation.physical.roiAreaUm2.toFixed(1)} µm²；核密度 {segmentation.physical.nucleiPerMm2.toFixed(1)}/mm²</p>}<ul>{segmentation.notes.map(note=><li key={note}>{note}</li>)}</ul></div>}
    {message && <pre role="status" style={{ whiteSpace:'pre-wrap',overflowWrap:'anywhere' }}>{message}</pre>}
  </section>
}
