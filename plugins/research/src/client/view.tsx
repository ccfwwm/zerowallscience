import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { TabComponentProps } from 'dsh-better-sidebar/client/service'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'
import type {} from '../../../base/src/client/desktop-api.js'
import type {} from '../../lib/typert.remote-client.js'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import { ViewerSelectionContext, type ViewerSelection } from './viewer-selection.js'
import { SequenceViewer } from './sequence-viewer.js'
import { ReadOnlyImageViewer, ReadOnlyHeViewer } from './read-only-image-viewers.js'
import { SangerViewer } from './sanger-viewer.js'
import { FlowViewer } from './flow-viewer.js'
import { MoleculeViewer } from './molecule-viewer.js'
import { ReadOnlyCanvasViewer } from './read-only-canvas-viewer.js'
import { CellViewer } from './cell-viewer.js'
import { BrainViewer } from './brain-viewer.js'
import { scienceToolForImportedPath } from './imported-science-file.js'

type Remote = TypertRemoteNamespaceMap['zerowallResearch']
type ViewerRemote = Remote
type ScienceToolId = 'imagej' | 'he' | 'molecule' | 'sanger' | 'flow' | 'canvas' | 'cells' | 'sequence' | 'brainglobe'
type ViewerRoute = { tool?: ScienceToolId; assetId?: string; viewerId?: string; runId?: string; requestId?: string }

const TITLES: Record<ScienceToolId, string> = {
  imagej: 'ImageJ', he: 'HE 切片', molecule: '分子结构', sanger: 'Sanger 峰图', flow: '流式细胞',
  canvas: '科研画布', cells: '细胞查看器', sequence: '序列查看器', brainglobe: '脑图谱',
}

function routeFromTab(tab: TabComponentProps['tab']): ViewerRoute {
  return tab.meta && typeof tab.meta === 'object' ? tab.meta as ViewerRoute : {}
}

export type ScienceViewerProps = TabComponentProps & { remote: Remote }

export function ScienceViewer(props: ScienceViewerProps): JSX.Element {
  const remote = props.remote as ViewerRemote
  const sessionId = props.scope.sessionId
  const route = routeFromTab(props.tab)
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [selection, setSelection] = useState<ViewerSelection>({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const requestGeneration = useRef(0)
  const title = route.tool ? TITLES[route.tool] : '科学查看器'
  const selectionValue = useMemo(() => selection, [selection])

  useEffect(() => {
    const generation = ++requestGeneration.current
    setWorkspaceReady(false)
    setSelection({})
    setMessage('')
    setLoading(true)
    void (async () => {
      try {
        if (!sessionId) throw new Error('当前会话尚未就绪。')
        const ready = unwrapRemoteResult('zerowallResearch/workspaceReadyForSession', await remote.workspaceReadyForSession({ sessionId })) as boolean
        if (!ready) throw new Error('科学查看器未能连接当前会话。')
        if (generation === requestGeneration.current) {
          setWorkspaceReady(true)
          setSelection({ assetId: route.assetId, viewerId: route.viewerId, runId: route.runId, revision: 1 })
        }
      } catch (error) {
        if (generation === requestGeneration.current) setMessage(error instanceof Error ? error.message : String(error))
      } finally {
        if (generation === requestGeneration.current) setLoading(false)
      }
    })()
    return () => { requestGeneration.current++ }
  }, [remote, sessionId, route.requestId, route.tool])

  const importExternalPath = async (sourcePath: string): Promise<void> => {
    if (!sessionId || !workspaceReady) { setMessage('当前会话正在准备，请稍后重试。'); return }
    if (!remote.importLocalAsset) { setMessage('当前 Host 不支持导入科研文件。'); return }
    if (!route.tool) { setMessage('请先在对话中指定要打开的科研查看器。'); return }
    try {
      setMessage(`正在复制并校验 ${sourcePath.split(/[\\/]/u).at(-1) ?? '科研文件'}…`)
      const imported = unwrapRemoteResult('zerowallResearch/importLocalAsset', await remote.importLocalAsset({ sessionId, sourcePath })) as { id: string; name: string }
      const tool = scienceToolForImportedPath(sourcePath, route.tool)
      if (!tool) throw new Error(`${imported.name} 没有对应的科学查看器。`)
      setSelection(current => ({ assetId: imported.id, revision: (current.revision ?? 0) + 1 }))
      setMessage(`已复制并校验 ${imported.name}。`)
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }

  const pickFile = async (): Promise<void> => {
    const extensions = route.tool ? ({
      imagej: ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.ome.tif', '.ome.tiff'], he: ['.svs', '.ndpi', '.tif', '.tiff'],
      molecule: ['.pdb', '.cif', '.mmcif', '.sdf'], sanger: ['.ab1', '.scf'], flow: ['.fcs'], canvas: [],
      cells: ['.h5ad'], sequence: ['.fa', '.fasta', '.fna', '.gb', '.gbk', '.genbank'], brainglobe: [],
    } satisfies Record<ScienceToolId, string[]>)[route.tool] : undefined
    const chooser = window.zerowallDesktop?.chooseScienceFile
    if (!chooser) { setMessage('当前桌面不支持选择科研文件。'); return }
    if (extensions?.length === 0) { setMessage('此查看器通过对话关联已有科研数据。'); return }
    const sourcePath = await chooser(extensions)
    if (sourcePath) await importExternalPath(sourcePath)
  }

  const renderTool = (id: ScienceToolId): ReactNode => <>
    {id === 'cells' && <CellViewer remote={remote} sessionId={sessionId} viewOnly onPickFile={pickFile} />}
    {id === 'imagej' && <ReadOnlyImageViewer remote={remote} sessionId={sessionId} onPickFile={pickFile} />}
    {id === 'sequence' && <SequenceViewer remote={remote} sessionId={sessionId} viewOnly onPickFile={pickFile} />}
    {id === 'sanger' && <SangerViewer remote={remote} sessionId={sessionId} viewOnly onPickFile={pickFile} />}
    {id === 'flow' && <FlowViewer remote={remote} sessionId={sessionId} viewOnly onPickFile={pickFile} />}
    {id === 'he' && <ReadOnlyHeViewer remote={remote} sessionId={sessionId} onPickFile={pickFile} />}
    {id === 'molecule' && <MoleculeViewer remote={remote} sessionId={sessionId} viewOnly onPickFile={pickFile} />}
    {id === 'canvas' && <ReadOnlyCanvasViewer remote={remote} sessionId={sessionId} />}
    {id === 'brainglobe' && <BrainViewer remote={remote} sessionId={sessionId} viewOnly active />}
  </>

  return <section aria-label="科学查看器" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--dsc-border, #ddd)' }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h2>
      {message && <p role="status" style={{ margin: 0, fontSize: 12 }}>{message}</p>}
    </header>
    {loading && <p role="status" style={{ padding: 16 }}>正在连接当前会话…</p>}
    {!loading && !workspaceReady && <p role="alert" style={{ padding: 16 }}>{message || '科学查看器暂不可用。'}</p>}
    {!loading && workspaceReady && route.tool && <div key={`${sessionId}:${route.requestId}:${selection.revision ?? 0}`} style={{ minHeight: 0, flex: 1, overflow: 'auto' }}>
      <ViewerSelectionContext.Provider value={selectionValue}>{renderTool(route.tool)}</ViewerSelectionContext.Provider>
    </div>}
    {!loading && workspaceReady && !route.tool && <p style={{ padding: 16 }}>请在对话中请求打开科研文件或可视化结果。</p>}
  </section>
}
