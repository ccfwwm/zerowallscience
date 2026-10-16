export interface ImageCoordinates {
  convention: 'pixel-edge-top-left'
  width: number
  height: number
  pages: number
  // Physical calibration is explicit and sourced; file DPI is not microscopy calibration.
  calibration: { x: number; y: number; unit: 'um' | 'mm'; source: string } | null
}
export type ImageRoi = { id: string; name: string; page: number } & (
  { kind: 'rectangle'; x: number; y: number; width: number; height: number } |
  { kind: 'polygon'; points: Array<[number, number]> } |
  { kind: 'point'; x: number; y: number }
)
export interface ImageAnnotations { coordinates: ImageCoordinates; rois: ImageRoi[] }
export interface AnnotationRevisionRecord {
  id: string; projectId: string; assetId: string; sourceSha256: string
  revision: number; baseRevisionId: string | null; status: 'accepted' | 'conflict'
  origin: 'workbench' | 'fiji' | 'napari'; payload: ImageAnnotations; createdAt: string
}
export interface CreateAnnotationRevisionInput {
  projectId: string; assetId: string; sourceSha256: string
  expectedRevisionId: string | null; origin: AnnotationRevisionRecord['origin']; payload: ImageAnnotations
}
export interface AnnotationSaveResult { revision: AnnotationRevisionRecord; head: AnnotationRevisionRecord; conflict: boolean }

export function validateAnnotationPayload(value: unknown): ImageAnnotations {
  const object = (input: unknown): Record<string, unknown> => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Annotation object required.')
    return input as Record<string, unknown>
  }
  const finite = (input: unknown): number => {
    if (typeof input !== 'number' || !Number.isFinite(input)) throw new Error('Annotation coordinates must be finite numbers.')
    return input
  }
  const integer = (input: unknown, min: number, max: number): number => {
    const n = finite(input)
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error('Invalid annotation dimension or page.')
    return n
  }
  const text = (input: unknown): string => {
    if (typeof input !== 'string' || !input.trim() || input.length > 200) throw new Error('Annotation name, ID or calibration source must be 1–200 characters.')
    return input
  }
  const input = object(value); const coordinate = object(input.coordinates)
  if (coordinate.convention !== 'pixel-edge-top-left') throw new Error('Unsupported annotation coordinates.')
  const coordinates: ImageCoordinates = { convention: 'pixel-edge-top-left', width: integer(coordinate.width, 1, 10000000), height: integer(coordinate.height, 1, 10000000), pages: integer(coordinate.pages, 1, 1000000), calibration: null }
  if (coordinate.calibration !== null) {
    const scale = object(coordinate.calibration)
    const x = finite(scale.x); const y = finite(scale.y)
    if (x <= 0 || y <= 0 || (scale.unit !== 'um' && scale.unit !== 'mm')) throw new Error('Invalid physical calibration.')
    coordinates.calibration = { x, y, unit: scale.unit, source: text(scale.source) }
  }
  if (!Array.isArray(input.rois) || input.rois.length > 10000) throw new Error('At most 10,000 ROIs are allowed per revision.')
  const ids = new Set<string>(); let vertices = 0
  const point = (x: unknown, y: unknown): [number, number] => {
    const px = finite(x); const py = finite(y)
    if (px < 0 || py < 0 || px > coordinates.width || py > coordinates.height) throw new Error('ROI is outside the original image bounds.')
    return [px, py]
  }
  const rois: ImageRoi[] = input.rois.map(raw => {
    const roi = object(raw); const id = text(roi.id)
    if (ids.has(id)) throw new Error('Duplicate ROI ID.')
    ids.add(id)
    const base = { id, name: text(roi.name), page: integer(roi.page, 0, coordinates.pages - 1) }
    if (roi.kind === 'rectangle') {
      const [x, y] = point(roi.x, roi.y); const width = finite(roi.width); const height = finite(roi.height)
      if (width <= 0 || height <= 0) throw new Error('Rectangle dimensions must be positive.')
      point(x + width, y + height)
      return { ...base, kind: 'rectangle', x, y, width, height }
    }
    if (roi.kind === 'point') { const [x, y] = point(roi.x, roi.y); return { ...base, kind: 'point', x, y } }
    if (roi.kind === 'polygon') {
      if (!Array.isArray(roi.points) || roi.points.length < 3 || roi.points.length > 10000) throw new Error('Polygon must contain 3–10,000 vertices.')
      vertices += roi.points.length
      if (vertices > 100000) throw new Error('Annotation vertex limit exceeded.')
      const points = roi.points.map(p => { if (!Array.isArray(p) || p.length !== 2) throw new Error('Expected [x,y] vertex.'); return point(p[0], p[1]) })
      return { ...base, kind: 'polygon', points }
    }
    throw new Error('Unsupported ROI kind.')
  })
  return { coordinates, rois }
}
