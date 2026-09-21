import type { ArtifactRecord, DataAssetRecord, ViewerSessionRecord, ImageAnnotations, ImageCoordinates, AnnotationRevisionRecord, AnnotationSaveResult, JsonObject, ImageRoi } from '@zerowallscience/research-store/types'
import type { RunRecord } from '@zerowallscience/research-store/types'
import type { WesternBlotPlan, WesternBlotResult } from './western-blot.js'
import type { FijiExperimentId, FijiExperimentResult, FijiImageConfig } from './fiji-experiments.js'
import type { BidirectionalSangerReview, SangerAnalysis, SangerTrace } from './sanger.js'
import type { FlowAnalysis, FlowDataset, FlowGate } from './flow.js'
import type { HeAnalysis, HeRegion } from './he.js'
import type { CanvasRender, CanvasSpec } from './canvas.js'
import type { CrisprCandidate } from '../host/sequence.js'
import type { CellSelection, CellSelectionResult } from './cell-selection.js'
import type { CellCamera } from './cell-camera.js'
export interface BrainAtlasRequest {
  sessionId: string; action: 'open' | 'read' | 'analyze' | 'export' | 'cells' | 'trajectory' | 'register' | 'cellfinder' | 'render'
  viewerId?: string; expectedVersion?: number; atlas?: string; axis?: 0 | 1 | 2; index?: number; downsample?: number
  region?: string; coordinates?: Array<[number, number, number]>; coordinateUnits?: 'voxel' | 'micron'
  cellsAssetId?: string; backgroundAssetId?: string; assetId?: string; maxCells?: number; voxelSizes?: [number, number, number]; orientation?: string; nFreeCpus?: number; startPlane?: number; endPlane?: number; skipClassification?: boolean; brainRegions?: string[]; brainTitle?: string; brainPointRadius?: number
}
export interface BrainAtlasSummary { atlas: string; version: string | null; species: string; resolution: [number, number, number]; shape: [number, number, number]; regionCount: number; regions: Array<{ id: number; acronym: string; name: string; parentId: number | null }> ; notes: string[] }
export interface BrainSlice { axis: 0 | 1 | 2; index: number; width: number; height: number; downsample: number; labels: number[]; pngBase64?: string; notes: string[] }
export interface BrainRegionResult { query: string; matches: Array<{ id: number; acronym: string; name: string; parentId: number | null; voxelCount?: number; volumeUm3?: number }>; notes: string[] }
export interface BrainCellRecord { index: number; coordinate: [number, number, number]; regionId: number | string; acronym: string; hemisphere: string; }
export interface BrainCellAnalysis { total: number; mapped: number; outside: number; byRegion: Array<{ acronym: string; regionId: number | string; count: number }>; cells: BrainCellRecord[]; notes: string[] }
export interface BrainAtlasResponse { summary?: BrainAtlasSummary; slice?: BrainSlice; region?: BrainRegionResult; analysis?: BrainCellAnalysis; viewer?: ViewerSessionRecord; artifact?: ArtifactRecord; registration?: { status: 'succeeded'; outputDirectory: string; command: string[]; notes: string[] }; cellfinder?: { status: 'succeeded'; detected: number; sourceAssetId: string; backgroundAssetId?: string; voxelSizes: [number, number, number]; notes: string[] }; rendering?: { status: 'succeeded'; outputDirectory: string; pngUri: string; htmlUri: string; regions: string[]; coordinateCount: number; notes: string[] } }
export interface CellViewerRequest { sessionId: string; action: 'open' | 'read' | 'analyze' | 'export' | 'select' | 'export_selection' | 'view'; camera?: CellCamera; assetId?: string; viewerId?: string; expectedVersion?: number; embedding?: string; embeddingLimit?: number; gene?: string; cellLimit?: number; groupBy?: string; selection?: CellSelection | null }
export interface CellEmbedding { key: string; dimensions: number; points: Array<{ index: number; x: number; y: number; z?: number; group?: string | number | boolean | null }> }
export interface CellDatasetSummary { encodingType: string; nObs: number; nVars: number; obsColumns: Array<{ name: string; kind: string }>; varColumns: Array<{ name: string; kind: string }>; varNames: string[]; varNamesTruncated: boolean; embeddings: Array<{ key: string; dimensions: number }>; backed: true }
export interface CellPreview { summary: CellDatasetSummary; sampling: 'first-n'; truncated: boolean; embedding?: CellEmbedding; cells: Array<{ index: number; id: string; obs: Record<string, string | number | boolean | null> }>; expression?: { gene: string; values: Array<{ index: number; value: number }> } }
export interface CellQcSummary { cells: number; genes: number; totalCounts: { min: number; max: number; mean: number }; detectedGenes: { min: number; max: number; mean: number }; notes: string[] }
export interface CellAnalysis { qc: CellQcSummary; groups?: Array<{ group: string | number | boolean | null; cells: number; meanTotalCounts: number }>; gene?: { gene: string; cells: number; detectedCells: number; mean: number; max: number } }
export interface CellResponse { preview?: CellPreview; analysis?: CellAnalysis; viewer?: ViewerSessionRecord; artifact?: ArtifactRecord; selection?: CellSelectionResult }
export interface SangerRequest { sessionId: string; action: 'open' | 'analyze' | 'export' | 'review'; assetId?: string; viewerId?: string; reverseViewerId?: string; expectedVersion?: number; threshold?: number; window?: number; reference?: string }
export interface SangerResponse { trace?: SangerTrace; analysis?: SangerAnalysis; review?: BidirectionalSangerReview; viewer?: ViewerSessionRecord; artifact?: ArtifactRecord }
export interface FlowRequest { sessionId: string; action: 'open' | 'analyze' | 'export'; assetId?: string; viewerId?: string; expectedVersion?: number; transform?: 'none' | 'arcsinh'; cofactor?: number; applyCompensation?: boolean; gates?: FlowGate[]; previewLimit?: number }
export interface FlowResponse { dataset?: FlowDataset; analysis?: FlowAnalysis; viewer?: ViewerSessionRecord; artifact?: ArtifactRecord }
export interface HeRequest { sessionId: string; action: 'open' | 'analyze' | 'export'; assetId?: string; viewerId?: string; expectedVersion?: number; region?: HeRegion }
export interface HeResponse { analysis?: HeAnalysis; viewer?: ViewerSessionRecord; artifact?: ArtifactRecord; he?: { width: number; height: number; pages: number; format: string; notes: string[] } }
export interface CanvasRequest { sessionId: string; action: 'render' | 'export'; spec: CanvasSpec }
export interface CanvasResponse { canvas?: CanvasRender; artifact?: ArtifactRecord; artifacts?: ArtifactRecord[] }
export interface FijiWorkflowRequest { sessionId: string; action: 'list' | 'submit' | 'status' | 'cancel'; runId?: string; requestId?: string; researchTaskId?: string; viewerId?: string; expectedVersion?: number; annotationRevisionId?: string; plan?: WesternBlotPlan }
export interface FijiWorkflowResponse { run?: RunRecord; runs?: RunRecord[]; artifacts?: ArtifactRecord[]; result?: WesternBlotResult }
export interface FijiExperimentRequest { sessionId: string; action: 'list' | 'analyze'; experiment?: FijiExperimentId; requestId?: string; measurements?: JsonObject[]; sourceAssetId?: string; image?: FijiImageConfig }
export interface FijiExperimentResponse { run?: RunRecord; artifacts?: ArtifactRecord[]; result?: FijiExperimentResult; experiments?: FijiExperimentId[] }
export interface ScientificPreviewPayload { uri: string; mediaType: string; byteSize: number; base64: string }
export interface ScientificEngineStatus { id: string; name: string; available: boolean; path?: string; version?: string; reason?: string }
export type ScientificEngineId = 'fiji' | 'napari'
export interface ScientificEngineLaunchResult {
  launchId: string; id: ScientificEngineId; projectId: string; sessionId: string; lifecycleRevision: number
  started: boolean; status: 'starting' | 'spawned' | 'exited' | 'failed' | 'unobserved'; guiReady: 'unverified'
  pid?: number; path: string; assetId?: string; message: string; createdAt: string; finishedAt?: string; exitCode?: number; diagnosticTail?: string
  annotationBridge?: { viewerId: string; baseRevisionId: string; sourceSha256: string; returnPath: string; adapterSha256: string }
}
export interface SequenceRecordInfo { index: number; name: string; description: string; length: number; gcPercent: number | null; ambiguousBases: number }
export interface SequenceWindow { records: SequenceRecordInfo[]; recordIndex: number; start: number; end: number; sequence: string; coordinateSystem: '1-based-inclusive' }
export interface SequenceAnalysis { operation: 'reverse-complement' | 'translate' | 'restriction' | 'crispr'; recordIndex: number; start: number; end: number; sequence?: string; sites?: Array<{ enzyme: string; recognitionStart: number; cutAfter: number }>; candidates?: CrisprCandidate[]; notes: string[] }
export interface SequenceViewState { recordIndex: number; start: number; count: number; selectionStart: number; selectionEnd: number }
export interface ImageViewState { page: number; zoom: number; panX: number; panY: number }
export interface ImagePreview {
  sourceSha256: string; coordinates: ImageCoordinates; format: string; channels: number; depth: string
  page: number; previewWidth: number; previewHeight: number; pngBase64: string; notes: string[]; axes?: { order: string; sizes: Record<string, number>; physicalSize?: { x?: number; y?: number; unit?: string }; position?: { page: number; z?: number; c?: number; t?: number } }
}
export interface ImageRoiStatistics {
  roiId: string; name: string; kind: ImageRoi['kind']; page: number; pixelCount: number; channels: number
  sum: number[]; mean: number[]; min: number[]; max: number[]; standardDeviation: number[]
}
export interface ImageAnalysis {
  runner: string; sourceAssetId: string; sourceSha256: string; viewerId: string; viewerVersion: number; annotationRevisionId: string
  sourceWidth: number; sourceHeight: number; sourcePages: number; calibration: ImageCoordinates['calibration']; rois: ImageRoiStatistics[]; notes: string[]
}
export interface ScienceViewerRequest {
  sessionId: string
  action: 'list' | 'open' | 'read' | 'save' | 'analyze' | 'export' | 'launch_native' | 'native_status' | 'image_open' | 'image_read' | 'image_save' | 'image_analyze' | 'annotation_save' | 'annotation_export' | 'annotation_import' | 'annotation_launch' | 'annotation_collect' | 'sanger_open' | 'sanger_analyze' | 'sanger_export' | 'sanger_review' | 'flow_open' | 'flow_analyze' | 'flow_export' | 'he_open' | 'he_analyze' | 'he_export' | 'cell_open' | 'cell_read' | 'cell_analyze' | 'cell_export' | 'cell_select' | 'cell_export_selection' | 'cell_view' | 'brain_open' | 'brain_read' | 'brain_analyze' | 'brain_export' | 'brain_cells' | 'brain_trajectory' | 'brain_register' | 'brain_cellfinder' | 'brain_render' | 'canvas_render' | 'canvas_export'
  sanger?: SangerRequest
  flow?: FlowRequest
  he?: HeRequest
  canvas?: CanvasRequest
  cell?: CellViewerRequest
  brain?: BrainAtlasRequest
  launchId?: string
  reverseViewerId?: string
  engine?: ScientificEngineId
  assetId?: string
  viewerId?: string
  expectedVersion?: number
  threshold?: number
  window?: number
  reference?: string
  transform?: 'none' | 'arcsinh'
  cofactor?: number
  applyCompensation?: boolean
  gates?: FlowGate[]
  previewLimit?: number
  region?: HeRegion
  state?: SequenceViewState
  operation?: SequenceAnalysis['operation']; crisprTarget?: string; crisprMaxMismatches?: number
  imageState?: ImageViewState
  annotation?: { expectedRevisionId: string | null; payload: ImageAnnotations }
  annotationRevisionId?: string
  importAssetId?: string
  embedding?: string; embeddingLimit?: number; gene?: string; cellLimit?: number; groupBy?: string
  cellSelection?: CellSelection | null
  cellCamera?: CellCamera
  brainAxis?: 0 | 1 | 2; brainIndex?: number; brainDownsample?: number; brainRegion?: string; brainCoordinates?: Array<[number, number, number]>; brainCoordinateUnits?: 'voxel' | 'micron'; cellsAssetId?: string; backgroundAssetId?: string; brainVoxelSizes?: [number, number, number]; brainOrientation?: string; brainNFreeCpus?: number; brainStartPlane?: number; brainEndPlane?: number; brainSkipClassification?: boolean; brainRegions?: string[]; brainTitle?: string; brainPointRadius?: number; maxCells?: number
}
export interface ScienceViewerResponse {
  launch?: ScientificEngineLaunchResult
  launches?: ScientificEngineLaunchResult[]
  assets?: DataAssetRecord[]
  viewers?: ViewerSessionRecord[]
  viewer?: ViewerSessionRecord
  window?: SequenceWindow
  analysis?: SequenceAnalysis
  artifact?: ArtifactRecord
  image?: ImagePreview
  annotations?: AnnotationRevisionRecord[]
  annotationHead?: AnnotationRevisionRecord
  annotationSave?: AnnotationSaveResult
  imageAnalysis?: ImageAnalysis
  sanger?: SangerResponse
  flow?: FlowResponse
  he?: HeResponse
  canvas?: CanvasResponse
  cell?: CellResponse
  brain?: BrainAtlasResponse
}
