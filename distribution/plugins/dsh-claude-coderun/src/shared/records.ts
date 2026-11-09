/** Validate plugin records retained by Session migration and restore. */
import { z } from 'zod'
type RecordEvent = { type: string; data: unknown; ignorable?: true }

const cursor = z.object({ turn: z.number().int().nonnegative(), step: z.number().int().nonnegative() })
const permission = z.object({ mode: z.enum(['default', 'dontAsk', 'acceptEdits', 'auto', 'plan', 'bypassPermissions']) })
const transcript = cursor.extend({
  renderer: z.enum(['plugin', 'native']), running: z.boolean(),
  activity: z.array(z.object({
    index: z.number().int().nonnegative(), kind: z.enum(['text', 'reasoning', 'tool-call']),
    text: z.string(), ended: z.boolean(), id: z.string().optional(), name: z.string().optional(),
    result: z.string().optional(), failed: z.boolean().optional(), answer: z.boolean().optional(),
  })),
})

/** Read a valid Claude turn marker, including records renamed by the V3 migration. */
export function readClaudeTurn(event: RecordEvent) {
  if (String(event.type) !== 'plugin:zerowall-claude/turn' || event.ignorable !== true) return undefined
  const parsed = cursor.safeParse(event.data)
  return parsed.success ? parsed.data : undefined
}

/** Read a saved permission choice without trusting restored JSON. */
export function readClaudePermission(event: RecordEvent) {
  if (String(event.type) !== 'plugin:zerowall-claude/permission' || event.ignorable !== true) return undefined
  const parsed = permission.safeParse(event.data)
  return parsed.success ? parsed.data : undefined
}

/** Read a completed transcript without trusting restored JSON. */
export function readClaudeTranscript(event: RecordEvent) {
  if (String(event.type) !== 'plugin:zerowall-claude/transcript' || event.ignorable !== true) return undefined
  const parsed = transcript.safeParse(event.data)
  return parsed.success ? parsed.data : undefined
}
