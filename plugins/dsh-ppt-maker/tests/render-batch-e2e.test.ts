import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { unzlibSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createProject, editProject } from '../src/core/project/store.js'
import { renderProjectPreviews } from '../src/core/export-pipeline.js'

/** Decode only the 8-bit RGB/RGBA PNGs emitted by the native renderer. */
function pixels(bytes: Buffer): { width: number; height: number; sample: (x: number, y: number) => number[] } {
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
  expect(bytes[24]).toBe(8)
  const channels = bytes[25] === 6 ? 4 : bytes[25] === 2 ? 3 : 0
  expect(channels).toBeGreaterThan(0)
  const parts: Buffer[] = []
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const count = bytes.readUInt32BE(offset)
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT') parts.push(bytes.subarray(offset + 8, offset + 8 + count))
    offset += 12 + count
  }
  const raw = unzlibSync(Buffer.concat(parts)), stride = width * channels, decoded = new Uint8Array(height * stride)
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c)
    return x <= y && x <= z ? a : y <= z ? b : c
  }
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)]
    for (let column = 0; column < stride; column++) {
      const target = row * stride + column, left = column >= channels ? decoded[target - channels] : 0
      const up = row ? decoded[target - stride] : 0, diagonal = row && column >= channels ? decoded[target - stride - channels] : 0
      const correction = filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, diagonal) : 0
      decoded[target] = (raw[row * (stride + 1) + column + 1] + correction) & 255
    }
  }
  return { width, height, sample: (x, y) => [...decoded.subarray((y * width + x) * channels, (y * width + x) * channels + 3)] }
}

describe('native 40-page batch, custom-size geometry and cache', () => {
  it('keeps all four corners visible and reuses a completed unchanged deck', { timeout: 120000 }, async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'ppt-native-40-'))
    try {
      await createProject(cwd, { dir: 'deck', size: [1672, 941] })
      const markers = [
        { color: '#ff0000', bounds: [10, 10, 40, 40], center: [30, 30], rgb: [255, 0, 0] },
        { color: '#00ff00', bounds: [1622, 10, 40, 40], center: [1642, 30], rgb: [0, 255, 0] },
        { color: '#0000ff', bounds: [10, 891, 40, 40], center: [30, 911], rgb: [0, 0, 255] },
        { color: '#ff00ff', bounds: [1622, 891, 40, 40], center: [1642, 911], rgb: [255, 0, 255] }
      ]
      await editProject(cwd, { dir: 'deck', ops: Array.from({ length: 40 }, (_, index) => ({ op: 'add_page', page: `pages/${index + 1}.page`, content: {
        elements: markers.map((marker, index) => ({ elementId: `corner-${index}`, elementType: 'shape', shapeName: 'rect', bounds: marker.bounds, fill: { type: 'solid', color: marker.color } }))
      } })) })
      const started = performance.now()
      const result = await renderProjectPreviews(cwd, 'deck')
      const firstMs = Math.round(performance.now() - started)
      expect(result.images).toHaveLength(40)
      for (const page of [result.images[0], result.images[39]]) {
        const image = pixels(await readFile(page.path))
        expect(image.width / image.height).toBeCloseTo(1672 / 941, 2)
        for (const marker of markers) {
          const sample = image.sample(Math.round(marker.center[0] * image.width / 1672), Math.round(marker.center[1] * image.height / 941))
          console.info(`[ppt-native-40] marker=${marker.color} sample=${sample.join(',')} image=${image.width}x${image.height}`)
          expect(sample).toEqual(marker.rgb)
        }
      }
      const cachedAt = performance.now()
      const cached = await renderProjectPreviews(cwd, 'deck')
      const cachedMs = Math.round(performance.now() - cachedAt)
      expect(cached.images).toEqual(result.images)
      console.info(`[ppt-native-40] initialMs=${firstMs} unchangedMs=${cachedMs} pages=${result.images.length} size=${result.images[0].width}x${result.images[0].height}`)
    } finally { await rm(cwd, { recursive: true, force: true }) }
  })
})
