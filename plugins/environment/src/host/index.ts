import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { SecretBrokerClient } from '@zerowallscience/plugin-secrets'
import type { EnvironmentSettingsValue, EnvironmentVariableInfo, ImageModelSelection } from '../shared/types.js'

export const name = 'zerowall-environment'
export const ENVIRONMENT_SETTINGS_NS = settingsNamespace('zerowall-environment')
export const EnvironmentSettingsSchema: z<EnvironmentSettingsValue> = z.object({
  variables: z.array(z.object({ name: z.string() })).default([]),
  imageModel: z.object({
    providerId: z.string().default(''),
    groupId: z.string().default(''),
    modelId: z.string().default(''),
  }).default({ providerId: '', groupId: '', modelId: '' }),
})

const VARIABLE_NAME = /^[A-Z_][A-Z0-9_]{0,127}$/u
const RESERVED = new Set(['NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE', 'PATH', 'PATHEXT', 'COMSPEC', 'DSH_HOME', 'ZEROWALL_USER_DATA_DIR'])
const KEY_PREFIX = 'zerowall.environment.var.'

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

  constructor(ctx: Context) {
    super(ctx, 'zerowallEnvironment')
    this.scope = ctx.settings.register(ENVIRONMENT_SETTINGS_NS, EnvironmentSettingsSchema)
    void this.hydrate()
  }

  getImageModelSelection(): ImageModelSelection | undefined {
    const selection = this.scope.get().imageModel
    return selection.providerId && selection.groupId && selection.modelId ? selection : undefined
  }

  @Remote('getImageModelSelection')
  readImageModelSelection(): Promise<ImageModelSelection | undefined> { return Promise.resolve(this.getImageModelSelection()) }

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
    const rows = this.scope.get().variables
    const values = await Promise.all(rows.map(async ({ name }) => ({ name, configured: (await this.secrets.get(credentialKey(name))) !== undefined })))
    return values
  }

  @Remote('setVariable')
  async setVariable(name: string, value: string): Promise<EnvironmentVariableInfo[]> {
    const key = validateEnvironmentVariableName(name)
    if (value.length === 0) throw new Error('环境变量值不能为空。')
    await this.secrets.set(credentialKey(key), value)
    process.env[key] = value
    const current = this.scope.get().variables.filter(row => row.name !== key)
    await this.scope.replace({ ...this.scope.get(), variables: [...current, { name: key }].sort((a, b) => a.name.localeCompare(b.name)) })
    return await this.listVariables()
  }

  @Remote('deleteVariable')
  async deleteVariable(name: string): Promise<EnvironmentVariableInfo[]> {
    const key = validateEnvironmentVariableName(name)
    await this.secrets.delete(credentialKey(key))
    delete process.env[key]
    await this.scope.replace({ ...this.scope.get(), variables: this.scope.get().variables.filter(row => row.name !== key) })
    return await this.listVariables()
  }

  private async hydrate(): Promise<void> {
    for (const { name } of this.scope.get().variables) {
      try {
        const value = await this.secrets.get(credentialKey(name))
        if (value !== undefined) process.env[name] = value
      } catch {
        // A broken OS credential entry is ignored; the UI can replace it.
      }
    }
  }
}

export function apply(ctx: Context): void { ctx.plugin(ZeroWallEnvironmentService) }
export default { apply }
