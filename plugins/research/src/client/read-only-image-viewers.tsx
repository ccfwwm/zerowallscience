import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { DataAssetRecord, ViewerSessionRecord } from '@zerowallscience/research-store/types'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'
import type { HeRegion, HeSlideMetadata, HeTile } from '../shared/he.js'
import type { HeResponse, ImagePreview, ScienceViewerRequest, ScienceViewerResponse } from '../shared/types.js'
import { useWorkbenchSelection } from './workbench-selection.js'
import { ViewerLanding } from './viewer-landing.js'
import styles from './read-only-image-viewers.module.css'

type Remote = TypertRemoteNamespaceMap['zerowallResearch']
type ViewerStatus = '未选择文件' | '正在加载' | '已加载' | '打开失败'
type CommonProps = { remote: Remote; sessionId: string; onPickFile?: () => void }

function assetName(assets: DataAssetRecord[], assetId: string): string {
  return assets.find(asset => asset.id === assetId)?.name ?? assetId
}

export function ReadOnlyImageViewer({ remote, sessionId, onPickFile }: CommonProps): JSX.Element {
  const selection = useWorkbenchSelection()
  const [assets, setAssets] = useState<DataAssetRecord[]>([])
  const [assetId, setAssetId] = useState('')
  const [viewer, setViewer] = useState<ViewerSessionRecord>()
  const [image, setImage] = useState<ImagePreview>()
  const [status, setStatus] = useState<ViewerStatus>('未选择文件')
  const [message, setMessage] = useState('')
  const [zoom, setZoom] = useState(1)
  const opened = useRef('')
  const request = useRef(0)

  const call = async (input: Omit<ScienceViewerRequest, 'sessionId'>): Promise<ScienceViewerResponse> =>
    unwrapRemoteResult('scienceViewer', await remote.scienceViewer({ ...input, sessionId }))

  const refresh = async (): Promise<void> => {
    const current = request.current
    const response = await call({ action: 'list' })
    if (current === request.current) setAssets(response.assets ?? [])
  }

  useEffect(() => { ++request.current; setAssetId(''); setViewer(undefined); setImage(undefined); setStatus('未选择文件'); void refresh().catch(error => setMessage(String(error))); return () => { ++request.current } }, [remote, sessionId])

  const open = async (nextAssetId: string): Promise<void> => {
    const current = ++request.current
    setAssetId(nextAssetId); setViewer(undefined); setImage(undefined)
    if (!nextAssetId) { setStatus('未选择文件'); setMessage(''); return }
    setStatus('正在加载'); setMessage('')
    try {
      const response = await call({ action: 'image_open', assetId: nextAssetId })
      if (current !== request.current) return
      if (!response.viewer || !response.image) throw new Error('图像查看器未返回可显示的图像。')
      setViewer(response.viewer); setImage(response.image); setZoom(1); setStatus('已加载')
      await refresh()
    } catch (error) {
      if (current === request.current) { setStatus('打开失败'); setMessage(error instanceof Error ? error.message : String(error)) }
    }
  }

  useEffect(() => {
    if (!selection.assetId || selection.revision == null) return
    const key = `${selection.assetId}:${selection.revision}`
    if (opened.current === key) return
    opened.current = key
    void open(selection.assetId)
  }, [selection.assetId, selection.revision])

  const changePage = async (page: number): Promise<void> => {
    if (!viewer || !image || page < 0 || page >= image.coordinates.pages) return
    const current = ++request.current
    setStatus('正在加载')
    try {
      const response = await call({ action: 'image_save', viewerId: viewer.id, expectedVersion: viewer.version, imageState: { page, zoom: 1, panX: 0, panY: 0 } })
      if (current !== request.current) return
      if (!response.viewer || !response.image) throw new Error('图像页读取失败。')
      setViewer(response.viewer); setImage(response.image); setStatus('已加载')
    } catch (error) { if (current === request.current) { setStatus('打开失败'); setMessage(error instanceof Error ? error.message : String(error)) } }
  }

  return <section className={styles.viewer} aria-label="图像查看器">
    {image && viewer && <div className={styles.meta}><label>当前资产 <select aria-label="图像资产" value={assetId} onChange={event => void open(event.target.value)}><option value="">选择图像</option>{assets.filter(asset => /\.(png|jpe?g|tiff?|pgm|zarr)(?:[\\/]|$)/iu.test(asset.uri)).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label><span className={styles.badge}>{status}</span><button type="button" onClick={onPickFile}>更换文件</button></div>}
    {image && viewer ? <>
      <div className={styles.toolbar}><span>{assetName(assets, viewer.assetId)} · {image.format} · {image.coordinates.width} × {image.coordinates.height}</span><div className={styles.controls}><button type="button" title="缩小" aria-label="缩小" onClick={() => setZoom(value => Math.max(.25, value / 1.25))}><Minus size={16} /></button><span>{Math.round(zoom * 100)}%</span><button type="button" title="放大" aria-label="放大" onClick={() => setZoom(value => Math.min(8, value * 1.25))}><Plus size={16} /></button>{image.coordinates.pages > 1 && <><button type="button" title="上一页" aria-label="上一页" disabled={image.page === 0} onClick={() => void changePage(image.page - 1)}><ChevronLeft size={16} /></button><span>{image.page + 1} / {image.coordinates.pages}</span><button type="button" title="下一页" aria-label="下一页" disabled={image.page + 1 >= image.coordinates.pages} onClick={() => void changePage(image.page + 1)}><ChevronRight size={16} /></button></>}</div></div>
      <div className={styles.stage}><img alt={assetName(assets, viewer.assetId)} src={`data:image/png;base64,${image.pngBase64}`} style={{ width: `${zoom * 100}%`, maxWidth: zoom > 1 ? 'none' : '100%' }} /></div>
    </> : <div data-empty="true"><ViewerLanding tool="imagej" status={status} message={message} {...(onPickFile ? { onPickFile } : {})} {...(assets.length ? { assetPicker: <select aria-label="图像资产" value={assetId} onChange={event => void open(event.target.value)}><option value="">已有图像</option>{assets.filter(asset => /\.(png|jpe?g|tiff?|pgm|zarr)(?:[\\/]|$)/iu.test(asset.uri)).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select> } : {})} /></div>}
    {image && message && <p role="alert">{message}</p>}
  </section>
}

export function ReadOnlyHeViewer({ remote, sessionId, onPickFile }: CommonProps): JSX.Element {
  const selection = useWorkbenchSelection()
  const [assets, setAssets] = useState<DataAssetRecord[]>([])
  const [assetId, setAssetId] = useState('')
  const [viewer, setViewer] = useState<ViewerSessionRecord>()
  const [slide, setSlide] = useState<HeSlideMetadata>()
  const [tile, setTile] = useState<HeTile>()
  const [status, setStatus] = useState<ViewerStatus>('未选择文件')
  const [message, setMessage] = useState('')
  const opened = useRef('')
  const request = useRef(0)

  const call = async (input: Omit<ScienceViewerRequest, 'sessionId'>) => {
    const response = unwrapRemoteResult('scienceViewer', await remote.scienceViewer({ ...input, sessionId }))
    return (response.he ?? response) as HeResponse
  }

  const refresh = async (): Promise<void> => {
    const current = request.current
    const response = unwrapRemoteResult('scienceViewer', await remote.scienceViewer({ action: 'list', sessionId }))
    if (current === request.current) setAssets(response.assets ?? [])
  }

  useEffect(() => { ++request.current; setAssetId(''); setViewer(undefined); setSlide(undefined); setTile(undefined); setStatus('未选择文件'); void refresh().catch(error => setMessage(String(error))); return () => { ++request.current } }, [remote, sessionId])

  const open = async (nextAssetId: string): Promise<void> => {
    const current = ++request.current
    setAssetId(nextAssetId); setViewer(undefined); setSlide(undefined); setTile(undefined)
    if (!nextAssetId) { setStatus('未选择文件'); setMessage(''); return }
    setStatus('正在加载'); setMessage('')
    try {
      const response = await call({ action: 'he_open', assetId: nextAssetId })
      if (current !== request.current) return
      if (!response.viewer || !response.he) throw new Error('切片查看器未返回切片元数据。')
      setViewer(response.viewer); setSlide(response.he)
      let firstTile = response.tile
      if (!firstTile) {
        const coarse = response.he.levels.at(-1)
        const level = coarse?.level ?? 0
        const downsample = coarse?.downsample ?? 1
        const readResponse = await call({ action: 'he_read', viewerId: response.viewer.id, expectedVersion: response.viewer.version, region: { x: 0, y: 0, width: Math.min(response.he.width, Math.floor(2048 * downsample)), height: Math.min(response.he.height, Math.floor(2048 * downsample)), page: level } })
        if (current !== request.current) return
        firstTile = readResponse.tile
        if (readResponse.viewer) setViewer(readResponse.viewer)
      }
      if (!firstTile) throw new Error('切片首块瓦片读取失败。')
      setTile(firstTile); setStatus('已加载')
      await refresh()
    } catch (error) {
      if (current === request.current) { setStatus('打开失败'); setMessage(error instanceof Error ? error.message : String(error)) }
    }
  }

  useEffect(() => {
    if (!selection.assetId || selection.revision == null) return
    const key = `${selection.assetId}:${selection.revision}`
    if (opened.current === key) return
    opened.current = key
    void open(selection.assetId)
  }, [selection.assetId, selection.revision])

  const read = async (region: Required<HeRegion>): Promise<void> => {
    if (!viewer) return
    const current = ++request.current
    setStatus('正在加载'); setMessage('')
    try {
      const response = await call({ action: 'he_read', viewerId: viewer.id, expectedVersion: viewer.version, region })
      if (current !== request.current) return
      if (!response.tile) throw new Error('切片区域读取失败。')
      setViewer(response.viewer ?? viewer); setTile(response.tile); setStatus('已加载')
    } catch (error) { if (current === request.current) { setStatus('打开失败'); setMessage(error instanceof Error ? error.message : String(error)) } }
  }

  const navigate = (scale: number, dx = 0, dy = 0): void => {
    if (!tile || !slide) return
    const source = tile.region
    const width = Math.min(slide.width, Math.max(1, Math.round(source.width * scale)))
    const height = Math.min(slide.height, Math.max(1, Math.round(source.height * scale)))
    const x = Math.round(Math.max(0, Math.min(slide.width - width, source.x + (source.width - width) / 2 + dx * source.width)))
    const y = Math.round(Math.max(0, Math.min(slide.height - height, source.y + (source.height - height) / 2 + dy * source.height)))
    const page = scale === 1 ? source.page : (slide.levels.find(level => width / level.downsample <= 1024 && height / level.downsample <= 1024)?.level ?? slide.levels.at(-1)?.level ?? 0)
    void read({ x, y, width, height, page })
  }

  return <section className={styles.viewer} aria-label="HE 切片查看器">
    {slide && viewer && <div className={styles.meta}><label>当前资产 <select aria-label="HE 资产" value={assetId} onChange={event => void open(event.target.value)}><option value="">选择切片</option>{assets.filter(asset => /\.(svs|ndpi|tiff?)$/iu.test(asset.uri)).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label><span className={styles.badge}>{status}</span><button type="button" onClick={onPickFile}>更换文件</button></div>}
    {slide && viewer ? <>
      <div className={styles.toolbar}><span>{assetName(assets, viewer.assetId)} · {slide.format} · {slide.width} × {slide.height}</span><div className={styles.controls}><button type="button" title="放大" aria-label="放大" onClick={() => navigate(.5)}><Plus size={16} /></button><button type="button" title="缩小" aria-label="缩小" onClick={() => navigate(2)}><Minus size={16} /></button><button type="button" title="向左" aria-label="向左" onClick={() => navigate(1, -.5)}><ChevronLeft size={16} /></button><button type="button" title="向右" aria-label="向右" onClick={() => navigate(1, .5)}><ChevronRight size={16} /></button></div></div>
      {tile ? <div className={styles.stage}><img alt={assetName(assets, viewer.assetId)} src={`data:image/png;base64,${tile.pngBase64}`} /></div> : <ViewerLanding tool="he" status="正在加载" message="正在读取切片预览" />}
    </> : <div data-empty="true"><ViewerLanding tool="he" status={status} message={message} {...(onPickFile ? { onPickFile } : {})} {...(assets.length ? { assetPicker: <select aria-label="HE 资产" value={assetId} onChange={event => void open(event.target.value)}><option value="">已有切片</option>{assets.filter(asset => /\.(svs|ndpi|tiff?)$/iu.test(asset.uri)).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select> } : {})} /></div>}
    {slide && message && <p role="alert">{message}</p>}
  </section>
}
