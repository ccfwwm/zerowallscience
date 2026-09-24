import { useEffect, useMemo, useRef, useState } from 'react'
import type { DataAssetRecord, ViewerSessionRecord } from '@zerowallscience/research-store/types'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { CellAnalysis, CellPreview, ScienceViewerRequest, ScienceViewerResponse } from '../shared/types.js'
import type { CellSelection, CellSelectionResult } from '../shared/cell-selection.js'

import { DEFAULT_CELL_CAMERA, cameraForward, cameraInverse, zoomCellCamera, type CellCamera } from '../shared/cell-camera.js'
import { prepareCellPlot } from './cell-webgl.js'
import { CellGpuCanvas } from './cell-gpu-canvas.js'
import { useWorkbenchSelection } from './workbench-selection.js'

type Remote = TypertRemoteNamespaceMap['zerowallResearch']
export function CellViewer({ remote, sessionId }: { remote: Remote; sessionId: string }): JSX.Element {
  const [assets, setAssets] = useState<DataAssetRecord[]>([])
  const [views, setViews] = useState<ViewerSessionRecord[]>([])
  const [assetId, setAssetId] = useState('')
  const [viewer, setViewer] = useState<ViewerSessionRecord>()
  const [preview, setPreview] = useState<CellPreview>()
  const [analysis, setAnalysis] = useState<CellAnalysis>()
  const [selection, setSelection] = useState<CellSelectionResult>()
  const [gene, setGene] = useState('')
  const [groupBy, setGroupBy] = useState('')
  const [embedding, setEmbedding] = useState('')
  const [message, setMessage] = useState('')
  const [camera, setCamera] = useState<CellCamera>(DEFAULT_CELL_CAMERA)
  const [embeddingLimit, setEmbeddingLimit] = useState(100000)
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const inFlight = useRef(false)
  const workbench = useWorkbenchSelection()
  const handled = useRef('')
  const call = async (input: Omit<ScienceViewerRequest, 'sessionId'>): Promise<ScienceViewerResponse> =>
    unwrapRemoteResult('scienceViewer', await remote.scienceViewer({ ...input, sessionId })) as ScienceViewerResponse

  useEffect(() => {
    const id = ++generation.current
    setAssets([]); setViews([]); setAssetId(''); setViewer(undefined); setPreview(undefined); setAnalysis(undefined); setSelection(undefined)
    setGene(''); setGroupBy(''); setEmbedding(''); setMessage(''); setCamera(DEFAULT_CELL_CAMERA); setBusy(false); inFlight.current = false
    void call({ action: 'list' }).then(result => {
      if (id !== generation.current) return
      setAssets((result.assets ?? []).filter(a => /\.(h5ad|h5)(?:$|[?#])/iu.test(a.uri) || /\.(h5ad|h5)$/iu.test(a.name)))
      setViews((result.viewers ?? []).filter(v => v.tool === 'cells'))
    }).catch(error => { if (id === generation.current) setMessage(String(error)) })
    return () => { generation.current++ }
  }, [remote, sessionId])

  // assetOverride lets the workbench-selection effect open an asset in the same tick
  // it sets the dropdown, before React has committed that state back into assetId.
  const run = async (action: 'cell_open' | 'cell_read' | 'cell_analyze' | 'cell_export' | 'cell_select' | 'cell_export_selection' | 'cell_view', restore?: ViewerSessionRecord, geometry?: CellSelection | null, assetOverride?: string): Promise<void> => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setMessage('')
    const id = generation.current
    const selected = restore ?? viewer
    try {
      const result = await call({
        action, ...(action === 'cell_open' ? { assetId: assetOverride ?? assetId } : selected ? { viewerId: selected.id, expectedVersion: selected.version } : {}),
        gene: restore ? String(restore.state.gene ?? '') : gene.trim(),
        groupBy: restore ? String(restore.state.groupBy ?? '') : groupBy,
        embedding: geometry?.embedding ?? (restore ? String(restore.state.embedding ?? '') : embedding),
        ...(geometry === undefined ? {} : { cellSelection: geometry }),
        cellLimit: restore ? Number(restore.state.cellLimit ?? 2000) : 2000,
        embeddingLimit: restore ? Number(restore.state.embeddingLimit ?? 100000) : embeddingLimit,
        ...(!restore && selected ? { cellCamera: camera } : {}),
      })
      if (id !== generation.current) return
      const cell = result.cell
      if (action !== 'cell_view') { setPreview(cell?.preview); setAnalysis(cell?.analysis); setSelection(cell?.selection) }
      if (cell?.viewer) {
        setViewer(cell.viewer); setAssetId(cell.viewer.assetId)
        setCamera((cell.viewer.state.camera as unknown as CellCamera) ?? DEFAULT_CELL_CAMERA); setEmbeddingLimit(Number(cell.viewer.state.embeddingLimit ?? 100000))
        setGene(String(cell.viewer.state.gene ?? '')); setGroupBy(String(cell.viewer.state.groupBy ?? '')); setEmbedding(String(cell.viewer.state.embedding ?? ''))
        setViews(items => [cell.viewer!, ...items.filter(v => v.id !== cell.viewer!.id)])
      }
      if (cell?.artifact) setMessage('已登记产物：' + cell.artifact.name + '\n' + cell.artifact.uri + '\nSHA-256: ' + cell.artifact.checksum)
    } catch (error) { if (id === generation.current) setMessage(error instanceof Error ? error.message : String(error)) }
    finally { if (id === generation.current) { setBusy(false); inFlight.current = false } }
  }

  // Mirror the workbench sidebar pick into the local dropdown, so the panel shows
  // the file the user selected. An empty selection leaves the dropdown untouched,
  // because then the user is choosing inside the viewer.
  useEffect(() => { if (workbench.assetId) setAssetId(workbench.assetId) }, [workbench.assetId])
  useEffect(() => {
    if (!workbench.assetId || workbench.revision == null) return
    // Keyed by revision: selecting the same asset again is a second request, but a
    // re-render of the same selection must not reissue the remote open call.
    const key = `${workbench.assetId}:${workbench.revision}`
    if (handled.current === key) return
    handled.current = key
    // The sibling effect only queues the dropdown update, so this request carries the
    // sidebar pick explicitly instead of reading a stale assetId out of state.
    void run('cell_open', undefined, undefined, workbench.assetId)
  }, [workbench.assetId, workbench.revision])

  return <section style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 14, marginTop: 14 }}>
    <h3 style={{ marginTop: 0 }}>细胞查看器 · H5AD / AnnData</h3>
    <p>资料预览前 2,000 个细胞，嵌入点单独按显示上限读取；QC 扫描全量 X。X 的尺度尚未核验，数值总和不能自动解释为原始 counts。</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <select aria-label="H5AD 数据资产" disabled={busy} value={assetId} onChange={e => {
        generation.current++; setAssetId(e.target.value); setViewer(undefined); setPreview(undefined); setAnalysis(undefined); setSelection(undefined); setGene(''); setGroupBy(''); setEmbedding(''); setMessage('')
      }}>
        <option value="">选择 H5AD 资产</option>{assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <select aria-label="恢复细胞视图" disabled={busy} value={viewer?.id ?? ''} onChange={e => { const v = views.find(v => v.id === e.target.value); if (v) void run('cell_read', v) }}>
        <option value="">恢复已有视图</option>{views.map(v => <option key={v.id} value={v.id}>{assets.find(a => a.id === v.assetId)?.name ?? v.assetId} · v{v.version}</option>)}
      </select>
      <select aria-label="细胞嵌入" disabled={busy} value={embedding} onChange={e => setEmbedding(e.target.value)}>
        <option value="">自动选择嵌入</option>{preview?.summary.embeddings.map(e => <option key={e.key} value={e.key}>{e.key} ({e.dimensions}D)</option>)}
      </select>
      <select aria-label="嵌入点显示上限" disabled={busy} value={embeddingLimit} onChange={e => setEmbeddingLimit(Number(e.target.value))}><option value={2000}>2,000 点</option><option value={100000}>100,000 点</option><option value={200000}>200,000 点</option></select>
      <input aria-label="基因" disabled={busy} placeholder="var 索引中的基因（可选）" value={gene} onChange={e => setGene(e.target.value)} />
      <select aria-label="分组列" disabled={busy} value={groupBy} onChange={e => setGroupBy(e.target.value)}>
        <option value="">不分组</option>{preview?.summary.obsColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
      </select>
      <button type="button" onClick={() => void run('cell_open')} disabled={!assetId || busy}>打开</button>
      <button type="button" onClick={() => void run('cell_read')} disabled={!viewer || busy}>刷新查看</button>
      <button type="button" onClick={() => void run('cell_analyze')} disabled={!viewer || busy}>运行 QC</button>
      <button type="button" onClick={() => void run('cell_export')} disabled={!viewer || busy}>导出产物</button>
      <button type="button" onClick={() => void run('cell_view')} disabled={!viewer || busy}>保存视角</button>
      <button type="button" onClick={() => void run('cell_export_selection')} disabled={!viewer || !selection || busy}>导出选中细胞 CSV</button>
    </div>
    {busy && <p role="status">正在读取；较大文件需要流式哈希核验…</p>}
    {message && <pre role="status" style={{ whiteSpace: 'pre-wrap' }}>{message}</pre>}
    {preview && <div style={{ marginTop: 10 }}>
      <strong>{preview.summary.nObs.toLocaleString()} cells × {preview.summary.nVars.toLocaleString()} genes</strong>
      <p>预览前 {preview.cells.length} 个细胞{preview.truncated ? '（已截断，非随机抽样）' : ''}；嵌入点 {preview.embedding?.points.length ?? 0}。</p>
      {selection && <p role="status">选区匹配全部 {selection.total} 个细胞中的 {selection.count} 个（包含边界）；高亮仅显示预览中的匹配细胞。</p>}
      {preview.embedding ? <EmbeddingPlot key={viewer?.id + ':' + preview.embedding.key} preview={preview} groupBy={String(viewer?.state.groupBy ?? '')} selection={selection} busy={busy} camera={camera} onCamera={setCamera} onSelect={geometry => void run('cell_select', undefined, geometry)} /> : <p>此文件没有可用的二维嵌入；不会自动生成 UMAP/PCA。</p>}
    </div>}
    {analysis && <div>
      <strong>全量 X 描述统计 · {analysis.qc.cells} cells</strong>
      <p>X 行总和：{analysis.qc.totalCounts.min}–{analysis.qc.totalCounts.max}，均值 {analysis.qc.totalCounts.mean}；非零 feature 数均值 {analysis.qc.detectedGenes.mean}。</p>
      {analysis.groups && <p>分组：{analysis.groups.map(g => (g.group === null ? '缺失' : String(g.group)) + '=' + g.cells).join(' · ')}</p>}
      {analysis.gene && <p>基因 {analysis.gene.gene}：全量 {analysis.gene.cells} cells 中 {analysis.gene.detectedCells} 个非零，均值 {analysis.gene.mean}，最大值 {analysis.gene.max}。</p>}
      {analysis.qc.notes.map(note => <p key={note}><small>{note}</small></p>)}
    </div>}
  </section>
}

function EmbeddingPlot({ preview, groupBy, selection, busy, camera, onCamera, onSelect }: { preview: CellPreview; groupBy: string; selection: CellSelectionResult | undefined; busy: boolean; camera: CellCamera; onCamera: (camera: CellCamera) => void; onSelect: (geometry: CellSelection | null) => void }): JSX.Element {
  const [drawing,setDrawing]=useState(false); const [vertices,setVertices]=useState<Array<[number,number]>>([])
  const [mode,setMode]=useState<'webgl'|'unavailable'>('unavailable')
  const svg=useRef<SVGSVGElement>(null); const drag=useRef<{x:number;y:number;camera:CellCamera}>()
  const data=useMemo(()=>prepareCellPlot(preview,groupBy,selection),[preview,groupBy,selection])
  const {minX,maxX,minY,maxY}=data.bounds
  const points=preview.embedding?.points ?? []
  const screen=(x:number,y:number):[number,number]=>{ const [cx,cy]=cameraForward(maxX===minX?0:2*(x-minX)/(maxX-minX)-1,maxY===minY?0:2*(y-minY)/(maxY-minY)-1,camera);return [24+(cx+1)*236,256-(cy+1)*116] }
  // Colour and expression lookups are positional in the full point list, so the
  // decimated subset carries the original slot instead of its own new index.
  const pointSlots=useMemo(()=>new Map(points.map((p,i)=>[p,i])),[points])
  const clip=(clientX:number,clientY:number):[number,number] | undefined=>{
    const box=svg.current!.getBoundingClientRect();const scale=Math.min(box.width/520,box.height/280)
    if(!(scale>0))return
    const x=(clientX-box.left-(box.width-520*scale)/2)/scale;const y=(clientY-box.top-(box.height-280*scale)/2)/scale
    return [(x-24)/236-1,(256-y)/116-1]
  }
  useEffect(()=>{
    const element=svg.current!
    const wheel=(event:WheelEvent)=>{
      if(busy || drawing)return
      const p=clip(event.clientX,event.clientY)
      if(!p || Math.abs(p[0])>1 || Math.abs(p[1])>1)return
      event.preventDefault();onCamera(zoomCellCamera(camera,Math.exp(-event.deltaY*.002),p[0],p[1]))
    }
    element.addEventListener('wheel',wheel,{passive:false})
    return()=>element.removeEventListener('wheel',wheel)
  },[camera,busy,drawing,onCamera])
  const polygon=drawing ? vertices : selection?.geometry.polygon ?? []
  // WebGL is the fast path, but it is also the only path on a machine without a
  // GPU context. The SVG fallback used to draw nothing above 10,000 points, which
  // left the panel an empty box on exactly the files that need a preview most, so
  // it now strides through the point list instead of giving up: the shape of the
  // embedding survives, and the caption says how many points are shown.
  const fallback=useMemo(()=>{
    if(points.length<=10000) return points
    const step=Math.ceil(points.length/5000)
    return points.filter((_,index)=>index%step===0)
  },[points])
  return <div>
    <p>{preview.embedding?.key} · 前两维 · {points.length.toLocaleString()} 点 · {mode==='webgl'?'WebGL':'WebGL 不可用'} · 缩放 {camera.zoom.toFixed(2)}×{data.expressionRange ? ' · '+preview.expression?.gene+' 表达 '+data.expressionRange.join('–') : ''}</p>
    {groupBy && !data.expressionRange && <p>分组：{data.groups.slice(0,16).join(' · ')}{data.groups.length>8?'（颜色按 8 色循环）':''}</p>}
    {mode==='unavailable' && <p role="status">{fallback.length===points.length ? '当前使用有界 SVG 回退。' : `当前设备未提供 WebGL；SVG 回退按步长抽稀显示 ${fallback.length.toLocaleString()} / ${points.length.toLocaleString()} 点，QC 与圈选仍处理全量。`}</p>}
    <div>
      <button type="button" disabled={busy} onClick={()=>onCamera(DEFAULT_CELL_CAMERA)}>重置视角</button>
      <button type="button" disabled={busy || maxX===minX || maxY===minY} onClick={()=>{setDrawing(true);setVertices([])}}>绘制多边形选区</button>
      {drawing && <><button type="button" disabled={busy || vertices.length<3} onClick={()=>{onSelect({embedding:preview.embedding!.key,axes:[0,1],polygon:vertices});setDrawing(false)}}>保存选区并核验全量细胞</button><button type="button" disabled={busy} onClick={()=>setVertices(v=>v.slice(0,-1))}>撤销顶点</button><button type="button" onClick={()=>{setDrawing(false);setVertices([])}}>取消绘制</button><small>依次点击顶点（{vertices.length}/128），包含边界。</small></>}
      <button type="button" disabled={busy || !selection} onClick={()=>{setDrawing(false);setVertices([]);onSelect(null)}}>清除选区</button>
    </div>
    <p><small>滚轮缩放，拖动平移；“保存视角”持久化当前位置。显示上限以内为文件顺序前 N 点，QC/圈选仍处理全量。</small></p>
    <div style={{position:'relative',maxWidth:720,width:'100%',aspectRatio:'520 / 280'}}>
      <CellGpuCanvas data={data} camera={camera} onMode={setMode} />
      <svg ref={svg} aria-label={(preview.embedding?.key ?? 'embedding')+' scatter'} viewBox="0 0 520 280" role="img"
        onPointerDown={event=>{if(busy||drawing)return;const p=clip(event.clientX,event.clientY);if(!p)return;drag.current={x:p[0],y:p[1],camera};event.currentTarget.setPointerCapture?.(event.pointerId)}}
        onPointerMove={event=>{if(!drag.current||busy||drawing)return;const p=clip(event.clientX,event.clientY);if(!p)return;const original=drag.current;onCamera({...original.camera,panX:Math.max(-200,Math.min(200,original.camera.panX+p[0]-original.x)),panY:Math.max(-200,Math.min(200,original.camera.panY+p[1]-original.y))})}}
        onPointerUp={()=>{drag.current=undefined}} onPointerCancel={()=>{drag.current=undefined}}
        onClick={event=>{if(!drawing||busy||vertices.length>=128)return;const p=clip(event.clientX,event.clientY);if(!p||Math.abs(p[0])>1||Math.abs(p[1])>1)return;const [x,y]=cameraInverse(p[0],p[1],camera);setVertices(v=>[...v,[minX+(x+1)/2*(maxX-minX),minY+(y+1)/2*(maxY-minY)]])}}
        style={{position:'absolute',inset:0,width:'100%',height:'100%',touchAction:'none',cursor:drawing?'crosshair':'grab',outline:'1px solid var(--dsw-alias-border-l1)'}}>
        <line x1="24" y1="256" x2="496" y2="256" stroke="currentColor" opacity=".25" /><line x1="24" y1="24" x2="24" y2="256" stroke="currentColor" opacity=".25" />
        {mode==='unavailable' && fallback.map(p=>{const i=pointSlots.get(p);if(i===undefined)return null;const [x,y]=screen(p.x,p.y);return x>=24&&x<=496&&y>=24&&y<=256 ? <circle key={p.index} cx={x} cy={y} r="3" fill={'rgb('+[0,1,2].map(c=>Math.round(data.colors[4*i+c]!*255)).join(',')+')'} opacity={data.colors[4*i+3]}><title>{p.index}: ({p.x}, {p.y})</title></circle>:null})}
        {polygon.length>0 && <polyline points={[...polygon,...(drawing?[]:[polygon[0]!])].map(p=>screen(p[0],p[1]).join(',')).join(' ')} fill={drawing?'none':'#2563eb12'} stroke="#2563eb" strokeWidth="2" pointerEvents="none" />}
      </svg>
    </div>
  </div>
}

