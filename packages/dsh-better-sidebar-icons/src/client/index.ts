/**
 * dsh-better-sidebar-icons — client half.
 *
 * Overlays the dsh-better-sidebar explorer rows (and editor-tab icons) with
 * the vscode-icons theme images served by the host half's
 * /dsh-better-sidebar-icons/icons route. Pure DOM work, dependency-free at
 * runtime; everything is restored on fiber dispose.
 */
import type { Context } from '@deepseek-ai/cordis'
import { createIconOverlay } from './override.ts'

export function apply(ctx: Context): void {
  ctx.effect(
    () => {
      const overlay = createIconOverlay()
      overlay.start()
      return () => overlay.dispose()
    },
    'dsh-better-sidebar-icons: explorer icon overlay',
  )
}
