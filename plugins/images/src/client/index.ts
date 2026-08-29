import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { registerImageToolViews } from './ImageToolView.tsx'

export const inject = ['conversation', 'slots']
export function apply(ctx: ClientContext): void {
  registerImageToolViews(ctx)
}
