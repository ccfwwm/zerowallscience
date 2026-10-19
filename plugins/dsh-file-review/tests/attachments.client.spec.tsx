// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { UserMessageNodeView } from '../../../deepseek-harness/packages/client/ui-chat/src/client/chat/MessageItem.tsx'
import { reviewCommentsTextRule } from '../src/client/ReviewCommentsText.tsx'

// The Host owns the message renderer; File Review contributes a text rule.
// Its projection must preserve shared attachment content and action scope.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ JsonBlock: () => null, StateDot: () => null, TextShimmer: () => null }))
vi.mock('../../../deepseek-harness/packages/client/ui-chat/src/client/chat/CompactionItem.tsx', () => ({ CompactionItem: () => null }))
vi.mock('../../../deepseek-harness/packages/client/ui-chat/src/client/chat/ContextInjectionRow.tsx', () => ({ ContextInjectionRow: () => null }))
vi.mock('../../../deepseek-harness/packages/client/ui-chat/src/client/chat/MessageIconActions.tsx', () => ({ MessageIconActions: () => null }))
afterEach(cleanup)

const file = { attachmentId: `sha256:${'a'.repeat(64)}`, name: 'paper.pdf', bytes: 1024, mediaType: 'application/pdf' }

function renderMessage(text: string) {
  const slot = vi.fn(() => null)
  const props = {
    node: { data: { content: [{ type: 'text', text }, { type: 'file', attachment: file }], time: 1 } },
    sessionId: 'session', cwd: 'C:/workspace', renderFactorySlot: slot,
    loadImage: vi.fn(), t: (key: string) => key,
  } as unknown as Parameters<typeof UserMessageNodeView>[0]
  render(<UserMessageNodeView {...props} />)
  expect(slot).toHaveBeenCalledWith('conversation.chat.user.content', expect.objectContaining({
    interactive: true,
    fileActionScope: { sessionId: 'session', cwd: 'C:/workspace' },
    content: { text, attachments: [{ type: 'file', file }], extraBlocks: [] },
  }))
}

it('passes session and workspace to shared attachment content in ordinary messages', () => {
  renderMessage('Read this paper')
})

it('preserves attachment actions when the plugin projects review comments as a text node', () => {
  const envelope = '<file_review_comments><file path="a.md"><comment kind="add" old_line="" new_line="1"><feedback>Keep this</feedback></comment></file></file_review_comments>'
  const text = envelope + '\n\nPlease review.'
  const projected = reviewCommentsTextRule.match(text, 0, { read: () => undefined })
  expect(projected).toMatchObject({ id: 'file-review-comments', start: 0, end: envelope.length, data: { comments: [{ path: 'a.md', body: 'Keep this' }] } })
  expect(text.slice(envelope.length + 2)).toBe('Please review.')
  renderMessage(text)
})
