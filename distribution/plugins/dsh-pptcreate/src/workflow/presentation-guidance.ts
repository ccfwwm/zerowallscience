import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Register the default presentation sequence in the logged model instructions.
 * @param ctx - Host services that own the prompt registration.
 */
export function installPresentationGuidance(ctx: Context): void {
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'zerowall:presentation-workflow',
    order: 450,
    text: 'For PPT, PowerPoint, PPTX or slide creation, load skill(name="ppt-maker") first. Default: generate full-page images, export the non-editable image PPTX, then OCR-reconstruct an independent project into an editable PPTX. Keep both files. Review representative reconstructions before converting the remaining pages; disclose raster regions. Follow explicit requests for native editable creation, image-only delivery or editing existing decks. Discover the exact presentation_* or ppt_* tools needed with tool_search; do not load all tool schemas.',
  }))
}
