import type { ArtifactRecord, RunRecord } from '@zerowallscience/research-store/types'
import type { HeRegion } from './he.js'

export interface HeSegmentationParameters {
  tileSize?: 256 | 512 | 1024
  halo?: number
  probabilityThreshold?: number
  nmsThreshold?: number
  threads?: number
}
export interface HeSegmentationRequest {
  sessionId: string
  action: 'segment' | 'status' | 'cancel'
  viewerId?: string
  expectedVersion?: number
  requestId?: string
  runId?: string
  region?: HeRegion
  segmentation?: HeSegmentationParameters
}
export interface HeSegmentationResult {
  format: 'zerowall-he-stardist'
  version: 1
  sourceSha256: string
  region: Required<HeRegion>
  count: number
  boundaryCount: number
  sampleWidth: number
  sampleHeight: number
  downsample: number
  model: { name: string; sha256: string; source: string; license: string }
  parameters: Required<HeSegmentationParameters>
  normalization: { lower: number[]; upper: number[]; samplePixels: number; method: string }
  tiles: number
  deduplication: { algorithm: string; removed: number }
  calibration: { x: number; y: number; unit: 'um'; source: string } | null
  physical?: { roiAreaUm2: number; nucleiPerMm2: number }
  preview: { pngBase64: string; width: number; height: number }
  notes: string[]
}
export interface HeSegmentationResponse {
  run?: RunRecord
  artifacts?: ArtifactRecord[]
  segmentation?: HeSegmentationResult
}

export function validateHeSegmentationParameters(input: HeSegmentationParameters = {}): Required<HeSegmentationParameters> {
  const result = { tileSize: input.tileSize ?? 512, halo: input.halo ?? 128, probabilityThreshold: input.probabilityThreshold ?? 0.6924782541382084, nmsThreshold: input.nmsThreshold ?? 0.3, threads: input.threads ?? 4 }
  if (![256, 512, 1024].includes(result.tileSize)) throw new Error('HE tileSize must be 256, 512 or 1024.')
  if (!Number.isSafeInteger(result.halo) || result.halo < 128 || result.halo > 256) throw new Error('HE halo must be 128–256 pixels to retain model context.')
  for (const key of ['probabilityThreshold', 'nmsThreshold'] as const) if (typeof result[key] !== 'number' || !Number.isFinite(result[key]) || result[key] <= 0 || result[key] >= 1) throw new Error(`HE ${key} must be strictly between 0 and 1.`)
  if (!Number.isSafeInteger(result.threads) || result.threads < 1 || result.threads > 8) throw new Error('HE CPU threads must be between 1 and 8.')
  return result
}
