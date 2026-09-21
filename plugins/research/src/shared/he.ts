export interface HeRegion { x: number; y: number; width: number; height: number; page?: number }
export interface HeAnalysis {
  format: 'zerowall-he-analysis'
  version: 1
  width: number
  height: number
  region: Required<HeRegion>
  pixels: number
  meanRgb: { r: number; g: number; b: number }
  nucleiLikePixels: number
  nucleiLikeFraction: number
  nucleiCount: number
  nucleiAreas: number[]
  flags: string[]
  notes: string[]
}

export function validateHeRegion(value: unknown, width: number, height: number, pages: number): Required<HeRegion> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('HE region is required.')
  const input = value as Record<string, unknown>; const integer = (key: string): number => { const result = Number(input[key]); if (!Number.isSafeInteger(result)) throw new Error(`HE ${key} must be an integer.`); return result }
  const region = { x: integer('x'), y: integer('y'), width: integer('width'), height: integer('height'), page: input.page === undefined ? 0 : integer('page') }
  if (region.x < 0 || region.y < 0 || region.width < 1 || region.height < 1 || region.x + region.width > width || region.y + region.height > height || region.page < 0 || region.page >= pages) throw new Error('HE region is outside the decoded slide page.')
  if (region.width * region.height > 25_000_000) throw new Error('HE ROI exceeds the bounded 25-million-pixel CPU analysis limit.')
  return region
}

export function analyzeHeRgb(raw: Uint8Array, width: number, height: number, region: Required<HeRegion>): HeAnalysis {
  if (raw.length !== width * height * 3) throw new Error('HE RGB buffer geometry is inconsistent.')
  let red = 0; let green = 0; let blue = 0; let nuclei = 0
  const mask = new Uint8Array(width * height)
  for (let index = 0; index < raw.length; index += 3) {
    const r = raw[index]!; const g = raw[index + 1]!; const b = raw[index + 2]!; red += r; green += g; blue += b
    const luminance = .2126 * r + .7152 * g + .0722 * b
    if (luminance < 170 && b >= r * .78 && b >= g * .62) { nuclei++; mask[index / 3] = 1 }
  }
  const pixels = width * height
  const areas: number[] = []; const queue = new Int32Array(Math.max(1, mask.length))
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start]) continue
    mask[start] = 0; let head = 0; let tail = 0; let area = 0; queue[tail++] = start
    while (head < tail) {
      const point = queue[head++]!; area++; const row = Math.floor(point / width); const col = point - row * width
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const x = col + dx; const y = row + dy; if (x < 0 || y < 0 || x >= width || y >= height) continue
        const next = y * width + x; if (mask[next]) { mask[next] = 0; queue[tail++] = next }
      }
    }
    areas.push(area)
  }
  return { format: 'zerowall-he-analysis', version: 1, width, height, region, pixels, meanRgb: { r: red / pixels, g: green / pixels, b: blue / pixels }, nucleiLikePixels: nuclei, nucleiLikeFraction: nuclei / pixels, nucleiCount: areas.length, nucleiAreas: areas, flags: nuclei === 0 ? ['no_nuclei_like_pixels_observed'] : [], notes: ['Deterministic colour/brightness screening plus 8-connected component counting over the selected RGB tile, not StarDist and not a diagnostic model.', 'No cell separation, tissue diagnosis, stain deconvolution or clinical interpretation is inferred.', 'The region and decoded page remain in original pixel coordinates.'] }
}
