import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { apply as applyWechatFooter } from './view.js'

export * from './view.js'

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  applyWechatFooter(ctx)
}
