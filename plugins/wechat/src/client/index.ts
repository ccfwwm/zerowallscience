import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { apply as applyWechatFooter } from './view.js'

export * from './view.js'

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  applyWechatFooter(ctx)
}
