import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { CloudImageData, CloudImageModel, CloudImageRequest, CloudImageTask } from '../shared/images.js'
import type { MediaTask } from '../shared/media.js'
import type {} from './index.js'

declare module '@deepseek-ai/cordis' {
  interface Context { zerowallImages: ZeroWallImages }
}

function imageTask(task: MediaTask): CloudImageTask {
  return { requestId: task.requestId, status: task.status, ...(task.error ? { error: task.error } : {}), artifacts: task.artifacts.map(({ key, mediaType, sha256 }) => ({ key, mediaType, ...(sha256 ? { sha256 } : {}) })) }
}

/** Image calls use the existing durable media service and Host credential store. */
export class ZeroWallImages extends TypertRemoteService {
  static inject = ['zerowallMedia']
  constructor(private readonly runtime: Context) { super(runtime, 'zerowallImages') }

  /** List currently available image generation routes without credentials. */
  @Remote async models(): Promise<CloudImageModel[]> {
    const catalog = await this.runtime.zerowallMedia.catalog(true)
    if (catalog.status !== 'succeeded') throw new Error(catalog.error ?? 'IMAGE_CATALOG_UNAVAILABLE')
    return catalog.models.filter(model => model.mediaType === 'image' && model.operations.some(operation => operation === 'image' || operation === 'gemini_image') && !model.stale)
      .map(({ groupId, groupName, profileId, modelId, sizes, qualities, operations }) => ({ groupId, groupName, profileId, modelId, sizes, qualities, operation: operations.includes('gemini_image') ? 'gemini_image' : 'image' }))
  }

  /** Submit one paid image request; reuse its requestId to recover an uncertain result. */
  @Remote async generate(input: CloudImageRequest): Promise<CloudImageTask> {
    const task = await this.runtime.zerowallMedia.submit({ requestId: input.requestId, groupId: input.groupId, profileId: input.profileId, modelId: input.modelId, operation: input.operation, prompt: input.prompt, parameters: { n: 1, ...(input.size ? { size: input.size } : {}), ...(input.quality ? { quality: input.quality } : {}) } })
    return imageTask(task)
  }

  /** Read a persisted task without creating another paid request. */
  @Remote async query(requestId: string): Promise<CloudImageTask> { return imageTask(await this.runtime.zerowallMedia.query(requestId)) }

  /** Read a bounded image for preview and download after Host digest validation. */
  @Remote async imageData(requestId: string, artifactKey: string): Promise<CloudImageData> {
    const artifact = await this.runtime.zerowallMedia.download(requestId, artifactKey)
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(artifact.mediaType) || artifact.bytes.byteLength > 8 * 1024 * 1024) throw new Error('IMAGE_PREVIEW_UNSUPPORTED')
    return { base64: Buffer.from(artifact.bytes).toString('base64'), mediaType: artifact.mediaType, sha256: artifact.sha256 }
  }
}
