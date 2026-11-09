/** Own image defaults, idempotent legacy migration and account-driven initialization. */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@zerowall/dsh-plugin-environment'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { SecretBrokerClient } from '@zerowall/dsh-plugin-ai-cloud/secrets'
import type { AiCloudAccountSnapshot, AiCloudManagedModel } from '@zerowall/dsh-plugin-ai-cloud/account-types'
import { AiCloudClient } from '@zerowall/dsh-plugin-ai-cloud/account'
import { z } from 'zod'
import type { ImageModelSelection, ImageSettingsView } from '../shared/types.js'
import { imageCatalog } from './catalog.js'

export const selectionSchema = z.object({ providerId: z.string().trim().min(1), groupId: z.string().trim().min(1), modelId: z.string().trim().min(1), profileId: z.string().optional(), resolution: z.string().optional(), aspectRatio: z.string().optional(), imageSize: z.string().optional() })
const qualitySchema = z.enum(['auto', 'low', 'medium', 'high', 'xhigh', 'max'])
const stateSchema = z.object({ schema: z.literal(1), migrated: z.literal(true), origin: z.enum(['automatic', 'user']), selection: selectionSchema.optional(), pendingLegacy: z.object({ groupId: z.string(), modelId: z.string(), profileId: z.string(), resolution: z.string().optional(), aspectRatio: z.string().optional() }).optional(), quality: qualitySchema, legacyBackup: z.record(z.string(), z.unknown()).optional() })
type State = z.infer<typeof stateSchema>
export interface ImageSettingsConfig { home?: string; preferredGroupName?: string; preferredModelId?: string }

declare module '@deepseek-ai/cordis' { interface Context { zerowallImageSettings: ImageSettingsService } }

/** Serialized settings and migration; only explicit user writes freeze automatic defaults. */
export class ImageSettingsService extends TypertRemoteService {
  static inject = ['credentials', 'settings']
  private state!: State
  private readonly ready: Promise<void>
  private queue: Promise<void> = Promise.resolve()
  private readonly path: string
  private disposed = false
  private availability: ImageSettingsView['availability'] = 'pending'
  private account?: AiCloudAccountSnapshot

  constructor(private readonly host: Context, private readonly config: ImageSettingsConfig) {
    super(host, 'zerowallImageSettings')
    this.path = join(resolve(config.home ?? resolveDshHome()), 'zerowall', 'imagecreate', 'settings.json')
    this.ready = this.initialize()
    void this.ready.catch(error => host.logger.error(`Image settings initialization failed: ${String(error)}`))
    host.on('zerowall/account-updated', snapshot => this.updateAccount(snapshot))
    host.effect(() => async () => { this.disposed = true; await this.queue; await this.ready.catch(() => undefined) })
  }

  private async initialize(): Promise<void> {
    try { this.state = stateSchema.parse(JSON.parse(await readFile(this.path, 'utf8'))); return }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
    const legacy = { imageModel: await this.host.zerowallEnvironment.readImageModelSelection(), imageQuality: this.host.zerowallEnvironment.getImageQuality() }
    const parsed = z.object({ imageModel: z.unknown().optional(), imageQuality: qualitySchema.optional() }).passthrough().parse(legacy ?? {})
    const rawMedia = await new SecretBrokerClient(this.host.credentials).get('zerowall.ai-cloud.media-selections')
    const media: unknown = rawMedia ? JSON.parse(rawMedia) : {}
    const oldMedia = z.object({ image: z.object({ selection: z.object({ groupId: z.string(), modelId: z.string(), profileId: z.string() }), parameters: z.object({ size: z.string().optional(), resolution: z.string().optional(), aspect_ratio: z.string().optional(), quality: qualitySchema.optional() }).passthrough() }).optional() }).passthrough().parse(media).image
    let selection = selectionSchema.safeParse(parsed.imageModel).data
    const pendingLegacy = !selection && oldMedia ? { ...oldMedia.selection, resolution: oldMedia.parameters.resolution ?? oldMedia.parameters.size, aspectRatio: oldMedia.parameters.aspect_ratio } : undefined
    const state: State = { schema: 1, migrated: true, origin: selection || pendingLegacy ? 'user' : 'automatic', selection, pendingLegacy, quality: selection ? parsed.imageQuality ?? 'medium' : oldMedia?.parameters.quality ?? parsed.imageQuality ?? 'medium', legacyBackup: { environment: parsed, media } }
    await this.commit(state)
  }

