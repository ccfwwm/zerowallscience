import type { CanvasSpec, CanvasSeries, CanvasRender } from './canvas.js'
const esc = (s: string): string => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
function extent(series: CanvasSeries[], axis: 'x' | 'y', range?: [number, number]): [number, number] {
  if (range) return range
  let lo = Infinity; let hi = -Infinity
  for (const s of series) for (const point of s.points) { lo = Math.min(lo, point[axis]); hi = Math.max(hi, point[axis]) }
  if (!Number.isFinite(lo)) return [0, 1]
  if (lo === hi) { const pad = Math.max(1, Math.abs(lo) * 0.05); lo -= pad; hi += pad }
  if (!Number.isFinite(hi - lo)) throw new Error('Canvas data range exceeds finite rendering bounds.')
  return [lo, hi]
}
function plot(spec: CanvasSpec, width: number, height: number, id: string): string {
  const [minX, maxX] = extent(spec.series, 'x', spec.xRange); const [minY, maxY] = extent(spec.series, 'y', spec.yRange)
  const cols = Math.max(1, Math.floor((width - 80) / 170)); const rows = spec.showLegend === false ? 0 : Math.ceil(spec.series.length / cols)
  const left = 72; const top = 48; const w = width - left - 25; const h = height - top - 56 - rows * 19
  if (h < 60) throw new Error('Canvas height is too small for this legend; enlarge it or hide the legend.')
  const px = (x: number): number => left + (x - minX) / (maxX - minX) * w
  const py = (y: number): number => top + (maxY - y) / (maxY - minY) * h
  const number = (n: number): string => Number(n.toPrecision(4)).toString()
  const ticks = Array.from({ length: 5 }, (_, i) => {
    const r = i / 4; const x = left + r * w; const y = top + (1 - r) * h
    return `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + h}" stroke="#eeeeee"/><line x1="${left}" y1="${y}" x2="${left + w}" y2="${y}" stroke="#eeeeee"/><text x="${x}" y="${top + h + 17}" text-anchor="middle" font-size="11">${number(minX + r * (maxX - minX))}</text><text x="${left - 8}" y="${y + 4}" text-anchor="end" font-size="11">${number(minY + r * (maxY - minY))}</text>`
  }).join('')
  const marks = spec.series.map(s => {
    const path = s.mode === 'scatter' ? '' : `<path d="${s.points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(2)},${py(p.y).toFixed(2)}`).join(' ')}" fill="none" stroke="${esc(s.color)}" stroke-width="2"/>`
    return `${path}<g fill="${esc(s.color)}">${s.points.map(p => `<circle cx="${px(p.x).toFixed(2)}" cy="${py(p.y).toFixed(2)}" r="3">${p.label ? `<title>${esc(p.label)}</title>` : ''}</circle>`).join('')}</g>`
  }).join('')
  const annotations = (spec.annotations ?? []).map(a => `<text x="${px(a.x).toFixed(2)}" y="${py(a.y).toFixed(2)}" fill="${esc(a.color ?? '#222222')}" font-size="13">${esc(a.text)}</text>`).join('')
  const legend = spec.showLegend === false ? '' : spec.series.map((s, i) => `<g transform="translate(${left + i % cols * 170},${top + h + 48 + Math.floor(i / cols) * 19})"><rect width="10" height="10" fill="${esc(s.color)}"/><text x="15" y="10" font-size="11">${esc(s.name)}</text></g>`).join('')
  return `<text x="${width / 2}" y="27" text-anchor="middle" font-size="16" font-weight="600">${esc(spec.title)}</text>${ticks}<path d="M${left},${top} V${top + h} H${left + w}" fill="none" stroke="#333"/><defs><clipPath id="${id}"><rect x="${left}" y="${top}" width="${w}" height="${h}"/></clipPath></defs><g clip-path="url(#${id})">${marks}${annotations}</g><text x="${left + w / 2}" y="${top + h + 36}" text-anchor="middle" font-size="12">${esc(spec.xLabel)}</text><text x="16" y="${top + h / 2}" transform="rotate(-90 16 ${top + h / 2})" text-anchor="middle" font-size="12">${esc(spec.yLabel)}</text>${legend}`
}
export function renderCanvasLayout(spec: CanvasSpec): CanvasRender {
  const plots = [spec, ...(spec.panels ?? [])]; const cols = plots.length > 1 ? spec.columns ?? 2 : 1; const rows = Math.ceil(plots.length / cols)
  const width = spec.width / cols; const height = spec.height / rows
  const content = plots.map((p, i) => `<svg x="${i % cols * width}" y="${Math.floor(i / cols) * height}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${plots.length > 1 ? `<text x="8" y="24" font-size="18" font-weight="700">${String.fromCharCode(65 + i)}</text>` : ''}${plot(p, width, height, `plot-${i}`)}</svg>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}" font-family="Arial, sans-serif" fill="#222"><rect width="100%" height="100%" fill="white"/>${content}</svg>`
  return { format: 'zerowall-science-canvas', version: 1, svg, width: spec.width, height: spec.height, pointCount: plots.reduce((n, p) => n + p.series.reduce((m, s) => m + s.points.length, 0), 0), sourceAssetIds: [...new Set(plots.flatMap(p => p.sourceAssetIds ?? []))], sourceArtifactIds: [...new Set(plots.flatMap(p => p.sourceArtifactIds ?? []))], notes: ['Each panel has independent linear axes; explicit ranges clip out-of-range marks.', 'SVG coordinates and source references are deterministic from the submitted specification.', 'The canvas does not infer statistical uncertainty, significance or scientific meaning from plotted points.'] }
}
