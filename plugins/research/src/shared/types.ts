import type { SangerEdit } from './sanger-revision.js'
import type { BrainTransformRequest } from './brain-transform.js'
import type { ArtifactRecord, DataAssetRecord, ViewerSessionRecord, ImageAnnotations, ImageCoordinates, AnnotationRevisionRecord, AnnotationSaveResult, JsonObject, ImageRoi } from '@zerowallscience/research-store/types'
import type { RunRecord } from '@zerowallscience/research-store/types'
import type { WesternBlotPlan, WesternBlotResult } from './western-blot.js'
import type { FijiExperimentId, FijiExperimentResult, FijiImageConfig } from './fiji-experiments.js'
import type { BidirectionalSangerReview, SangerAnalysis, SangerTrace } from './sanger.js'
import type { FlowAnalysis, FlowDataset, FlowGate } from './flow.js'
import type { HeSegmentationParameters, HeSegmentationResult } from './he-segmentation.js'
import type { HeAnalysis, HeRegion, HeSlideMetadata, HeTile } from './he.js'
import type { CanvasRender, CanvasSpec } from './canvas.js'
import type { CrisprCandidate, SequenceFeature } from '../host/sequence.js'
import type { CellSelection, CellSelectionResult } from './cell-selection.js'
import type { CellCamera } from './cell-camera.js'
import type { MoleculeMeasurement, MoleculeRuntime, MoleculeSummary, MoleculeViewState } from './molecule.js'
export interface MoleculeRequest { sessionId: string; action: 'runtime' | 'open' | 'read' | 'save' | 'measure' | 'export'; assetId?: string; viewerId?: string; expectedVersion?: number; state?: MoleculeViewState; atomA?: number; atomB?: number; pngBase64?: string }
export interface MoleculeResponse { viewer?: ViewerSessionRecord; summary?: MoleculeSummary; state?: MoleculeViewState; source?: string; measurement?: MoleculeMeasurement; artifact?: ArtifactRecord; artifacts?: ArtifactRecord[]; runtime?: MoleculeRuntime }
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
export interface SangerRequest { sessionId: string; action: 'open' | 'analyze' | 'export' | 'review' | 'revise'; edits?: SangerEdit[]; assetId?: string; viewerId?: string; reverseViewerId?: string; expectedReverseVersion?: number; expectedVersion?: number; threshold?: number; window?: number; reference?: string }
export interface SangerResponse { trace?: SangerTrace; analysis?: SangerAnalysis; review?: BidirectionalSangerReview; viewer?: ViewerSessionRecord; artifact?: ArtifactRecord }
export interface FlowRequest { sessionId: string; action: 'open' | 'analyze' | 'export' | 'import' | 'workspace_import' | 'batch_submit' | 'batch_status' | 'batch_cancel' | 'batch_list'; requestId?: string; runId?: string; importAssetId?: string; assetId?: string; assetIds?: string[]; viewerId?: string; expectedVersion?: number; transform?: 'none' | 'arcsinh'; cofactor?: number; applyCompensation?: boolean; gates?: FlowGate[]; previewLimit?: number }
export interface FlowBatchItem { assetId: string; sourceSha256?: string; sampleId?: string; groups?: string[]; analysis?: FlowAnalysis; error?: string }
export interface FlowResponse { dataset?: FlowDataset; analysis?: FlowAnalysis; viewer?: ViewerSessionRecord; artifact?: ArtifactRecord; run?: RunRecord; runs?: RunRecord[]; batch?: { items: FlowBatchItem[]; workspaceSha256?: string; notes: string[] } }
export interface HeRequest { sessionId: string; action: 'open' | 'read' | 'analyze' | 'export' | 'segment' | 'status' | 'cancel'; requestId?: string; runId?: string; segmentation?: HeSegmentationParameters; assetId?: string; viewerId?: string; expectedVersion?: number; region?: HeRegion }
export interface HeResponse { run?: RunRecord; artifacts?: ArtifactRecord[]; segmentation?: HeSegmentationResult; analysis?: HeAnalysis; viewer?: ViewerSessionRecord; artifact?: ArtifactRecord; he?: HeSlideMetadata; tile?: HeTile }
export interface CanvasRequest { sessionId: string; action: 'render' | 'export'; spec: CanvasSpec }
export interface CanvasResponse { spec?: CanvasSpec; canvas?: CanvasRender; artifact?: ArtifactRecord; artifacts?: ArtifactRecord[] }
export interface FijiWorkflowRequest { sessionId: string; action: 'list' | 'submit' | 'status' | 'cancel'; runId?: string; requestId?: string; researchTaskId?: string; viewerId?: string; expectedVersion?: number; annotationRevisionId?: string; plan?: WesternBlotPlan }
export interface FijiWorkflowResponse { run?: RunRecord; runs?: RunRecord[]; artifacts?: ArtifactRecord[]; result?: WesternBlotResult }
export interface FijiExperimentRequest { sessionId: string; action: 'list' | 'analyze' | 'status' | 'cancel'; runId?: string; experiment?: FijiExperimentId; requestId?: string; measurements?: JsonObject[]; sourceAssetId?: string; image?: FijiImageConfig }
export interface FijiExperimentResponse { run?: RunRecord; artifacts?: ArtifactRecord[]; result?: FijiExperimentResult; runs?: RunRecord[]; annotations?: AnnotationRevisionRecord[]; experiments?: FijiExperimentId[] }
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
export interface SequenceWindow { records: SequenceRecordInfo[]; recordIndex: number; start: number; end: number; sequence: string; coordinateSystem: '1-based-inclusive'; topology?: 'linear' | 'circular' | 'unknown'; features?: SequenceFeature[]; featureCount?: number; featureWarnings?: string[] }
export interface SequenceAnalysis { operation: 'reverse-complement' | 'translate' | 'restriction' | 'crispr' | 'pcr' | 'gibson' | 'golden-gate'; recordIndex: number; start: number; end: number; sequence?: string; sites?: Array<{ enzyme: string; recognitionStart: number; cutAfter: number }>; candidates?: CrisprCandidate[]; simulation?: import('./sequence.js').SequenceSimulationResult; notes: string[] }
export interface SequenceViewState { recordIndex: number; start: number; count: number; selectionStart: number; selectionEnd: number; mapMode?: 'linear' | 'circular' }
export interface ImageViewState { page: number; zoom: number; panX: number; panY: number }
export interface ImagePreview {
  sourceSha256: string; coordinates: ImageCoordinates; format: string; channels: number; depth: string
  page: number; previewWidth: number; previewHeight: number; pngBase64: string; notes: string[]; axes?: { order: string; sizes: Record<string, number>; storage?: 'ome-tiff' | 'ome-zarr'; physicalSize?: { x?: number; y?: number; unit?: string }; position?: { page: number; z?: number; c?: number; t?: number } }
}
export interface ImageRoiStatistics {
  roiId: string; name: string; kind: ImageRoi['kind']; page: number; pixelCount: number; channels: number
  sum: number[]; mean: number[]; min: number[]; max: number[]; standardDeviation: number[]
}
export interface ImageAnalysis {
  runner: string; sourceAssetId: string; sourceSha256: string; viewerId: string; viewerVersion: number; annotationRevisionId: string
  sourceWidth: number; sourceHeight: number; sourcePages: number; calibration: ImageCoordinates['calibration']; rois: ImageRoiStatistics[]; notes: string[]
}
export interface ImageMaskLabelStatistics {
  label: number; pixelCount: number; channels: number
  sum: number[]; mean: number[]; min: number[]; max: number[]; standardDeviation: number[]
}
export interface ImageMaskRoiStatistics {
  roiId: string; name: string; kind: ImageRoi['kind']; page: number; labels: ImageMaskLabelStatistics[]
}
export interface ImageMaskAnalysis {
  runner: string; sourceAssetId: string; sourceSha256: string; maskAssetId: string; maskSha256: string
  viewerId: string; viewerVersion: number; annotationRevisionId: string
  sourceWidth: number; sourceHeight: number; sourcePages: number; maskDepth: string
  requestedLabels: number[] | null; rois: ImageMaskRoiStatistics[]; notes: string[]
}
export interface ScienceViewerRequest {
  brainTransform?: BrainTransformRequest
  sessionId: string
  action: 'list' | 'open' | 'read' | 'save' | 'analyze' | 'export' | 'launch_native' | 'native_status' | 'image_open' | 'image_read' | 'image_save' | 'image_analyze' | 'image_mask_analyze' | 'annotation_save' | 'annotation_export' | 'annotation_import' | 'annotation_launch' | 'annotation_collect' | 'sanger_open' | 'sanger_analyze' | 'sanger_export' | 'sanger_review' | 'sanger_revise' | 'flow_open' | 'flow_analyze' | 'flow_export' | 'flow_import' | 'flow_workspace_import' | 'flow_batch_submit' | 'flow_batch_status' | 'flow_batch_cancel' | 'flow_batch_list' | 'he_open' | 'he_read' | 'he_analyze' | 'he_export' | 'he_segment' | 'he_status' | 'he_cancel' | 'cell_open' | 'cell_read' | 'cell_analyze' | 'cell_export' | 'cell_select' | 'cell_export_selection' | 'cell_view' | 'brain_open' | 'brain_read' | 'brain_analyze' | 'brain_export' | 'brain_cells' | 'brain_trajectory' | 'brain_register' | 'brain_cellfinder' | 'brain_render' | 'brain_transform' | 'canvas_render' | 'canvas_export'
    | 'molecule_runtime' | 'molecule_open' | 'molecule_read' | 'molecule_save' | 'molecule_measure' | 'molecule_export'
  sanger?: SangerRequest
  molecule?: MoleculeRequest
  flow?: FlowRequest
  he?: HeRequest
  canvas?: CanvasRequest
  cell?: CellViewerRequest
  brain?: BrainAtlasRequest
  launchId?: string
  reverseViewerId?: string
  expectedReverseVersion?: number
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
  requestId?: string
  runId?: string
  region?: HeRegion
  state?: SequenceViewState
  operation?: SequenceAnalysis['operation']; crisprTarget?: string; crisprMaxMismatches?: number
  sequenceOptions?: import('./sequence.js').SequenceSimulationOptions
  imageState?: ImageViewState
  annotation?: { expectedRevisionId: string | null; payload: ImageAnnotations }
  annotationRevisionId?: string
  maskAssetId?: string
  maskLabels?: number[]
    importAssetId?: string
    assetIds?: string[]
  embedding?: string; embeddingLimit?: number; gene?: string; cellLimit?: number; groupBy?: string
  cellSelection?: CellSelection | null
  cellCamera?: CellCamera
  brainAxis?: 0 | 1 | 2; brainIndex?: number; brainDownsample?: number; brainRegion?: string; brainCoordinates?: Array<[number, number, number]>; brainCoordinateUnits?: 'voxel' | 'micron'; cellsAssetId?: string; backgroundAssetId?: string; brainVoxelSizes?: [number, number, number]; brainOrientation?: string; brainNFreeCpus?: number; brainStartPlane?: number; brainEndPlane?: number; brainSkipClassification?: boolean; brainRegions?: string[]; brainTitle?: string; brainPointRadius?: number; maxCells?: number
}
export interface ScienceViewerResponse {
  brainTransform?: JsonObject
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
  imageMaskAnalysis?: ImageMaskAnalysis
  sanger?: SangerResponse
  molecule?: MoleculeResponse
  flow?: FlowResponse
  he?: HeResponse
  canvas?: CanvasResponse
  cell?: CellResponse
  brain?: BrainAtlasResponse
}
export interface NhanesSurveyRequest {
  studyId: string
  contractId: string
  planId: string
  taskId: string
  requestId: string
  expectedPlanVersion: number
}
export interface GeneticAnalysisRequest extends NhanesSurveyRequest {}
export interface GeneticRefreshRequest { studyId: string; runId: string }

export type { MoleculeDockingRequest } from './molecule-docking.js'

export type { SequenceSimulationOptions, SequenceSimulationResult } from './sequence.js'

export type { BrainTransformRequest } from './brain-transform.js'
