import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { SecretBrokerClient } from '@zerowallscience/plugin-secrets'
import type { EnvironmentSettingsValue, EnvironmentVariableInfo, ImageGenerationQuality, ImageModelSelection } from '../shared/types.js'

export const name = 'zerowall-environment'
export const ENVIRONMENT_SETTINGS_NS = 'zerowall-environment' as SettingsNamespace
export const EnvironmentSettingsSchema: z<EnvironmentSettingsValue> = z.object({
  retiredVariablesRemoved: z.boolean().default(false),
  variables: z.array(z.object({ name: z.string() })).default([]),
  imageModel: z.object({
    providerId: z.string().default(''),
    groupId: z.string().default(''),
    modelId: z.string().default(''),
  }).default({ providerId: '', groupId: '', modelId: '' }),
  imageQuality: z.union(['auto', 'low', 'medium', 'high'] as const).default('medium'),
})

const VARIABLE_NAME = /^[A-Z_][A-Z0-9_]{0,127}$/u
const RESERVED = new Set(['NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE', 'PATH', 'PATHEXT', 'COMSPEC', 'DSH_HOME', 'ZEROWALL_USER_DATA_DIR'])
const KEY_PREFIX = 'zerowall.environment.var.'
// These are part of the TSG contract even when an older settings snapshot
// did not persist the variable names alongside the encrypted values.
const WELL_KNOWN_VARIABLES: string[] = []
const RETIRED_VARIABLES = ['TSG_PM_JSESSIONID', 'TSG_SESSIONID', 'TSG_SGUSER', 'TSG_TSGUSER', 'TSG_JSESSIONID', 'RESEARCH_SCIDB_SETTLE_MS', 'LITERATURE_OUTPUT_ROOT', 'LITERATURE_DISABLE_PAPER_DOWNLOAD', 'LITERATURE_DOWNLOAD_WORKERS', 'LITERATURE_MAX_PDF_BYTES', 'AUTHORIZED_ADAPTER_MODULE', 'AUTHORIZED_ADAPTER_ALLOWED_DOMAINS', 'ZEROWALL_PAPER_DOWNLOAD_ROOT'] as const

export function validateEnvironmentVariableName(name: string): string {
  const value = name.trim().toUpperCase()
  if (!VARIABLE_NAME.test(value) || RESERVED.has(value)) throw new Error(`环境变量名无效或被保留：${name}`)
  return value
}

function credentialKey(name: string): string { return `${KEY_PREFIX}${name.toLowerCase()}` }

declare module '@deepseek-ai/cordis' {
  interface Context { zerowallEnvironment: ZeroWallEnvironmentService }
}

export class ZeroWallEnvironmentService extends TypertRemoteService {
  static inject = ['settings']
  private readonly secrets = new SecretBrokerClient()
  private readonly scope
  private readonly hydration: Promise<void>

  constructor(ctx: Context) {
    super(ctx, 'zerowallEnvironment')
    this.scope = ctx.settings.register(ENVIRONMENT_SETTINGS_NS, EnvironmentSettingsSchema)
    // Keep credential restoration observable.  A tool can be invoked
    // immediately after Host startup, so fire-and-forget hydration otherwise
    // races the first TSG/download request.
    this.hydration = this.removeRetiredVariables().then(() => this.hydrate())
  }

  getImageModelSelection(): ImageModelSelection | undefined {
    const selection = this.scope.get().imageModel
    return selection.providerId && selection.groupId && selection.modelId ? selection : undefined
  }

  @Remote('getImageModelSelection')
  readImageModelSelection(): Promise<ImageModelSelection | undefined> { return Promise.resolve(this.getImageModelSelection()) }

  @Remote('getImageQuality')
  getImageQuality(): ImageGenerationQuality { return this.scope.get().imageQuality }

