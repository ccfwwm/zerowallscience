import { useEffect, useRef, useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { ArtifactRecord, ViewerSessionRecord } from '@zerowallscience/research-store/types'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'
import type { BrainAtlasResponse, BrainAtlasSummary, BrainCellAnalysis, BrainRegionResult, BrainSlice } from '../shared/types.js'
import {BrainTransformPanel} from './brain-transform-panel.js'

type Remote = TypertRemoteNamespaceMap['zerowallResearch']
type BrainEnvelope = { brain?: BrainAtlasResponse; artifact?: ArtifactRecord }
type BrainAction = 'brain_open' | 'brain_read' | 'brain_analyze' | 'brain_cells' | 'brain_trajectory' | 'brain_export' | 'brain_register' | 'brain_cellfinder' | 'brain_render'
type Asset = { id: string; name: string; uri: string; location: string }

export function BrainViewer({ remote, sessionId }: { remote: Remote; sessionId: string }): JSX.Element {
  const [viewer, setViewer] = useState<ViewerSessionRecord>()
  const [summary, setSummary] = useState<BrainAtlasSummary>()
  const [slice, setSlice] = useState<BrainSlice>()
  const [region, setRegion] = useState<BrainRegionResult>()
  const [analysis, setAnalysis] = useState<BrainCellAnalysis>()
  const [assets, setAssets] = useState<Asset[]>([])
  const [registrationAsset, setRegistrationAsset] = useState('')
  const [cellfinderAsset, setCellfinderAsset] = useState('')
  const [backgroundAsset, setBackgroundAsset] = useState('')
  const [renderRegions, setRenderRegions] = useState('MOs')
  const [renderTitle, setRenderTitle] = useState('ZeroWall Science BrainGlobe')
  const [voxelSizes, setVoxelSizes] = useState<[number, number, number]>([25, 25, 25])
  const [orientation, setOrientation] = useState('asr')
  const [axis, setAxis] = useState<0 | 1 | 2>(0)
  const [index, setIndex] = useState(0)
  const [downsample, setDownsample] = useState(8)
  const [regionQuery, setRegionQuery] = useState('')
  const [coordinateUnits, setCoordinateUnits] = useState<'voxel' | 'micron'>('voxel')
  const [coordinates, setCoordinates] = useState('[[264, 160, 228]]')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)

  const call = async (action: BrainAction, input: Record<string, unknown> = {}): Promise<BrainAtlasResponse> => {
    const result = unwrapRemoteResult('scienceViewer', await remote.scienceViewer({
      sessionId,
      action,
      ...input,
    })) as unknown as BrainEnvelope
    return result.brain ?? result as unknown as BrainAtlasResponse
  }

  const apply = (response: BrainAtlasResponse): void => {
    if (response.viewer) setViewer(response.viewer)
    if (response.summary) setSummary(response.summary)
    if (response.slice) setSlice(response.slice)
    if (response.region) setRegion(response.region)
    if (response.analysis) setAnalysis(response.analysis)
    if (response.artifact) setMessage(`已登记产物：${response.artifact.name}\n${response.artifact.uri}\nSHA-256: ${response.artifact.checksum}`)
    if (response.cellfinder) setMessage(`cellfinder 已完成：检测到 ${response.cellfinder.detected} 个候选细胞。结果仍需科学复核。`)
    if (response.rendering) setMessage(`brainrender 已生成 PNG/HTML 场景。结果仍需科学复核。\nPNG: ${response.rendering.pngUri}\nHTML: ${response.rendering.htmlUri}`)
  }

  const run = async (action: BrainAction, input: Record<string, unknown> = {}): Promise<void> => {
    if (busy) return
    setBusy(true); setMessage('')
    try { apply(await call(action, { ...input, ...(viewer ? { viewerId: viewer.id, expectedVersion: viewer.version } : {}) })) }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }

  useEffect(() => {
    const current = ++generation.current
    setViewer(undefined); setSummary(undefined); setSlice(undefined); setRegion(undefined); setAnalysis(undefined); setMessage('')
    void Promise.all([
      call('brain_open'),
      remote.scienceViewer({ sessionId, action: 'list' }).then(value => unwrapRemoteResult('scienceViewer', value) as unknown as { assets?: Asset[] }),
    ]).then(([response, listed]) => { if (current === generation.current) { apply(response); setAssets(listed.assets ?? []) } }).catch(error => { if (current === generation.current) setMessage(error instanceof Error ? error.message : String(error)) })
    return () => { generation.current++ }
  }, [remote, sessionId])

  const sliceImage = slice?.pngBase64 ? `data:image/png;base64,${slice.pngBase64}` : undefined
  const updateIndex = (value: number): void => { setIndex(Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0) }
  const updateDownsample = (value: number): void => { setDownsample(Number.isFinite(value) ? Math.min(64, Math.max(1, Math.trunc(value))) : 8) }
  const runRegion = (): void => { void run('brain_analyze', { brainRegion: regionQuery.trim() }) }
  const runCoordinates = (action: 'brain_cells' | 'brain_trajectory'): void => {
    try {
      const parsed = JSON.parse(coordinates) as unknown
      if (!Array.isArray(parsed)) throw new Error('坐标必须是 [[AP,SI,RL], ...] 图谱轴序 JSON 数组。')
      void run(action, { brainCoordinates: parsed, brainCoordinateUnits: coordinateUnits })
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }
  const register = (): void => {
    if (!registrationAsset) { setMessage('请选择已登记的本地图像堆栈资产。'); return }
    void run('brain_register', { assetId: registrationAsset, brainVoxelSizes: voxelSizes, brainOrientation: orientation, brainNFreeCpus: 2 })
  }
  const renderScene = (): void => {
    try {
      const parsed = coordinates.trim() ? JSON.parse(coordinates) as unknown : undefined
      if (parsed !== undefined && !Array.isArray(parsed)) throw new Error('brainrender 坐标必须是 [[AP,SI,RL], ...] 图谱轴序 JSON 数组。')
      void run('brain_render', { brainRegions: renderRegions.split(',').map(value => value.trim()).filter(Boolean), brainTitle: renderTitle, ...(parsed === undefined ? {} : { brainCoordinates: parsed, brainCoordinateUnits: 'micron' }) })
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }

  return <section aria-label="BrainGlobe 脑图谱查看与分析" style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 14 }}>
    <h3>BrainGlobe 脑图谱查看与分析</h3>
    <p>Allen adult mouse CCF · 25 µm。切片、脑区查询、cellfinder 检测和 brainrender 三维场景均使用受管理 BrainGlobe 环境；结果保留待复核状态，不自动生成解剖或机制结论。</p>
    <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
        <label>轴 <select aria-label="脑图谱轴" value={axis} onChange={event => setAxis(Number(event.target.value) as 0 | 1 | 2)}><option value={0}>轴 0</option><option value={1}>轴 1</option><option value={2}>轴 2</option></select></label>
        <label>切片索引 <input aria-label="脑图谱切片索引" type="number" min={0} value={index} onChange={event => updateIndex(Number(event.target.value))} /></label>
        <label>降采样 <input aria-label="脑图谱降采样" type="number" min={1} max={64} value={downsample} onChange={event => updateDownsample(Number(event.target.value))} /></label>
        <button type="button" disabled={!viewer} onClick={() => void run('brain_analyze', { brainAxis: axis, brainIndex: index, brainDownsample: downsample })}>读取切片</button>
        <button type="button" disabled={!viewer} onClick={() => void run('brain_read')}>刷新图谱</button>
      </div>
      {summary && <div aria-label="BrainGlobe 图谱摘要"><p><strong>{summary.atlas}</strong> · {summary.species} · {summary.resolution.join(' × ')} µm · {summary.shape.join(' × ')} · {summary.regionCount} 个脑区</p><small>atlas version: {summary.version ?? 'unknown'} · viewer revision: {viewer?.version ?? '—'}</small></div>}
      {sliceImage && <figure style={{ margin: '12px 0' }}><img src={sliceImage} alt={`BrainGlobe 轴 ${slice?.axis} 切片 ${slice?.index}`} style={{ imageRendering: 'pixelated', maxWidth: '100%', maxHeight: 420, border: '1px solid var(--dsw-alias-border-l1)' }} /><figcaption>轴 {slice?.axis} · 索引 {slice?.index} · {slice?.width}×{slice?.height} · downsample {slice?.downsample}</figcaption></figure>}
      {summary && <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
        <fieldset><legend>脑区查询</legend><input aria-label="脑区查询" value={regionQuery} onChange={event => setRegionQuery(event.target.value)} placeholder="Cerebrum / CP / numeric ID" /><button type="button" disabled={!viewer || !regionQuery.trim()} onClick={runRegion}>查询</button>{region && <ul>{region.matches.slice(0, 20).map(item => <li key={`${item.id}-${item.acronym}`}><strong>{item.acronym}</strong> · {item.name} · ID {item.id}{item.voxelCount === undefined ? '' : ` · ${item.voxelCount} voxels · ${item.volumeUm3?.toFixed(0)} µm³`}</li>)}</ul>}</fieldset>
        <fieldset><legend>坐标映射</legend><p>仅接收图谱坐标：AP、SI、RL 轴序，ASR 原点，从 0 开始。微米从同一原点计量；不能直接粘贴未配准的 cellfinder x,y,z。负值及超出图谱范围的坐标记为图谱外。</p><label>单位 <select aria-label="脑坐标单位" value={coordinateUnits} onChange={event => setCoordinateUnits(event.target.value as 'voxel' | 'micron')}><option value="voxel">voxel</option><option value="micron">micron</option></select></label><textarea aria-label="脑坐标 JSON" rows={3} value={coordinates} onChange={event => setCoordinates(event.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} /><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><button type="button" disabled={!viewer} onClick={() => runCoordinates('brain_cells')}>映射细胞坐标</button><button type="button" disabled={!viewer} onClick={() => runCoordinates('brain_trajectory')}>映射轨迹</button></div></fieldset>
      </div>}
      <fieldset><legend>brainreg 配准</legend><p>仅对项目内已登记的本地图像堆栈执行真实 brainreg CLI；输出保存在项目工作区，质量和解剖对齐必须人工复核。</p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}><label>输入资产 <select aria-label="brainreg 输入资产" value={registrationAsset} onChange={event => setRegistrationAsset(event.target.value)}><option value="">选择本地图像堆栈</option>{assets.filter(asset => asset.location === 'local' && asset.uri.startsWith('file:')).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label><label>方向 <input aria-label="brainreg 方向" value={orientation} maxLength={3} onChange={event => setOrientation(event.target.value)} /></label>{voxelSizes.map((value, position) => <label key={position}>体素 {position + 1} µm <input aria-label={`brainreg 体素 ${position + 1}`} type="number" min={0.001} value={value} onChange={event => setVoxelSizes(current => current.map((item, index) => index === position ? Number(event.target.value) : item) as [number, number, number])} /></label>)}<button type="button" disabled={busy || !registrationAsset} onClick={register}>运行 brainreg</button></div></fieldset>
      <fieldset><legend>cellfinder 细胞检测</legend><p>使用项目内 .npy/TIFF 三维信号体执行真实 cellfinder。默认检测模式不运行分类，检测结果只作为候选并保留原始坐标。</p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}><label>信号资产 <select aria-label="cellfinder 信号资产" value={cellfinderAsset} onChange={event => setCellfinderAsset(event.target.value)}><option value="">选择 .npy/TIFF 资产</option>{assets.filter(asset => asset.location === 'local' && /\.(?:npy|tiff?)$/iu.test(asset.name)).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label><label>背景资产 <select aria-label="cellfinder 背景资产" value={backgroundAsset} onChange={event => setBackgroundAsset(event.target.value)}><option value="">无（零背景）</option>{assets.filter(asset => asset.location === 'local' && /\.(?:npy|tiff?)$/iu.test(asset.name)).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label><button type="button" disabled={busy || !cellfinderAsset} onClick={() => void run('brain_cellfinder', { assetId: cellfinderAsset, ...(backgroundAsset ? { backgroundAssetId: backgroundAsset } : {}), brainVoxelSizes: [5, 1, 1], brainSkipClassification: true, brainNFreeCpus: 2 })}>运行 cellfinder</button></div></fieldset>
      <fieldset><legend>brainrender 三维场景</legend><p>输入脑区名称或缩写，坐标必须声明为 micron；生成可追踪 PNG 和 HTML 场景文件。</p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}><label>脑区（逗号分隔） <input aria-label="brainrender 脑区" value={renderRegions} onChange={event => setRenderRegions(event.target.value)} /></label><label>标题 <input aria-label="brainrender 标题" value={renderTitle} onChange={event => setRenderTitle(event.target.value)} /></label><button type="button" disabled={busy || (!renderRegions.trim() && !coordinates.trim())} onClick={renderScene}>生成三维场景</button></div></fieldset>
      <BrainTransformPanel key={sessionId} remote={remote} sessionId={sessionId} {...(viewer?{projectId:viewer.projectId}:{})} onMapped={points=>{setCoordinates(JSON.stringify(points));setCoordinateUnits('micron')}}/>
      {analysis && <div aria-label="脑图谱坐标分析"><p>总数 {analysis.total} · 已映射 {analysis.mapped} · 图谱外 {analysis.outside}</p><ul>{analysis.byRegion.map(item => <li key={`${item.regionId}-${item.acronym}`}>{item.acronym} · {item.count}</li>)}</ul>{analysis.cells.slice(0, 20).map(cell => <div key={cell.index}><code>#{cell.index} [{cell.coordinate.join(', ')}]</code> · {cell.acronym} · {cell.hemisphere}</div>)}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button type="button" disabled={!viewer} onClick={() => void run('brain_export', { brainAxis: axis, brainIndex: index, brainDownsample: downsample, ...(regionQuery.trim() ? { brainRegion: regionQuery.trim() } : {}) })}>导出并登记分析</button></div>
    </fieldset>
    {message && <pre role="status" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message}</pre>}
  </section>
}
