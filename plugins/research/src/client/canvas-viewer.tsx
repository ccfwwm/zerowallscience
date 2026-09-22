import { useEffect, useRef, useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'
import type { CanvasSpec } from '../shared/canvas.js'
import { validateCanvasSpec } from '../shared/canvas.js'
import { CanvasControls } from './canvas-controls.js'

type Remote = TypertRemoteNamespaceMap['zerowallResearch']
type CanvasPayload = { svg?: string; pointCount?: number; notes?: string[] }
type CanvasArtifact = { name: string; uri: string; checksum: string; mediaType?: string }
type CanvasEnvelope = { canvas?: CanvasPayload; artifact?: CanvasArtifact; artifacts?: CanvasArtifact[] }
type CanvasRpcResponse = { canvas?: CanvasEnvelope; artifact?: CanvasArtifact; artifacts?: CanvasArtifact[] }
const initial: CanvasSpec = { title: '科研图表', width: 720, height: 420, xLabel: 'X', yLabel: 'Y', series: [{ id: 'series-1', name: 'Series 1', color: '#2f6fbd', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1.5 }] }], annotations: [], sourceAssetIds: [], sourceArtifactIds: [] }
// Keep the editor mounted while a user temporarily clears a required field.
// Scientific/range constraints are enforced on preview/export by the Host.
function editableSpec(value: unknown, nested = false): value is CanvasSpec {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return ['title', 'xLabel', 'yLabel'].every(k => typeof v[k] === 'string') && typeof v.width === 'number' && typeof v.height === 'number' && Array.isArray(v.series) && v.series.every(s => s && typeof s === 'object' && ['id', 'name', 'color'].every(k => typeof s[k] === 'string') && Array.isArray(s.points)) && (v.panels === undefined || (!nested && Array.isArray(v.panels) && v.panels.every(p => editableSpec(p, true))))
}
export function CanvasViewer({ remote, sessionId }: { remote: Remote; sessionId: string }): JSX.Element {
  const [text, setText] = useState(JSON.stringify(initial, null, 2)); const [svg, setSvg] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false)
  const revision = useRef(0)
  useEffect(() => { revision.current++; try { setText(localStorage.getItem(`zerowall:canvas:${sessionId}`) ?? JSON.stringify(initial, null, 2)) } catch { /* Host exports remain available. */ } setSvg(''); setMessage('') }, [sessionId])
  const edit = (value: string): void => { revision.current++; setText(value); setSvg(''); try { localStorage.setItem(`zerowall:canvas:${sessionId}`, value) } catch { setMessage('本地草稿空间不足，请导出工程保存。') } }
  let editable: CanvasSpec | undefined
  try { const value: unknown = JSON.parse(text); if (editableSpec(value)) editable = value } catch { /* Keep malformed JSON editable. */ }
  const run = async (action: 'canvas_render' | 'canvas_export'): Promise<void> => { if (busy) return; const current = revision.current; setBusy(true); setMessage(''); try { const spec = JSON.parse(text) as CanvasSpec; const response = unwrapRemoteResult('scienceViewer', await remote.scienceViewer({ sessionId, action, canvas: { sessionId, action: action.slice(7) as 'render' | 'export', spec } })) as unknown as CanvasRpcResponse; if (current !== revision.current) return; const envelope = response.canvas; const payload = envelope?.canvas; if (payload?.svg) setSvg(payload.svg); const artifact = envelope?.artifact ?? response.artifact; const artifacts = envelope?.artifacts ?? response.artifacts ?? (artifact ? [artifact] : []); if (artifacts.length) setMessage(`已登记 ${artifacts.length} 个产物：\n${artifacts.map(item => `${item.mediaType ?? '文件'}：${item.uri}\nSHA-256: ${item.checksum}`).join('\n')}`) } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) } }
  return <section aria-label="科研画布" style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 14 }}><h3>科研画布</h3><p>以结构化数据生成可编辑 SVG，并同步导出 PNG/PDF；图表参数、源资产和源产物引用写入项目清单。PDF 为可追踪的图像版交付物，不能替代原始 SVG 工程。</p>{editable && <CanvasControls spec={editable} change={value => edit(JSON.stringify(value, null, 2))}/>}<label>导入画布工程 <input aria-label="导入画布工程" type="file" accept=".json,application/json" onChange={e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 32 * 1024 * 1024) { setMessage('工程文件不得超过 32 MiB。'); return } void file.text().then(raw => { const data = JSON.parse(raw); const spec = validateCanvasSpec(data.format === 'zerowall-science-canvas-project' ? data.spec : data); edit(JSON.stringify(spec, null, 2)) }).catch(error => setMessage(String(error))) }}/></label><p>初始数据仅为示例。编辑后请重新预览；工程草稿按当前会话保存在本机。</p><textarea aria-label="科研画布 JSON" rows={14} style={{ width: '100%', fontFamily: 'ui-monospace, monospace' }} value={text} onChange={event => edit(event.target.value)} /><div style={{ display: 'flex', gap: 8, margin: '8px 0' }}><button type="button" disabled={busy} onClick={() => void run('canvas_render')}>预览 SVG</button><button type="button" disabled={busy} onClick={() => void run('canvas_export')}>导出 SVG/PNG/PDF</button></div>{svg && <div aria-label="科研画布预览" style={{ overflow: 'auto', border: '1px solid var(--dsw-alias-border-l1)' }} dangerouslySetInnerHTML={{ __html: svg }} />}{message && <pre role="status" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message}</pre>}</section>
}