  @Remote('setImageQuality')
  async setImageQuality(quality: ImageGenerationQuality): Promise<void> {
    if (!['auto', 'low', 'medium', 'high'].includes(quality)) throw new Error('生图质量必须是 auto、low、medium 或 high。')
    await this.scope.replace({ ...this.scope.get(), imageQuality: quality })
  }

  @Remote('setImageModelSelection')
  async setImageModelSelection(selection: ImageModelSelection): Promise<void> {
    const value = {
      providerId: String(selection.providerId ?? '').trim(),
      groupId: String(selection.groupId ?? '').trim(),
      modelId: String(selection.modelId ?? '').trim(),
    }
    const empty = !value.providerId && !value.groupId && !value.modelId
    const partial = !empty && (!value.providerId || !value.groupId || !value.modelId)
    if (partial) throw new Error('生图模型配置不完整。')
    await this.scope.replace({ ...this.scope.get(), imageModel: value })
  }

  @Remote('listVariables')
  async listVariables(): Promise<EnvironmentVariableInfo[]> {
    await this.hydration
    const configuredNames = WELL_KNOWN_VARIABLES.filter(name => Boolean(process.env[name]?.trim()))
    const names = [...new Set([...this.scope.get().variables.map(row => row.name), ...configuredNames])]
    const values = await Promise.all(names.map(async name => ({
      name,
      // process.env is also a supported source: packaged launches can inject
      // credentials before the settings snapshot is available.
      configured: Boolean(process.env[name]?.trim()) || (await this.secrets.get(credentialKey(name))) !== undefined,
    })))
    return values
  }

  @Remote('setVariable')
  async setVariable(name: string, value: string): Promise<EnvironmentVariableInfo[]> {
    await this.hydration
    const key = validateEnvironmentVariableName(name)
    if (value.length === 0) throw new Error('环境变量值不能为空。')
    await this.secrets.set(credentialKey(key), value)
    process.env[key] = value
    const current = this.scope.get().variables.filter(row => row.name !== key)
    await this.scope.replace({ ...this.scope.get(), variables: [...current, { name: key }].sort((a, b) => a.name.localeCompare(b.name)) })
    return await this.listVariables()
  }

  @Remote('readVariable')
  async readVariable(name: string): Promise<string | undefined> {
    await this.hydration
    const key = validateEnvironmentVariableName(name)
    const value = await this.secrets.get(credentialKey(key))
    return value ?? process.env[key]
  }

  @Remote('deleteVariable')
  async deleteVariable(name: string): Promise<EnvironmentVariableInfo[]> {
    await this.hydration
    const key = validateEnvironmentVariableName(name)
    await this.secrets.delete(credentialKey(key))
    delete process.env[key]
    await this.scope.replace({ ...this.scope.get(), variables: this.scope.get().variables.filter(row => row.name !== key) })
    return await this.listVariables()
  }

  private async hydrate(): Promise<void> {
    const names = [...new Set([...this.scope.get().variables.map(row => row.name), ...WELL_KNOWN_VARIABLES])]
    for (const name of names) {
      try {
        const value = await this.secrets.get(credentialKey(name))
        if (value !== undefined) process.env[name] = value
      } catch {
        // A broken OS credential entry is ignored; the UI can replace it.
      }
    }
  }

  private async removeRetiredVariables(): Promise<void> {
    if (this.scope.get().retiredVariablesRemoved) return
    for (const name of RETIRED_VARIABLES) {
      try {
        await this.secrets.delete(credentialKey(name))
        delete process.env[name]
      } catch { return } // Retry migration on next startup if the vault is unavailable.
    }
    const retired = new Set<string>(RETIRED_VARIABLES)
    const variables = this.scope.get().variables.filter(row => !retired.has(row.name))
    await this.scope.replace({ ...this.scope.get(), variables, retiredVariablesRemoved: true })
  }
}

export function apply(ctx: Context): void { ctx.plugin(ZeroWallEnvironmentService) }
export default { apply }
