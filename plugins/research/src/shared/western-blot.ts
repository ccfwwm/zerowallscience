import type { ImageAnnotations } from '@zerowallscience/research-store/types'

export interface WesternBlotPlan {
  polarity: 'dark' | 'bright'
  saturation: { lower: number; upper: number; source: string }
  normalization: 'none' | 'housekeeping' | 'total-protein'
  controlGroup: string | null
  lanes: Array<{ sampleId: string; biologicalReplicate: string; group: string; bandRoiId: string; backgroundRoiId: string; loadingRoiId?: string; loadingBackgroundRoiId?: string }>
}

export function validateWesternBlotPlan(value: unknown, annotation: ImageAnnotations): WesternBlotPlan {
  const object = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Western blot plan object required.')
    return v as Record<string, unknown>
  }
  const text = (v: unknown): string => { if (typeof v !== 'string' || !v.trim() || v.length > 200) throw new Error('Sample, group, ROI and calibration source must be nonempty text up to 200 characters.'); return v.trim() }
  const input = object(value); const saturation = object(input.saturation)
  if (!['dark','bright'].includes(String(input.polarity))) throw new Error('Specify dark or bright band polarity explicitly.')
  if (!['none','housekeeping','total-protein'].includes(String(input.normalization))) throw new Error('Specify the loading normalization method.')
  if (typeof saturation.lower !== 'number' || typeof saturation.upper !== 'number' || !Number.isFinite(saturation.lower) || !Number.isFinite(saturation.upper) || saturation.lower >= saturation.upper) throw new Error('Explicit finite acquisition saturation limits are required.')
  const source = text(saturation.source)
  if (!Array.isArray(input.lanes) || input.lanes.length < 1 || input.lanes.length > 200) throw new Error('Specify 1–200 blot lanes.')
  const ids = new Set<string>(); const targets = new Set<string>()
  const roi = (id: unknown) => {
    const key = text(id); const found = annotation.rois.find(item => item.id === key)
    if (!found || !['rectangle','polygon'].includes(found.kind)) throw new Error('Blot regions must reference saved area ROIs; points cannot be quantified.')
    return found
  }
  const lanes = input.lanes.map(raw => {
    const lane = object(raw); const sampleId = text(lane.sampleId)
    if (ids.has(sampleId)) throw new Error('Duplicate sample ID; identify technical replicate lanes separately.')
    ids.add(sampleId)
    const band = roi(lane.bandRoiId); const background = roi(lane.backgroundRoiId)
    if (band.id === background.id || band.page !== background.page) throw new Error('Band and background require distinct ROIs on the same page.')
    if (targets.has(band.id)) throw new Error('One band ROI cannot represent multiple samples.')
    targets.add(band.id)
    const base = { sampleId, biologicalReplicate: text(lane.biologicalReplicate), group: text(lane.group), bandRoiId: band.id, backgroundRoiId: background.id }
    if (input.normalization === 'none') {
      if (lane.loadingRoiId || lane.loadingBackgroundRoiId) throw new Error('Loading ROIs supplied while normalization is none.')
      return base
    }
    const loading = roi(lane.loadingRoiId); const loadingBackground = roi(lane.loadingBackgroundRoiId)
    if (loading.page !== loadingBackground.page || new Set([band.id,background.id,loading.id,loadingBackground.id]).size !== 4) throw new Error('Use separate loading and background regions on the same loading page.')
    return { ...base, loadingRoiId: loading.id, loadingBackgroundRoiId: loadingBackground.id }
  })
  const controlGroup = input.controlGroup === null ? null : text(input.controlGroup)
  if (controlGroup !== null && !lanes.some(lane => lane.group === controlGroup)) throw new Error('Control group is not represented by any lane.')
  return { polarity: input.polarity as WesternBlotPlan['polarity'], normalization: input.normalization as WesternBlotPlan['normalization'], saturation: { lower: saturation.lower, upper: saturation.upper, source }, controlGroup, lanes }
}

export interface BlotRegionMeasurement { roiId: string; pixels: number; mean: number; sum: number; min: number; max: number; clippedLow: number; clippedHigh: number }
export interface WesternBlotResult {
  format: 'zerowall-western-blot'; version: 1; engine: { imagej: string; java: string }
  sourceSha256: string; annotationRevisionId: string; requestSha256: string; bitDepth: number
  measurements: BlotRegionMeasurement[]
  rows: Array<{ sampleId: string; biologicalReplicate: string; group: string; correctedIntensity: number; loadingCorrectedIntensity: number | null; normalized: number | null; relativeToControl: number | null; flags: string[] }>
  controlMean: number | null; notes: string[]
}
