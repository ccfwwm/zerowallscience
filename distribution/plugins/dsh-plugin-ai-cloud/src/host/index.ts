import type { Context } from '@deepseek-ai/cordis'
import * as account from '../account/host/index.js'
import * as cloud from '../cloud/host/index.js'
import { ZeroWallImages } from '../cloud/host/images.js'
export const name = 'zerowall-ai-cloud'
export const inject = ['credentials', 'llm']
/** Compose the account provider before the managed inference service. */
export function apply(ctx: Context): void {
  ctx.plugin(account)
  ctx.plugin(cloud)
  ctx.plugin(ZeroWallImages)
}
export { AiCloudClient, ZeroWallAccountService } from '../account/host/index.js'
export type { AccountSecretStore } from '../account/host/index.js'
export { ZeroWallImages } from '../cloud/host/images.js'
export { AiCloudMediaService, downloadImageBytes, normalizeGeminiImageSize, mediaTarget, publicReferenceURL, normalizeMediaReferences } from '../cloud/host/index.js'
export { resolveImageProtocol, uniqueMediaModels } from '../account/shared/types.js'
export type { ZeroWallMedia, MediaRequest, MediaTask, MediaSelection, ZeroWallMediaJobs } from '../cloud/shared/media.js'
