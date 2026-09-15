// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ReviewUserMessage } from '../src/client/ReviewUserMessage.tsx'

afterEach(cleanup)
it('renders an uploaded PDF as a file card while retaining parser text outside the visible bubble', () => {
  const file = { attachmentId: 'sha256:abc', name: 'paper.pdf', bytes: 1024, mediaType: 'application/pdf', parser: 'mineru', content: 'Full parser artifact', preview: 'Full parser artifact' }
  const openAttachment = vi.fn()
  const props = { node: { data: { content: [{type:'file', attachment:file}, {type:'text', text:'Read this paper'}], time: 1 } }, sessionId:'session', renderMessageImages: () => null, openAttachment, openParsedAttachment: vi.fn(), copyAttachment: vi.fn(), t: (key:string) => key, reviewT: (key:string) => key } as unknown as Parameters<typeof ReviewUserMessage>[0]
  const view = render(<ReviewUserMessage {...props} />)
  expect(view.getByText('paper.pdf')).toBeTruthy()
  expect(view.queryByText('Full parser artifact')).toBeNull()
  expect(view.queryByText('message.extraBlock')).toBeNull()
  fireEvent.click(view.getByTitle('attachment.preview'))
  expect(openAttachment).toHaveBeenCalledWith(expect.objectContaining(file))
})

it.each([true, false])('reports the actual attachment clipboard result: %s', async (success) => {
  const file = { attachmentId: 'sha256:abc', name: 'paper.pdf', bytes: 1024, mediaType: 'application/pdf' }
  const copy = vi.fn().mockResolvedValue(success)
  const parsed = vi.fn()
  const props = { node: { data: { content: [{ type: 'file', attachment: file }], time: 1 } }, sessionId: 'session', renderMessageImages: () => null, copyAttachment: copy, openParsedAttachment: parsed, t: (key: string) => key, reviewT: (key: string) => key } as unknown as Parameters<typeof ReviewUserMessage>[0]
  const view = render(<ReviewUserMessage {...props} />)
  fireEvent.click(view.getByRole('button', { name: 'attachment.parsed' }))
  expect(parsed).toHaveBeenCalledWith(expect.objectContaining(file))
  fireEvent.click(view.getByRole('button', { name: 'attachment.copy' }))
  await view.findByRole('button', { name: success ? 'copied' : 'attachment.copyFailed' })
  expect(copy).toHaveBeenCalledWith(expect.objectContaining(file))
})
