// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewUserMessage } from '../src/client/ReviewUserMessage.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function makeTranslate(dictionary: Record<string, string>) {
  return (key: string, params?: Record<string, string>) => {
    let value = dictionary[key] ?? key
    for (const [name, replacement] of Object.entries(params ?? {})) {
      value = value.replaceAll(`{${name}}`, replacement)
    }
    return value
  }
}

describe('review user-message attachments', () => {
  it('keeps a parsed durable file card beside user text and routes its actions', () => {
    const openAttachment = vi.fn()
    const openParsedAttachment = vi.fn()
    const copyAttachment = vi.fn()
    const attachment = {
      attachmentId: 'file-sha256:pdf-fixture',
      name: 'Upregulation of WDR6 drives hepatic SO.pdf',
      mediaType: 'application/pdf',
      bytes: 512_000,
      parser: 'pdfjs',
      status: 'parsed',
      preview: 'Upregulation of WDR6 drives hepatic SO',
      content: 'Complete parsed PDF body that is sent to the model.',
      textChars: 54_032,
      parseStatus: 'done',
      parseProgress: 100,
    }
    const props = {
      node: {
        data: {
          content: [
            { type: 'file', attachment },
            { type: 'text', text: '这是啥' },
          ],
          time: Date.now(),
        },
      },
      sessionId: 'session-fixture',
      renderMessageImages: vi.fn(() => null),
      openAttachment,
      openParsedAttachment,
      copyAttachment,
      cwd: '/Users/test/projects/example',
      t: (key: string) => (key === 'message.extraBlock' ? '附加内容块' : key),
      reviewT: makeTranslate(en),
    } as unknown as Parameters<typeof ReviewUserMessage>[0]
    const view = render(<ReviewUserMessage {...props} />)

    expect(view.getByText(attachment.name)).toBeTruthy()
    expect(view.getByText('这是啥')).toBeTruthy()
    expect(view.queryByText('附加内容块')).toBeNull()
    expect(view.queryByText(attachment.content)).toBeNull()

    fireEvent.click(view.getByTitle('预览附件'))
    fireEvent.click(view.getByRole('button', { name: `查看 ${attachment.name} 的解析结果` }))
    fireEvent.click(view.getByRole('button', { name: `复制附件 ${attachment.name}` }))
    expect(openAttachment).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(attachment))
    expect(openParsedAttachment).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(attachment))
    expect(copyAttachment).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(attachment))
  })
})
