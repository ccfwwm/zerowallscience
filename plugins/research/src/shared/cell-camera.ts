export interface CellCamera { zoom: number; panX: number; panY: number }
export const DEFAULT_CELL_CAMERA: CellCamera = { zoom: 1, panX: 0, panY: 0 }
export function validateCellCamera(input: unknown): CellCamera {
  if (!input || typeof input !== 'object') throw new Error('Cell camera is required.')
  const v = input as CellCamera
  if (!Number.isFinite(v.zoom) || v.zoom < 1 || v.zoom > 100 || !Number.isFinite(v.panX) || !Number.isFinite(v.panY) || Math.abs(v.panX) > 200 || Math.abs(v.panY) > 200) throw new Error('Invalid cell camera.')
  return { zoom: v.zoom, panX: v.panX, panY: v.panY }
}
/** Points are normalized to [-1,1] before GPU upload. Pan is measured in clip space. */
export function cameraForward(x: number, y: number, c: CellCamera): [number, number] { return [x*c.zoom+c.panX,y*c.zoom+c.panY] }
export function cameraInverse(x: number, y: number, c: CellCamera): [number, number] { return [(x-c.panX)/c.zoom,(y-c.panY)/c.zoom] }
export function zoomCellCamera(c: CellCamera, factor: number, x: number, y: number): CellCamera {
  validateCellCamera(c)
  if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Invalid cell zoom input.')
  const zoom = Math.max(1,Math.min(100,c.zoom*factor)); const anchor = cameraInverse(x,y,c)
  const bounded = (value: number) => Math.max(-200, Math.min(200, value))
  return validateCellCamera({ zoom, panX: zoom === 1 ? 0 : bounded(x-anchor[0]*zoom), panY: zoom === 1 ? 0 : bounded(y-anchor[1]*zoom) })
}
