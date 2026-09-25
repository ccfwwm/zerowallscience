import { useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'
import type { CanvasSpec } from '../shared/canvas.js'
import { ViewerLanding } from './viewer-landing.js'

type Remote = TypertRemoteNamespaceMap['zerowallResearch']

export function ReadOnlyCanvasViewer({ remote, sessionId }: { remote: Remote; sessionId: string }): JSX.Element {
  const [svg, setSvg] = useState('')
  const [status, setStatus] = useState('未选择文件')
  const [busy, setBusy] = useState(false)

  const open = async (): Promise<void> => {
    if (busy) return
    const saved = localStorage.getItem(`zerowall:canvas:${sessionId}`)
    if (!saved) { setStatus('未选择文件'); return }
    setBusy(true); setStatus('正在加载')
    try {
      const spec = JSON.parse(saved) as CanvasSpec
      const response = unwrapRemoteResult('scienceViewer', await remote.scienceViewer({ sessionId, action: 'canvas_render', canvas: { sessionId, action: 'render', spec } })) as unknown as { canvas?: { canvas?: { svg?: string } } }
      const rendered = response.canvas?.canvas?.svg
      if (!rendered) throw new Error('画布渲染未返回图像。')
      setSvg(rendered); setStatus('已加载')
    } catch (error) { setStatus(`打开失败：${error instanceof Error ? error.message : String(error)}`) }
    finally { setBusy(false) }
  }

  return <section aria-label="科研画布查看器">{svg ? <><button type="button" disabled={busy} onClick={() => void open()}>刷新画布</button><p role="status">{status}</p><div aria-label="科研画布预览" style={{ overflow: 'auto' }} dangerouslySetInnerHTML={{ __html: svg }} /></> : <ViewerLanding tool="canvas" status={status} onOpen={{ label: '查看画布', action: () => void open() }} />}</section>
}
