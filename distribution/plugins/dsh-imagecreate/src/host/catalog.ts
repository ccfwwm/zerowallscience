/** Image routes shared by configuration and request resolution. */
import type { AiCloudAccountSnapshot, AiCloudManagedModel } from '@zerowall/dsh-plugin-ai-cloud/account-types'

/**
 * Collect image-capable routes once per complete provider/group/model/profile identity.
 * @param snapshot - Account catalog returned by AI Cloud.
 * @param includeStale - Retain unavailable routes for configuration display.
 * @returns Image routes with declared media sizes exposed as resolution choices.
 */
export function imageCatalog(snapshot: AiCloudAccountSnapshot, includeStale = false): AiCloudManagedModel[] {
  const all = [
    ...snapshot.models.filter(model => model.capability === 'image-generation'),
    ...(snapshot.mediaModels ?? []).filter(model => model.mediaType === 'image' && model.operations.some(operation => ['image', 'image_edit', 'gemini_image'].includes(operation)))
      .map(model => ({ ...model, resolutions: model.resolutions.length ? model.resolutions : model.sizes })),
  ]
  return [...new Map(all.filter(model => includeStale || !model.stale).map(model => [JSON.stringify([model.providerId, model.groupId, model.modelId, 'profileId' in model ? model.profileId ?? '' : '']), model])).values()]
}
