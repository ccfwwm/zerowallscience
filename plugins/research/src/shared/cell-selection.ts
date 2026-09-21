export interface CellSelection {
  embedding: string
  axes: [0, 1]
  polygon: Array<[number, number]>
}

export interface CellSelectionResult {
  geometry: CellSelection
  count: number
  total: number
  scope: 'all-observations'
  boundary: 'included'
  tolerance: number
  previewIndices: number[]
  sample: Array<{ index: number; id: string }>
}

/** Geometry is in stored embedding coordinates, never screen coordinates. */
export function validateCellSelection(value: unknown): CellSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A cell selection geometry is required.')
  const v = value as CellSelection
  if (typeof v.embedding !== 'string' || !v.embedding.length || v.embedding.length > 1000 || !Array.isArray(v.axes) || v.axes.length !== 2 || v.axes[0] !== 0 || v.axes[1] !== 1) throw new Error('Cell selection requires an embedding and axes [0,1].')
  if (!Array.isArray(v.polygon) || v.polygon.length < 3 || v.polygon.length > 128) throw new Error('Cell selection requires 3–128 polygon vertices.')
  for (const p of v.polygon) if (!Array.isArray(p) || p.length !== 2 || p.some(x => typeof x !== 'number' || !Number.isFinite(x) || Math.abs(x) > 1e12)) throw new Error('Invalid cell selection coordinates.')
  const area = v.polygon.reduce((sum, p, i) => { const q = v.polygon[(i+1)%v.polygon.length]!; return sum + p[0]*q[1]-q[0]*p[1] }, 0)
  if (Math.abs(area) < 1e-12) throw new Error('Cell selection polygon has zero area.')
  return { embedding: v.embedding, axes: [0, 1], polygon: v.polygon.map(p => [p[0], p[1]]) }
}
