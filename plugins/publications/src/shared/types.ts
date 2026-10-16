export type ZeroWallPluginTypes = Record<string, never>
export type PublicationsJsonValue = null | boolean | number | string | PublicationsJsonValue[] | PublicationsJsonObject
export interface PublicationsJsonObject { [key: string]: PublicationsJsonValue }
export interface PublicationsCreateInput { projectId: string; title: string; manifest?: PublicationsJsonObject }
export interface PublicationsRunSubmission { projectId: string; executionContextId?: string; name: string; command: string; workingDirectory: string; timeoutMs?: number; inputs?: PublicationsJsonValue[]; outputs?: PublicationsJsonValue[] }
export interface PublicationsRecord { id: string; projectId: string; title: string; status: 'draft' | 'frozen' | 'validating' | 'ready' | 'failed'; manifest: PublicationsJsonObject; frozenSnapshot?: PublicationsJsonObject; validation: PublicationsJsonObject; reproductionRunId?: string; reproducedAt?: string; exportUri?: string; version: number; createdAt: string; updatedAt: string }
