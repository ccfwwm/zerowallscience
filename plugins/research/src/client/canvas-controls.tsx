import { useState } from 'react'
import type { CanvasSpec } from '../shared/canvas.js'

export function CanvasControls({ spec, change }: { spec: CanvasSpec; change: (spec: CanvasSpec) => void }): JSX.Element {
  const [selected, setSelected] = useState(0)
  const panels = [spec, ...(spec.panels ?? [])]; const index = Math.min(selected, panels.length - 1); const panel = panels[index]!
  const update = (patch: Partial<CanvasSpec>): void => {
    if (!index) change({ ...spec, ...patch })
    else change({ ...spec, panels: spec.panels!.map((p, i) => i === index - 1 ? { ...p, ...patch } : p) })
  }
  const grid = { display: 'flex', gap: 12, flexWrap: 'wrap' as const, alignItems: 'center', margin: '10px 0' }
  const add = (): void => {
    const additional = [...(spec.panels ?? []), { title: `面板 ${panels.length + 1}`, width: 640, height: 400, xLabel: 'X', yLabel: 'Y', series: [{ id: 'series-1', name: '新数据', color: '#2f6fbd', points: [] }] }]
    const cols = Math.min(spec.columns ?? 2, 3)
    change({ ...spec, panels: additional, columns: cols, width: Math.max(spec.width, cols * 480), height: Math.max(spec.height, Math.ceil((additional.length + 1) / cols) * 360) }); setSelected(panels.length)
  }
  const remove = (): void => { if (!index) return; change({ ...spec, panels: spec.panels!.filter((_, i) => i !== index - 1) }); setSelected(index - 1) }
  const reorder = (): void => {
    if (!index) return
    const plots = panels.map(({ panels: _panels, columns: _columns, ...p }) => p)
    ;[plots[index - 1], plots[index]] = [plots[index]!, plots[index - 1]!]
    change({ ...plots[0]!, width: spec.width, height: spec.height, columns: spec.columns, panels: plots.slice(1) }); setSelected(index - 1)
  }
  return <div aria-label="画布编辑器">
    <div style={grid}><label>宽度 <input aria-label="画布宽度" type="number" min={320} max={4000} value={spec.width} onChange={e => change({ ...spec, width: Number(e.target.value) })}/></label><label>高度 <input aria-label="画布高度" type="number" min={240} max={4000} value={spec.height} onChange={e => change({ ...spec, height: Number(e.target.value) })}/></label><label>列数 <select aria-label="画布列数" value={spec.columns ?? 2} onChange={e => change({ ...spec, columns: Number(e.target.value) })}>{[1, 2, 3].map(v => <option key={v} value={v}>{v}</option>)}</select></label></div>
    <div style={grid}><label>当前面板 <select aria-label="当前面板" value={index} onChange={e => setSelected(Number(e.target.value))}>{panels.map((p, i) => <option key={i} value={i}>{String.fromCharCode(65 + i)} · {p.title}</option>)}</select></label><button type="button" disabled={panels.length >= 9} onClick={add}>添加面板</button><button type="button" disabled={!index} onClick={reorder}>前移面板</button><button type="button" disabled={!index} onClick={remove}>删除当前面板</button></div>
    <div style={grid}><label>标题 <input aria-label="面板标题" value={panel.title} onChange={e => update({ title: e.target.value })}/></label><label>X 轴 <input aria-label="X 轴标签" value={panel.xLabel} onChange={e => update({ xLabel: e.target.value })}/></label><label>Y 轴 <input aria-label="Y 轴标签" value={panel.yLabel} onChange={e => update({ yLabel: e.target.value })}/></label><label><input aria-label="显示图例" type="checkbox" checked={panel.showLegend !== false} onChange={e => update({ showLegend: e.target.checked })}/>显示图例</label></div>
    {(['xRange', 'yRange'] as const).map((axis, i) => <div key={axis} style={grid}><span>{i ? 'Y' : 'X'} 轴范围</span><label><input aria-label={`${axis}自动`} type="checkbox" checked={!panel[axis]} onChange={e => update({ [axis]: e.target.checked ? undefined : [0, 1] })}/>自动</label>{panel[axis] && [0, 1].map(bound => <input key={bound} aria-label={`${axis}${bound ? '上限' : '下限'}`} type="number" value={panel[axis]![bound]} onChange={e => { const range: [number, number] = [...panel[axis]!]; range[bound] = Number(e.target.value); update({ [axis]: range }) }}/>)}</div>)}
    {panel.series.map((s, i) => <div key={s.id} style={grid}><label>系列 <input aria-label={`系列${i + 1}名称`} value={s.name} onChange={e => update({ series: panel.series.map((v, j) => j === i ? { ...v, name: e.target.value } : v) })}/></label><input aria-label={`系列${i + 1}颜色`} type="color" value={s.color} onChange={e => update({ series: panel.series.map((v, j) => j === i ? { ...v, color: e.target.value } : v) })}/><select aria-label={`系列${i + 1}图形`} value={s.mode ?? 'line'} onChange={e => update({ series: panel.series.map((v, j) => j === i ? { ...v, mode: e.target.value as 'line' | 'scatter' } : v) })}><option value="line">折线和点</option><option value="scatter">散点</option></select><span>{s.points.length} 个点</span></div>)}
    <p>各面板独立使用线性坐标轴。数据点、文字标注及来源 ID 可在下方工程 JSON 中编辑；未输入统计不确定性时不会自动生成误差线。</p>
  </div>
}