  private async commit(next: State): Promise<void> {
    if (this.disposed) throw new Error('Image settings are shutting down.')
    await mkdir(resolve(this.path, '..'), { recursive: true })
    const temporary = `${this.path}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 })
    try { await rename(temporary, this.path) }
    catch (error) { await rm(temporary, { force: true }); throw error }
    this.state = next
  }

  private serialize(operation: () => Promise<void>): Promise<void> {
    const task = this.queue.then(async () => { await this.ready; if (this.disposed) throw new Error('Image settings are shutting down.'); await operation() })
    this.queue = task.catch(() => undefined)
    return task
  }

  /** Reconcile real catalog identities; a manually saved selection is never replaced. */
  updateAccount(snapshot: AiCloudAccountSnapshot): Promise<void> {
    return this.serialize(async () => {
      this.account = snapshot
      const models = this.models(snapshot)
      const selection = this.state.pendingLegacy
      if (selection) {
        const candidates = models.filter(model => model.groupId === selection.groupId && model.modelId === selection.modelId && (!selection.profileId || ('profileId' in model && model.profileId === selection.profileId)))
        if (candidates.length === 1) await this.commit({ ...this.state, pendingLegacy: undefined, selection: { ...selection, providerId: candidates[0]!.providerId } })
      }
      if (snapshot.status !== 'signedIn') { this.availability = 'signed-out'; return }
      if (this.state.origin === 'user') {
        this.availability = this.state.selection && models.some(model => this.sameModel(model, this.state.selection!)) ? 'ready' : 'missing'
        return
      }
      const matches = models.filter(model => model.groupName === this.config.preferredGroupName && model.modelId === this.config.preferredModelId)
      this.availability = matches.length === 1 ? 'ready' : matches.length > 1 ? 'ambiguous' : 'missing'
      if (matches.length !== 1 && this.state.selection) await this.commit({ ...this.state, selection: undefined })
      if (matches.length === 1) {
        const model = matches[0]!
        const next: ImageModelSelection = { providerId: model.providerId, groupId: model.groupId, modelId: model.modelId, ...('profileId' in model && typeof model.profileId === 'string' ? { profileId: model.profileId } : {}), ...(this.state.selection ? { resolution: this.state.selection.resolution, aspectRatio: this.state.selection.aspectRatio, imageSize: this.state.selection.imageSize } : {}) }
        if (JSON.stringify(next) !== JSON.stringify(this.state.selection)) await this.commit({ ...this.state, selection: next })
      }
    })
  }

  private catalogModels(snapshot: AiCloudAccountSnapshot): AiCloudManagedModel[] {
    return imageCatalog(snapshot, true)
  }
  private models(snapshot: AiCloudAccountSnapshot): AiCloudManagedModel[] {
    return imageCatalog(snapshot)
  }
  private sameModel(model: AiCloudManagedModel, selection: ImageModelSelection): boolean {
    return model.providerId === selection.providerId && model.groupId === selection.groupId && model.modelId === selection.modelId && (!selection.profileId || ('profileId' in model && model.profileId === selection.profileId))
  }

  /** Read current defaults without changing their user/automatic origin. */
  @Remote('get')
  async get(): Promise<ImageSettingsView> { await this.ready; await this.queue; return { selection: this.state.selection, quality: this.state.quality, origin: this.state.origin, availability: this.availability } }

  /** Validate and atomically save an explicit user's model and parameters. */
  @Remote('save')
  async save(input: { selection?: ImageModelSelection; quality: string }): Promise<ImageSettingsView> {
    const parsed = z.object({ selection: selectionSchema.optional(), quality: qualitySchema }).parse(input)
    await this.serialize(async () => { await this.commit({ ...this.state, ...parsed, selection: parsed.selection, pendingLegacy: undefined, origin: 'user' }); this.availability = parsed.selection && this.account && this.models(this.account).some(model => this.sameModel(model, parsed.selection!)) ? 'ready' : 'missing' })
    return this.get()
  }
  async readImageModelSelection(): Promise<ImageModelSelection | undefined> { return (await this.get()).selection }
  async getImageQuality(): Promise<ImageSettingsView['quality']> { return (await this.get()).quality }

  /** Read only image-capable catalog entries, including unavailable saved routes. */
  @Remote('catalog')
  async catalog(): Promise<AiCloudManagedModel[]> { return this.account ? this.catalogModels(this.account) : [] }

  /** Refresh the real account catalog and reconcile automatic defaults. */
  @Remote('refresh')
  async refresh(): Promise<void> { const snapshot = await new AiCloudClient({ secrets: new SecretBrokerClient(this.host.credentials) }).discoverModels(); await this.host.parallel('zerowall/account-updated', snapshot) }
}
