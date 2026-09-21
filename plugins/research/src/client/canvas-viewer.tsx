import { useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'
import type { CanvasSpec } from '../shared/canvas.js'
import type { ScienceViewerRequest } from '../shared/types.js'

type Remote = TypertRemoteNamespaceMap['zerowallResearch']
type CanvasPayload = { svg?: string; pointCount?: number; notes?: string[] }
type CanvasEnvelope = { canvas?: CanvasPayload; artifact?: { name: string; uri: string; checksum: string } }
type CanvasRpcResponse = { canvas?: CanvasEnvelope; artifact?: { name: string; uri: string; checksum: string } }
const initial: CanvasSpec = { title: '科研图表', width: 720, height: 420, xLabel: 'X', yLabel: 'Y', series: [{ id: 'series-1', name: 'Series 1', color: '#2f6fbd', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1.5 }] }], annotations: [], sourceAssetIds: [], sourceArtifactIds: [] }
export function CanvasViewer({ remote, sessionId }: { remote: Remote; sessionId: string }): JSX.Element {
  const [text, setText] = useState(JSON.stringify(initial, null, 2)); const [svg, setSvg] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false)
  const run = async (action: 'canvas_render' | 'canvas_export'): Promise<void> => { if (busy) return; setBusy(true); setMessage(''); try { const spec = JSON.parse(text) as CanvasSpec; const response = unwrapRemoteResult('scienceViewer', await remote.scienceViewer({ sessionId, action, canvas: { sessionId, action: action.slice(7) as 'render' | 'export', spec } })) as unknown as CanvasRpcResponse; const envelope = response.canvas; const payload = envelope?.canvas; if (payload?.svg) setSvg(payload.svg); const artifact = envelope?.artifact ?? response.artifact; if (artifact) setMessage(`已登记产物：${artifact.name}\n${artifact.uri}\nSHA-256: ${artifact.checksum}`) } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) } }
  return <section aria-label="科研画布" style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 14 }}><h3>科研画布</h3><p>以结构化数据生成可编辑 SVG；图表参数、源资产和源产物引用写入项目清单。PNG/PDF 编排和多面板编辑仍在后续阶段。</p><textarea aria-label="科研画布 JSON" rows={14} style={{ width: '100%', fontFamily: 'ui-monospace, monospace' }} value={text} onChange={event => setText(event.target.value)} /><div style={{ display: 'flex', gap: 8, margin: '8px 0' }}><button type="button" disabled={busy} onClick={() => void run('canvas_render')}>预览 SVG</button><button type="button" disabled={busy} onClick={() => void run('canvas_export')}>导出并登记 SVG 工程</button></div>{svg && <div aria-label="科研画布预览" style={{ overflow: 'auto', border: '1px solid var(--dsw-alias-border-l1)' }} dangerouslySetInnerHTML={{ __html: svg }} />}{message && <pre role="status" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message}</pre>}</section>
}
