export interface CanvasPoint { x: number; y: number; label?: string }
import { renderCanvasLayout } from './canvas-render.js'
export interface CanvasSeries { id: string; name: string; color: string; points: CanvasPoint[]; mode?: 'line' | 'scatter' }
export interface CanvasAnnotation { text: string; x: number; y: number; color?: string }
export interface CanvasSpec { title: string; width: number; height: number; xLabel: string; yLabel: string; series: CanvasSeries[]; annotations?: CanvasAnnotation[]; sourceAssetIds?: string[]; sourceArtifactIds?: string[]; xRange?: [number, number] | undefined; yRange?: [number, number] | undefined; showLegend?: boolean; columns?: number | undefined; panels?: CanvasSpec[] }
export interface CanvasRender { format: 'zerowall-science-canvas'; version: 1; svg: string; width: number; height: number; pointCount: number; sourceAssetIds: string[]; sourceArtifactIds: string[]; notes: string[] }

const finite = (value: unknown, label: string): number => { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite.`); return value }

export function validateCanvasSpec(value: unknown, nested = false): CanvasSpec {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Canvas specification is required.')
  const input = value as Record<string, unknown>; const text = (key: string, max: number): string => { if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > max) throw new Error(`Canvas ${key} is required.`); return input[key].trim() }
  const width = finite(input.width, 'Canvas width'); const height = finite(input.height, 'Canvas height'); if (!Number.isInteger(width) || !Number.isInteger(height) || width < 320 || width > 4000 || height < 240 || height > 4000) throw new Error('Canvas dimensions must be 320–4000 by 240–4000.')
  if (!Array.isArray(input.series) || input.series.length < 1 || input.series.length > 20) throw new Error('Canvas requires 1–20 series.')
  let pointCount = 0; const ids = new Set<string>(); const series = input.series.map((raw, seriesIndex) => { if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Canvas series must be objects.'); const item = raw as Record<string, unknown>; const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `series-${seriesIndex + 1}`; if (ids.has(id)) throw new Error('Canvas series IDs must be unique.'); ids.add(id); const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id; const color = typeof item.color === 'string' && /^#[0-9a-f]{6}$/iu.test(item.color) ? item.color : '#2f6fbd'; if (!Array.isArray(item.points) || item.points.length > 100000) throw new Error('Canvas series points must be an array no longer than 100,000.'); pointCount += item.points.length; const points = item.points.map((point, index) => { if (!point || typeof point !== 'object' || Array.isArray(point)) throw new Error('Canvas point must be an object.'); const p = point as Record<string, unknown>; return { x: finite(p.x, `Canvas ${id} point ${index} x`), y: finite(p.y, `Canvas ${id} point ${index} y`), ...(typeof p.label === 'string' && p.label.length <= 200 ? { label: p.label } : {}) } })
    if (item.mode !== undefined && item.mode !== 'line' && item.mode !== 'scatter') throw new Error('Canvas series mode must be line or scatter.')
    return { id, name, color, points, mode: item.mode === 'scatter' ? 'scatter' as const : 'line' as const }
  }); if (pointCount > 500000) throw new Error('Canvas point count exceeds the 500,000-point bound.')
  const annotations = input.annotations === undefined ? [] : !Array.isArray(input.annotations) ? (() => { throw new Error('Canvas annotations must be an array.') })() : input.annotations.map(raw => { if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Canvas annotation must be an object.'); const item = raw as Record<string, unknown>; if (typeof item.text !== 'string' || !item.text.trim() || item.text.length > 500) throw new Error('Canvas annotation text is required.'); return { text: item.text.trim(), x: finite(item.x, 'Canvas annotation x'), y: finite(item.y, 'Canvas annotation y'), ...(typeof item.color === 'string' && /^#[0-9a-f]{6}$/iu.test(item.color) ? { color: item.color } : {}) } })
  const refs = (key: 'sourceAssetIds' | 'sourceArtifactIds'): string[] => input[key] === undefined ? [] : !Array.isArray(input[key]) ? (() => { throw new Error(`Canvas ${key} must be an array.`) })() : input[key].map(value => { if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error(`Canvas ${key} contains an invalid reference.`); return value.trim() })
  const range = (key: string): [number, number] | undefined => {
    const v = input[key]; if (v === undefined) return undefined
    if (!Array.isArray(v) || v.length !== 2 || finite(v[0], key) >= finite(v[1], key) || !Number.isFinite(v[1] - v[0])) throw new Error(`Canvas ${key} requires finite increasing bounds.`)
    return [v[0], v[1]]
  }
  if (annotations.length > 100) throw new Error('Canvas supports at most 100 annotations per panel.')
  if (input.showLegend !== undefined && typeof input.showLegend !== 'boolean') throw new Error('Canvas showLegend must be boolean.')
  if (input.panels !== undefined && (nested || !Array.isArray(input.panels) || input.panels.length > 8)) throw new Error('Canvas supports eight additional non-nested panels.')
  const panels = Array.isArray(input.panels) ? input.panels.map(item => validateCanvasSpec(item, true)) : []
  const columns = input.columns === undefined ? Math.min(2, panels.length + 1) : finite(input.columns, 'Canvas columns')
  if (!Number.isInteger(columns) || columns < 1 || columns > 3) throw new Error('Canvas columns must be 1–3.')
  if (panels.length && (width / columns < 320 || height / Math.ceil((panels.length + 1) / columns) < 260)) throw new Error('Canvas panel dimensions require at least 320 × 260; increase the canvas size.')
  pointCount += panels.reduce((n, p) => n + p.series.reduce((m, s) => m + s.points.length, 0), 0)
  if (pointCount > 500000) throw new Error('Canvas point count exceeds the 500,000-point bound.')
  return { title: text('title', 200), width, height, xLabel: text('xLabel', 200), yLabel: text('yLabel', 200), series, annotations, sourceAssetIds: refs('sourceAssetIds'), sourceArtifactIds: refs('sourceArtifactIds'), xRange: range('xRange'), yRange: range('yRange'), showLegend: input.showLegend !== false, ...(panels.length ? { panels, columns } : {}) }
}

export function renderCanvas(spec: CanvasSpec): CanvasRender {
  return renderCanvasLayout(validateCanvasSpec(spec))
}
