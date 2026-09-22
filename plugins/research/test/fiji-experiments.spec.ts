import { describe, expect, it } from 'vitest'
import { analyzeCfuMask, analyzeColonyMask, analyzeFijiExperiment, analyzeScratchMask, analyzeTubeMask, cfuMeasurement, colonyMeasurement, scratchWoundMeasurement, tubeMeasurement } from '../src/shared/fiji-experiments.js'

describe('deterministic Fiji experiment metrics', () => {
  it('computes scratch closure against the recorded initial area and preserves expansion', () => {
    expect(scratchWoundMeasurement({ sampleId: 's1', time: '24h', initialArea: 100, remainingArea: 40 })).toMatchObject({ closureFraction: .6, closurePercent: 60 })
    expect(scratchWoundMeasurement({ sampleId: 's1', time: '48h', initialArea: 100, remainingArea: 120 }).flags).toContain('wound_area_expanded')
    expect(() => scratchWoundMeasurement({ sampleId: 's1', time: '0h', initialArea: 0, remainingArea: 0 })).toThrow('initialArea')
  })
  it('keeps colony count and staining as separate observations', () => {
    expect(colonyMeasurement({ wellId: 'A1', independentCount: 12 })).toMatchObject({ independentCount: 12, stainedArea: null })
    expect(colonyMeasurement({ wellId: 'A2', independentCount: 12, stainedArea: 4.2, stainUnit: 'mm2' })).toMatchObject({ stainedArea: 4.2, stainUnit: 'mm2' })
    expect(() => colonyMeasurement({ wellId: 'A1', independentCount: 12, stainedArea: 4 })).toThrow('explicit unit')
  })
  it('only computes CFU when dilution and plated volume are supplied', () => {
    expect(cfuMeasurement({ plateId: 'P1', colonyCount: 50, dilutionFactor: 1000, platedVolumeMl: .1 }).cfuPerMl).toBe(500000)
    expect(() => cfuMeasurement({ plateId: 'P1', colonyCount: 50, dilutionFactor: 0, platedVolumeMl: .1 })).toThrow('dilution')
    expect(() => cfuMeasurement({ plateId: 'P1', colonyCount: 50, dilutionFactor: 1000, platedVolumeMl: 0 })).toThrow('volume')
  })
  it('keeps tube skeleton topology and physical units explicit', () => {
    expect(tubeMeasurement({ sampleId: 's1', unit: 'um', unitScale: .5, length: 240, endpoints: 8, junctions: 5, segments: 12, meshes: 3 })).toMatchObject({ unit: 'um', endpoints: 8, meshes: 3 })
    expect(() => tubeMeasurement({ sampleId: 's1', unit: 'um', unitScale: 0, length: 1, endpoints: 1, junctions: 0, segments: 1, meshes: 0 })).toThrow('unit scale')
  })
  it('normalizes the four non-blot experiment contracts without inventing missing metadata', () => {
    expect(analyzeFijiExperiment('scratch-wound', [{ sampleId: 's', time: '0h', initialArea: 100, remainingArea: 100 }]).measurements[0]).toMatchObject({ closurePercent: 0 })
    expect(analyzeFijiExperiment('colony-formation', [{ wellId: 'A1', independentCount: 3 }]).measurements[0]).toMatchObject({ stainedArea: null })
    expect(analyzeFijiExperiment('bacterial-cfu', [{ plateId: 'P1', colonyCount: 10, dilutionFactor: 10, platedVolumeMl: 1 }]).measurements[0]).toMatchObject({ cfuPerMl: 100 })
    expect(analyzeFijiExperiment('tube-formation', [{ sampleId: 's', unit: 'pixel', unitScale: 1, length: 3, endpoints: 1, junctions: 0, segments: 1, meshes: 0 }]).measurements[0]).toMatchObject({ segments: 1 })
    expect(analyzeFijiExperiment('bacterial-cfu', [{ plateId: 'P1', colonyCount: 10 }]).measurements[0]).toMatchObject({ colonyCount: 10, cfuPerMl: null, flags: ['dilution_unknown_count_only', 'volume_unknown_count_only'] })
  })

  it('segments bright colonies from a declared ROI and reports filtered components', () => {
    const data = new Uint8Array(12 * 8)
    const paint = (x: number, y: number, points: Array<[number, number]>) => { for (const [dx, dy] of points) data[(y + dy) * 12 + x + dx] = 255 }
    paint(1, 1, [[0,0],[1,0],[0,1],[1,1]])
    paint(7, 1, [[0,0],[1,0],[0,1],[1,1],[0,2],[1,2]])
    paint(10, 6, [[0,0]])
    const result = analyzeCfuMask({ data, width: 12, height: 8, config: { plateId: 'P1', dilutionFactor: 100, platedVolumeMl: .1, threshold: 200, minArea: 2, maxArea: 10, polarity: 'bright', roi: { x: 0, y: 0, width: 10, height: 8 } } })
    expect(result.measurement).toMatchObject({ colonyCount: 2, cfuPerMl: 2000 })
    expect(result.componentAreas).toEqual([4, 6]); expect(result.discardedComponents).toBe(0)
    expect(analyzeCfuMask({ data, width: 12, height: 8, config: { plateId: 'P1', dilutionFactor: 1, platedVolumeMl: 1, threshold: 200, minArea: 2, maxArea: 5, polarity: 'bright', roi: { x: 0, y: 0, width: 12, height: 8 } } }).discardedComponents).toBe(2)
  })

  it('runs image-backed scratch and colony protocols with explicit calibration boundaries', () => {
    const data = new Uint8Array(12 * 8)
    for (let y = 1; y < 4; y++) for (let x = 1; x < 5; x++) data[y * 12 + x] = 255
    const scratch = analyzeScratchMask({ data, width: 12, height: 8, config: { kind: 'scratch-wound', sampleId: 's1', time: '24h', initialArea: 20, threshold: 200, polarity: 'bright', roi: { x: 0, y: 0, width: 12, height: 8 } } })
    expect(scratch.measurement).toMatchObject({ remainingArea: 12, closurePercent: 40 })
    const colony = analyzeColonyMask({ data, width: 12, height: 8, config: { kind: 'colony-formation', wellId: 'A1', threshold: 200, minArea: 2, maxArea: 20, polarity: 'bright', roi: { x: 0, y: 0, width: 12, height: 8 }, stainUnit: 'pixel' } })
    expect(colony.measurement).toMatchObject({ independentCount: 1, stainedArea: 12, stainUnit: 'pixel' })
    const calibrated = { kind: 'colony-formation' as const, wellId: 'A1', threshold: 200, minArea: 2, maxArea: 20, polarity: 'bright' as const, roi: { x: 0, y: 0, width: 12, height: 8 }, stainUnit: 'mm2' as const }
    expect(() => analyzeColonyMask({ data, width: 12, height: 8, config: calibrated })).toThrow('pixelArea')
    expect(analyzeColonyMask({ data, width: 12, height: 8, config: { ...calibrated, pixelArea: 0.01 } }).measurement.stainedArea).toBe(0.12)
  })

  it('thins a synthetic tube and reports reviewable topology metrics', () => {
    const data = new Uint8Array(9 * 9)
    for (let i = 1; i < 8; i++) { data[4 * 9 + i] = 255; data[i * 9 + 4] = 255 }
    const result = analyzeTubeMask({ data, width: 9, height: 9, config: { kind: 'tube-formation', sampleId: 'tube-1', threshold: 200, polarity: 'bright', roi: { x: 0, y: 0, width: 9, height: 9 }, unit: 'um', unitScale: 0.5 } })
    expect(result.measurement.endpoints).toBe(4)
    expect(result.measurement.junctions).toBeGreaterThanOrEqual(1)
    expect(result.measurement.length).toBeGreaterThan(0)
  })
})
