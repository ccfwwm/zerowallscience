/**
 * File-review plugin, node half. Registers the response-format guidance that
 * lets the browser half recognize final-response file references. The browser
 * half ships via exports["./client"], discovered through the package.json
 * dsh.client declaration.
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { FileReviewService } from './file-review-service.ts'
import { registerFileLifecycleCapture } from './file-lifecycle-capture.ts'
import { registerPtcAdapter } from './ptc-adapter.ts'
import {
  DEFAULT_WORD_WRAP,
  DEFAULT_DIFF_LAYOUT,
  FILE_REVIEW_SETTINGS_NAMESPACE,
  type Config as ConfigShape,
} from './settings-contract.ts'

export type * from './change-types.ts'
export { FileReviewService, transformFile } from './file-review-service.ts'
export { DEFAULT_WORD_WRAP, FILE_REVIEW_SETTINGS_NAMESPACE } from './settings-contract.ts'

export type Config = ConfigShape

/** Plugin configuration and durable settings schema. */
export const Config: z<ConfigShape> = z.object({
  wordWrap: z.boolean().default(DEFAULT_WORD_WRAP),
  diffLayout: z.union([z.const('split'), z.const('unified')]).default(DEFAULT_DIFF_LAYOUT),
})

/** Services required for the model guidance paired with the browser renderer. */
export const inject = ['systemPrompt', 'tools']

/** Stable final-response guidance owned by the matching renderer. */
const FILE_REFERENCE_PROMPT =
  'When you successfully create or modify files, mention the primary outputs in your final response. ' +
  'To make those and any other changed-file references clickable in Web, format them as Markdown inline code using the exact file-tool path, or a basename when unique among the files changed in that turn.'

/**
 * Register model guidance for the file-reference renderer shipped by this package.
 * @param ctx - host context carrying the system-prompt registry.
 */
export function apply(ctx: Context, _config: ConfigShape = {}): void {
  // rc.2 derives the live settings namespace directly from the plugin Config.
  // Register only the automatic settings-page policy; persistence remains in
  // Harness' profile/config editor and is keyed by this plugin entry id.
  const settings = ctx.get('settings') as unknown as {
    configure?: (presentation: { auto?: boolean }) => unknown
    installSection?: (...args: unknown[]) => unknown
  } | undefined
  if (typeof settings?.configure === 'function') {
    settings.configure({ auto: true })
  } else if (typeof settings?.installSection === 'function') {
    // Compatibility for the pre-rc.2 SettingsProvider used by isolated tests
    // and replayed plugin hosts.
    settings.installSection(ctx, FILE_REVIEW_SETTINGS_NAMESPACE, Config, _config, {
      setSource: () => {},
      onChange: () => {},
    })
  }
  new FileReviewService(ctx)
  registerFileLifecycleCapture(ctx)
  registerPtcAdapter(ctx)
  ctx.systemPrompt.section({
    name: 'ui:file-review-references',
    order: 190,
    text: FILE_REFERENCE_PROMPT,
  })
}
