import type { ProjectBundleV1 as ResearchProjectBundleV1 } from '@zerowallscience/research-store/types'
export type ProjectsJsonValue = null | boolean | number | string | ProjectsJsonValue[] | ProjectsJsonObject
export interface ProjectsJsonObject { [key: string]: ProjectsJsonValue }
export interface ProjectsPreferencesRecord { projectId: string; settings: ProjectsJsonObject; lastOpenedAt?: string; updatedAt: string }
export interface ProjectsProjectBundle { format: 'zerowall-science-project'; version: 1; exportedAt: string; project: ProjectDto; sessionArchives: ProjectsJsonObject[]; research?: ProjectsJsonObject }
export type {
  ArtifactRecord, AuditEventRecord, CreateArtifactInput, CreateDataAssetInput, CreateDecisionInput,
  CreateExecutionContextInput, CreatePaperInput, CreateResearchEdgeInput, CreateRunInput, DataAssetRecord,
  DecisionRecord, ExecutionContextRecord, PaperRecord, ResearchEdgeRecord, ResearchProjectSnapshot,
  RunRecord, RunStatus,
  CreatePresentationInput, CreatePublicationInput, PresentationRecord, PublicationRecord,
  UpdateExecutionContextInput,
} from '@zerowallscience/research-store/types'
export type { ProjectPreferencesRecord, UpdateProjectInput } from '@zerowallscience/research-store'
export type { ExecutionCapabilities, ExecutionProbe, ExecutionCommandRequest, ExecutionCommandResult } from '@zerowallscience/plugin-execution'
export type { RunSubmission } from '@zerowallscience/plugin-runs'
export type { ScientificPreviewPayload } from '@zerowallscience/plugin-research'

export type {
  AiCloudAccountSnapshot,
  AiCloudCreateOrderRequest,
  AiCloudLoginRequest,
  AiCloudManagedModel,
  AiCloudPaymentOrder,
  AiCloudPublicConfig,
  AiCloudRegisterRequest,
  AiCloudSendCodeRequest,
} from '@zerowallscience/plugin-account/types'

export type ProjectBundleV1 = ResearchProjectBundleV1

export interface PlatformHealth {
  status: 'ok'
  schemaVersion: number
  databasePath: string
}

export interface ProjectDto {
  id: string
  name: string
  rootPath: string
  description: string
  createdAt: string
  updatedAt: string
}

export interface CreateProjectRequest {
  name: string
  rootPath: string
  description?: string
}

export interface ImportProjectRequest { bundle: ProjectsProjectBundle }
