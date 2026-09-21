import { expect, it } from 'vitest'
import { cameraForward, cameraInverse, validateCellCamera, zoomCellCamera } from '../src/shared/cell-camera.js'
import { prepareCellPlot } from '../src/client/cell-webgl.js'
import type { CellPreview } from '../src/shared/types.js'

it('inverts camera transforms and preserves the cursor anchor while zooming', () => {
  const camera = { zoom: 3, panX: -.25, panY: .4 }
  const point = cameraForward(.37, -.65, camera)
  const restored = cameraInverse(...point, camera)
  expect(restored[0]).toBeCloseTo(.37, 12)
  expect(restored[1]).toBeCloseTo(-.65, 12)
  const zoomed = zoomCellCamera(camera, 1.6, .2, -.3)
  const before = cameraInverse(.2, -.3, camera)
  const after = cameraInverse(.2, -.3, zoomed)
  expect(after[0]).toBeCloseTo(before[0], 12)
  expect(after[1]).toBeCloseTo(before[1], 12)
  expect(zoomCellCamera(camera, .001, 0, 0)).toEqual({ zoom: 1, panX: 0, panY: 0 })
  expect(zoomCellCamera({ zoom: 1, panX: 200, panY: -200 }, 100, 0, 0)).toEqual({ zoom: 100, panX: 200, panY: -200 })
  for (const value of [NaN, Infinity, 0, -1]) expect(() => zoomCellCamera(camera, value, 0, 0)).toThrow()
  for (const value of [{ zoom: 101, panX: 0, panY: 0 }, { zoom: 1, panX: NaN, panY: 0 }, { zoom: 2, panX: 201, panY: 0 }]) expect(() => validateCellCamera(value)).toThrow()
})

it('builds 100k GPU buffers with group colors and selection beyond metadata rows', () => {
  const preview = {
    cells: [{ index: 0, id: 'c0', obs: { condition: 'A' } }],
    embedding: { key: 'X_umap', dimensions: 2, points: Array.from({ length: 100000 }, (_, index) => ({ index, x: index, y: -index, group: index % 2 ? 'B' : 'A' })) },
  } as CellPreview
  const selection = { geometry: { embedding: 'X_umap', axes: [0, 1] as [0, 1], polygon: [[0, 0], [1, 0], [1, 1]] as Array<[number, number]> }, count: 1, total: 100000, scope: 'all-observations' as const, boundary: 'included' as const, tolerance: 1e-10, previewIndices: [99999], sample: [] }
  const data = prepareCellPlot(preview, 'condition', selection)
  expect(data.count).toBe(100000)
  expect(data.positions.byteLength + data.colors.byteLength).toBe(2400000)
  expect([...data.positions.slice(0, 2)]).toEqual([-1, 1])
  expect([...data.positions.slice(-2)]).toEqual([1, -1])
  expect(data.groups).toEqual(['"A"', '"B"'])
  expect([...data.colors.slice(4, 7)]).toEqual([...data.colors.slice(-4, -1)])
  expect(data.colors[3]).toBeCloseTo(.12)
  expect(data.colors.at(-1)).toBeCloseTo(.8)
  preview.expression = { gene: 'G1', values: [{ index: 0, value: -2 }, { index: 99999, value: 4 }] }
  const expression = prepareCellPlot(preview, 'condition')
  expect(expression.expressionRange).toEqual([-2, 4])
  expect(expression.colors[0]).toBe(0)
  expect(expression.colors.at(-4)).toBe(1)
})

it('keeps empty and constant embeddings finite', () => {
  const empty = prepareCellPlot({ cells: [] } as unknown as CellPreview, '')
  expect(empty.count).toBe(0)
  const constant = prepareCellPlot({ cells: [], embedding: { key: 'X_pca', dimensions: 2, points: [{ index: 0, x: 3, y: -2 }] } } as unknown as CellPreview, '')
  expect([...constant.positions]).toEqual([0, 0])
})
