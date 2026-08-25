import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { registerImageToolViews } from './ImageToolView.tsx'

export const inject = ['conversation', 'slots']
export function apply(ctx: ClientContext): void {
  registerImageToolViews(ctx)
}
