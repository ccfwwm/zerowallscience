/** Skill management wire data; instruction content is returned only by explicit detail reads. */
export interface ManagedSkill {
  id: string
  name: string
  description: string
  source: string
  provider: string
  kind: 'standalone' | 'plugin-instructions'
  ownerPackage?: string
  topic: string
  enabled: boolean
  /** Optional bundled instructions available for activation when the task needs them. */
  onDemand?: boolean
  effective: boolean
  removable: boolean
  path?: string
  license?: string
  requirements: string[]
}
/** One curated instruction bundle and its optional local dependency capability. */
export interface CatalogSkill {
  name: string
  path: string
  description: string
  topic: string
  core: boolean
  license: string
  capabilityId: string
  requirements: string[]
}
/** Result from a read-only import preview. */
export interface ImportPreview {
  id: string
  source: string
  commit?: string
  skills: { name: string; description: string; relativePath: string; conflict: boolean }[]
}
/** Management operations accept an optional current workspace, never an installation path. */
export interface SkillsRequest {
  action: 'list' | 'detail' | 'set-enabled' | 'set-topic' | 'preview' | 'install' | 'remove' | 'activate'
  cwd?: string
  id?: string
  name?: string
  enabled?: boolean
  topic?: string
  source?: string
  scope?: 'workspace' | 'global'
  replace?: boolean
}
/** JSON response used by the management Remote. */
export interface SkillsResponse {
  entries?: ManagedSkill[]
  complete?: boolean
  content?: string
  preview?: ImportPreview
  installed?: string[]
  status?: string
}
