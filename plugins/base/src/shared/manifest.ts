export type ZeroWallProfile = 'development' | 'preview' | 'stable'

export interface ZeroWallPluginManifest {
  name: string
  version: string
  dsh: { min: string; max?: string }
  host?: string
  client?: string
  requiredServices: string[]
  optionalServices: string[]
  capabilities: string[]
  permissions: string[]
  network: boolean
  files: boolean
  credentials: boolean
  approvals: boolean
  profiles: ZeroWallProfile[]
  migrationVersion: number
}

export interface CredentialStore {
  get(namespace: string, key: string): Promise<string | undefined>
  set(namespace: string, key: string, value: string): Promise<void>
  delete(namespace: string, key: string): Promise<void>
}
