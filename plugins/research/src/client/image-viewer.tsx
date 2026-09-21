import { useEffect, useRef, useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '../../lib/typert.remote-client.js'
import type { AnnotationRevisionRecord, DataAssetRecord, ImageAnnotations, ImageRoi, ViewerSessionRecord } from '@zerowallscience/research-store/types'
import type { ImagePreview, ImageViewState, ScienceViewerRequest, ScientificEngineLaunchResult } from '../shared/types.js'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'
import { WesternBlotPanel } from './western-blot-panel.js'

type Remote = TypertRemoteNamespaceMap['zerowallResearch']
const initialView: ImageViewState = { page: 0, zoom: 1, panX: 0, panY: 0 }

function pageForOmePosition(order: string, sizes: Record<string, number>, position: { z?: number; c?: number; t?: number }): number {
  let page = 0
  let multiplier = 1
  for (const axis of order.slice(2).split('').filter(axis => axis === 'Z' || axis === 'C' || axis === 'T')) {
    const size = Number(sizes[axis] ?? 1)
    const value = position[axis.toLowerCase() as 'z' | 'c' | 't'] ?? 0
    page += value * multiplier
    multiplier *= size
  }
  return page
}

export function ImageViewer({ remote, sessionId }: { remote: Remote; sessionId: string }): JSX.Element {
  const [assets, setAssets] = useState<DataAssetRecord[]>([])
  const [views, setViews] = useState<ViewerSessionRecord[]>([])
  const [assetId, setAssetId] = useState(''); const [importId, setImportId] = useState('')
  const [viewer, setViewer] = useState<ViewerSessionRecord>()
  const [image, setImage] = useState<ImagePreview>()
  const [axisPosition, setAxisPosition] = useState<{ z?: number; c?: number; t?: number }>({})
  const [state, setState] = useState(initialView)
  const [annotations, setAnnotations] = useState<AnnotationRevisionRecord[]>([])
  const [launches, setLaunches] = useState<ScientificEngineLaunchResult[]>([])
  const [base, setBase] = useState<string | null>(null)
  const [draft, setDraft] = useState<ImageAnnotations>()
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'rectangle' | 'point' | 'polygon'>('rectangle')
  const [name, setName] = useState('ROI')
  const [polygon, setPolygon] = useState<Array<[number, number]>>([])
  const drag = useRef<[number, number]>()
  const generation = useRef(0); const locked = useRef(false)
  const call = async (input: Omit<ScienceViewerRequest, 'sessionId'>) => unwrapRemoteResult('scienceViewer', await remote.scienceViewer({ ...input, sessionId }))
  const list = async (current: number) => {
    const response = await call({ action: 'list' })
    if (current !== generation.current) return
    setAssets(response.assets ?? []); setViews(response.viewers?.filter(item => item.tool === 'image') ?? [])
    const native = await call({ action: 'native_status' })
    if (current === generation.current) setLaunches(native.launches ?? [])
  }
  useEffect(() => {
    const current = ++generation.current
    setViewer(undefined); setImage(undefined); setDraft(undefined); setViews([]); setAssets([]); setDirty(false); setBusy(false); locked.current = false; setMessage(''); setAssetId(''); setImportId(''); setPolygon([])
    void list(current).catch(error => { if (current === generation.current) setMessage(String(error)) })
    return () => { generation.current++ }
  }, [remote, sessionId])
  const run = async (input: Omit<ScienceViewerRequest, 'sessionId'>) => {
    if (locked.current) return
    const current = generation.current; locked.current = true; setBusy(true); setMessage('')
    try {
      const response = await call(input)
      if (current !== generation.current) return
      if (response.viewer) {
        setViewer(response.viewer)
        const saved = response.viewer.state
        setState({ page: Number(saved.page), zoom: Number(saved.zoom), panX: Number(saved.panX), panY: Number(saved.panY) })
      }
      if (response.image) {
        setImage(response.image)
        setAxisPosition(response.image.axes?.position ?? {})
      }
      if (response.annotations) setAnnotations(response.annotations)
      if (response.annotationSave?.conflict) {
        setMessage('并发修改：你的标注已保存为冲突分支，当前标注没有被覆盖。请对比修订，再选择要采用的内容。')
        setDirty(false); setPolygon([])
      } else if (input.action !== 'image_save' && input.action !== 'annotation_export') {
        setBase(response.annotationHead?.id ?? null)
        setDraft(response.annotationHead?.payload ?? (response.image ? { coordinates: response.image.coordinates, rois: [] } : draft))
        setDirty(false); setPolygon([])
      }
      if (response.artifact && !response.annotationSave?.conflict) setMessage(`已登记标注产物：${response.artifact.id}\n${response.artifact.uri}\nSHA-256: ${response.artifact.checksum}`)
      if (response.launch) setMessage(`已启动 ${response.launch.id} 标注交换。请在原生工具中编辑并点击 Save ROI return，然后回到此处收取；仅启动进程不代表窗口就绪。`)
      await list(current)
    } catch (error) { if (current === generation.current) setMessage(error instanceof Error ? error.message : String(error)) }
    finally { if (current === generation.current) { locked.current = false; setBusy(false) } }
  }
  const head = annotations.filter(item => item.status === 'accepted').at(-1)
  const viewDirty = Boolean(viewer && Object.entries(state).some(([key, value]) => viewer.state[key] !== value))
  const unsaved = dirty || polygon.length > 0
  const add = (roi: ImageRoi) => { setDraft(previous => previous ? { ...previous, rois: [...previous.rois, roi] } : previous); setDirty(true) }
  const location = (event: React.PointerEvent<SVGSVGElement>): [number, number] => {
    const box = event.currentTarget.getBoundingClientRect()
    return [Math.max(0, Math.min(image!.coordinates.width, (event.clientX-box.left)/box.width*image!.coordinates.width/state.zoom-state.panX)), Math.max(0, Math.min(image!.coordinates.height, (event.clientY-box.top)/box.height*image!.coordinates.height/state.zoom-state.panY))]
  }
  const roiBase = () => ({ id: crypto.randomUUID(), name: name.trim() || 'ROI', page: image!.page })
  const pointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (busy || viewDirty || event.button !== 0) return
    const [x,y] = location(event)
    if (mode === 'point') add({ ...roiBase(), kind: 'point', x, y })
    else if (mode === 'polygon') setPolygon(points => [...points, [x,y]])
    else { drag.current = [x,y]; event.currentTarget.setPointerCapture(event.pointerId) }
  }
  const pointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return
    const [a,b] = drag.current; drag.current = undefined
    if (busy || viewDirty) return
    const [x,y] = location(event)
    if (Math.abs(x-a) > 0 && Math.abs(y-b) > 0) add({ ...roiBase(), kind: 'rectangle', x: Math.min(x,a), y: Math.min(y,b), width: Math.abs(x-a), height: Math.abs(y-b) })
  }
  return <section aria-label="图像查看与 ROI" style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
    <h3>图像查看与 ROI 修订</h3>
    <p>PNG/JPEG/TIFF 预览（当前上限 128 MiB、每页 1 亿像素）。原图坐标保存；多维轴序、超大图像分块和强度测量仍需专用适配。</p>
    <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
      <label>图像资产 <select aria-label="内置图像资产" value={assetId} onChange={event => setAssetId(event.target.value)}><option value="">选择图像</option>{assets.filter(asset => /\.(png|jpe?g|tiff?|pgm)$/iu.test(asset.uri)).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
      <button type="button" disabled={!assetId || unsaved} onClick={() => void run({ action: 'image_open', assetId })}>打开图像</button>
      <button type="button" onClick={() => void list(generation.current).catch(error => setMessage(String(error)))}>刷新图像资产</button>
      <div role="tablist" aria-label="已保存图像视图">{views.map(view => <button key={view.id} type="button" role="tab" aria-selected={viewer?.id===view.id} disabled={unsaved} onClick={() => void run({ action: 'image_read', viewerId: view.id })}>{assets.find(item => item.id === view.assetId)?.name ?? '图像'} · v{view.version}</button>)}</div>
      {viewer && image && draft && <>
        <p>{image.coordinates.width}×{image.coordinates.height} 原始像素 · {image.channels} 分量 · {image.depth} · {image.coordinates.pages} 页 · 当前标注修订 {head?.revision ?? '未保存'}</p>
        {image.axes && <>
          <p aria-label="OME 轴位置">OME {image.axes.order} · {Object.entries(image.axes.sizes).map(([axis, size]) => `${axis}${size}`).join(' · ')} · 当前页 {image.axes.position?.page ?? image.page}{image.axes.position?.z === undefined ? '' : ` · Z${image.axes.position.z}`}{image.axes.position?.c === undefined ? '' : ` · C${image.axes.position.c}`}{image.axes.position?.t === undefined ? '' : ` · T${image.axes.position.t}`}{image.axes.physicalSize?.x === undefined ? '' : ` · 像素 ${image.axes.physicalSize.x}×${image.axes.physicalSize.y ?? image.axes.physicalSize.x} ${image.axes.physicalSize.unit ?? ''}/px`}</p>
          <div aria-label="OME 轴选择">
            {(['z', 'c', 't'] as const).filter(axis => image.axes!.sizes[axis.toUpperCase()] !== undefined && Number(image.axes!.sizes[axis.toUpperCase()]) > 1).map(axis => {
              const size = Number(image.axes!.sizes[axis.toUpperCase()])
              return <label key={axis}>{axis.toUpperCase()} <input aria-label={`OME ${axis.toUpperCase()} 位置`} type="number" min={0} max={size - 1} value={axisPosition[axis] ?? 0} disabled={unsaved} onChange={event => {
                const next = { ...axisPosition, [axis]: Number(event.target.value) }
                setAxisPosition(next)
                setState(previous => ({ ...previous, page: pageForOmePosition(image.axes!.order, image.axes!.sizes, next) }))
              }} /></label>
            })}
            <span>轴选择会更新当前页；保存图像视角后恢复该位置。</span>
          </div>
        </>}
        <div>{([['page','页码（从 0 开始）'],['zoom','缩放'],['panX','水平平移（像素）'],['panY','垂直平移（像素）']] as const).map(([key,label]) => <label key={key}>{label} <input aria-label={label} type="number" style={{ width: 85 }} value={state[key]} disabled={unsaved} onChange={event => setState(previous => ({ ...previous, [key]: Number(event.target.value) }))} /></label>)}
          <button type="button" disabled={unsaved} onClick={() => void run({ action: 'image_save', viewerId: viewer.id, expectedVersion: viewer.version, imageState: state })}>保存图像视角</button>
        </div>
        <label>ROI 名称 <input aria-label="ROI 名称" value={name} maxLength={200} onChange={event => setName(event.target.value)} /></label>
        <label>绘制方式 <select aria-label="ROI 绘制方式" value={mode} onChange={event => { setMode(event.target.value as typeof mode); setPolygon([]) }}><option value="rectangle">拖动矩形</option><option value="point">点击标记点</option><option value="polygon">逐点多边形</option></select></label>
        {mode==='polygon' && <button type="button" disabled={polygon.length<3} onClick={() => { add({ ...roiBase(), kind: 'polygon', points: polygon }); setPolygon([]) }}>完成多边形</button>}
        <svg aria-label="图像 ROI 画布" role="img" viewBox={`${-state.panX} ${-state.panY} ${image.coordinates.width/state.zoom} ${image.coordinates.height/state.zoom}`} preserveAspectRatio="none" onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = undefined }} style={{ display: 'block', width: '100%', height: 'auto', maxWidth: 1200, aspectRatio: `${image.coordinates.width}/${image.coordinates.height}`, background: '#111', touchAction: 'none', cursor: 'crosshair' }}>
          <image href={`data:image/png;base64,${image.pngBase64}`} x={0} y={0} width={image.coordinates.width} height={image.coordinates.height} />
          {draft.rois.filter(roi=>roi.page===image.page).map(roi => <g key={roi.id} stroke="#ffcf33" fill="none" strokeWidth={1}>
            {roi.kind==='rectangle' ? <rect x={roi.x} y={roi.y} width={roi.width} height={roi.height} vectorEffect="non-scaling-stroke" /> : roi.kind==='point' ? <circle cx={roi.x} cy={roi.y} r={Math.max(image.coordinates.width/300/state.zoom,0.5)} /> : <polygon points={roi.points.map(point=>point.join(',')).join(' ')} vectorEffect="non-scaling-stroke" />}
            <title>{roi.name}</title>
          </g>)}
          {polygon.length>0 && <polyline points={polygon.map(point=>point.join(',')).join(' ')} stroke="#69dbff" fill="none" vectorEffect="non-scaling-stroke" />}
        </svg>
        {viewDirty && <p>视角尚未保存；保存后再绘制标注。</p>}
        <ul>{image.notes.map(note=><li key={note}>{note}</li>)}</ul>
        <p>物理标定：{draft.coordinates.calibration ? `${draft.coordinates.calibration.x} × ${draft.coordinates.calibration.y} ${draft.coordinates.calibration.unit}/px，来源 ${draft.coordinates.calibration.source}` : '未知；不从 DPI 推断显微镜比例尺。'}</p>
        <ul aria-label="ROI 列表">{draft.rois.map(roi=><li key={roi.id}>{roi.name} · 页 {roi.page} · {roi.kind} <button type="button" onClick={()=>{setDraft({...draft,rois:draft.rois.filter(item=>item.id!==roi.id)});setDirty(true)}}>移除 {roi.name}</button></li>)}</ul>
        <button type="button" disabled={viewDirty || polygon.length>0} onClick={()=>void run({ action:'annotation_save',viewerId:viewer.id,expectedVersion:viewer.version,annotation:{expectedRevisionId:base,payload:draft} })}>保存 ROI 修订</button>
        <button type="button" disabled={!unsaved} onClick={()=>{setDraft(head?.payload??{coordinates:image.coordinates,rois:[]});setBase(head?.id??null);setDirty(false);setPolygon([])}}>放弃未保存标注</button>
        <button type="button" disabled={!head || unsaved || viewDirty} onClick={()=>void run({action:'annotation_export',viewerId:viewer.id,expectedVersion:viewer.version})}>导出当前 ROI</button>
        <div>{(['fiji','napari'] as const).map(engine=><button key={engine} type="button" disabled={!head || unsaved || viewDirty || image.coordinates.pages!==1} onClick={()=>void run({action:'annotation_launch',viewerId:viewer.id,expectedVersion:viewer.version,engine})}>在 {engine} 中编辑 ROI</button>)}</div>
        <p>原生 ROI 交换目前支持单页图像的矩形、多边形和单点。Fiji 中须将新增选区加入 ROI Manager；每次编辑保存一份不可覆盖的回传文件。标签掩膜和多维图层另行适配。</p>
        <ul aria-label="原生标注交换">{launches.filter(item=>item.annotationBridge?.viewerId===viewer.id).map(item=><li key={item.launchId}>{item.id} · {item.createdAt} · {item.status}<button type="button" disabled={unsaved || viewDirty} onClick={()=>void run({action:'annotation_collect',viewerId:viewer.id,expectedVersion:viewer.version,launchId:item.launchId})}>收取 {item.id} 标注回传</button></li>)}</ul>
        <div><label>回传标注 JSON <select aria-label="回传标注资产" value={importId} onChange={event=>setImportId(event.target.value)}><option value="">选择已登记交换文件</option>{assets.filter(asset=>/\.json$/iu.test(asset.uri)).map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
          <button type="button" disabled={!importId || unsaved || viewDirty} onClick={()=>void run({action:'annotation_import',viewerId:viewer.id,expectedVersion:viewer.version,importAssetId:importId})}>导入回传修订</button>
        </div>
        <details><summary>修订历史与冲突（{annotations.length}）</summary><ul>{annotations.map(revision=><li key={revision.id}>#{revision.revision} · {revision.status==='conflict'?'冲突分支':'已接受'} · {revision.origin} · {revision.payload.rois.length} ROI <button type="button" disabled={unsaved} onClick={()=>{setDraft(revision.payload);setBase(head?.id??null);setDirty(true);setPolygon([])}}>采用修订 {revision.revision} 的内容再保存</button></li>)}</ul></details>
        {typeof remote.fijiWorkflow === 'function' && <WesternBlotPanel key={`${sessionId}:${viewer.id}`} remote={remote} sessionId={sessionId} viewerId={viewer.id} viewerVersion={viewer.version} revisionId={head?.id} annotation={head?.payload??draft} disabled={unsaved||viewDirty||busy} />}
      </>}
    </fieldset>
    {message && <pre role="status" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{message}</pre>}
  </section>
}
