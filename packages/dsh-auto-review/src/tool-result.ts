/**
 * Project a tool result from both the rc.2 first-class tool-role message and
 * the pre-rc.2 user-role wrapper kept in historical session fixtures.
 */
export interface ToolResultView {
  readonly callId: string
  readonly text: string
  readonly isError: boolean
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map(item => recordOf(item))
    .filter((item): item is Record<string, unknown> => item?.type === 'text' && typeof item.text === 'string')
    .map(item => item.text as string)
    .join('\n')
}

export function projectToolResult(message: unknown): ToolResultView | undefined {
  const record = recordOf(message)
  if (record === undefined || !Array.isArray(record.content)) return undefined

  // rc.2: tool/result carries a role=tool message with toolCallId/content.
  if (record.role === 'tool' && typeof record.toolCallId === 'string') {
    return {
      callId: record.toolCallId,
      text: textOf(record.content),
      isError: record.isError === true,
    }
  }

  // Legacy sessions: role=user and one nested tool-result content block.
  const block = record.content[0]
  const nested = recordOf(block)
  if (nested?.type !== 'tool-result' || typeof nested.toolCallId !== 'string') return undefined
  return {
    callId: nested.toolCallId,
    text: textOf(nested.content),
    isError: nested.isError === true,
  }
}
