// @vitest-environment jsdom

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageToolRow, imageToolMeta } from '../src/client/ImageToolView.js'

afterEach(() => cleanup())

const attachment = {
  attachmentId: `sha256:${'a'.repeat(64)}`,
  mediaType: 'image/png',
  bytes: 68,
  width: 8,
  height: 6,
  name: 'result.png',
}

function props(meta: unknown, overrides: Partial<ToolCallViewProps['block']> = {}): ToolCallViewProps {
  return {
    callId: 'call-1',
    toolName: 'edit_image',
    cwd: 'C:\\workspace',
    openFile: vi.fn(),
    sessionId: 'session-1',
    block: {
      kind: 'tool-result',
      seq: 4,
      time: 1,
      callId: 'call-1',
      call: { name: 'edit_image', argsRaw: JSON.stringify({ output_path: 'art/result.png' }) },
      callTime: 1,
      content: [{ type: 'text', text: 'Edited art/result.png.' }],
      isError: false,
      meta,
      callView: null,
      resultView: null,
      subCalls: [],
      ...overrides,
    },
  } as unknown as ToolCallViewProps
}

function conversation(load = vi.fn().mockResolvedValue('data:image/png;base64,iVBORw0KGgo=')): IConversation {
  return { resolveImage: load } as unknown as IConversation
}

describe('image tool view', () => {
  it('parses only durable PNG attachment metadata', () => {
    expect(imageToolMeta({ path: 'x.png', model: 'gpt-image-2', image: attachment })).toMatchObject({
      path: 'x.png', model: 'gpt-image-2', image: { width: 8, height: 6 },
    })
    expect(imageToolMeta({ path: 'x.png', model: 'gpt-image-2', image: { ...attachment, mediaType: 'image/jpeg' } })?.image).toBeUndefined()
  })

  it('shows the generated image without expansion and opens a lightbox that Escape closes', async () => {
    const load = vi.fn().mockResolvedValue('data:image/png;base64,iVBORw0KGgo=')
    render(<ImageToolRow {...props({ path: 'C:\\workspace\\art\\result.png', model: 'gpt-image-2', image: attachment })} conversation={conversation(load)} />)

    expect(screen.getByText('result.png')).toBeTruthy()
    expect(screen.getByText('gpt-image-2')).toBeTruthy()
    expect(screen.getByText('8 x 6')).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('img', { name: 'result.png' })).toBeTruthy())
    expect(load).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Open result.png' }))
    expect(screen.getByRole('dialog', { name: 'Image preview' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Image preview' })).toBeNull()
  })

  it('keeps a saved-file action and surfaces preview warnings or tool errors', () => {
    const openFile = vi.fn()
    const warningProps = props({ path: 'art/result.png', model: 'gpt-image-2', previewWarning: 'attachment unavailable' })
    warningProps.openFile = openFile
    const view = render(<ImageToolRow {...warningProps} conversation={conversation()} />)
    expect(screen.getByText('attachment unavailable')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open image file' }))
    expect(openFile).toHaveBeenCalledWith('art/result.png')

    view.rerender(<ImageToolRow {...props(undefined, { isError: true, content: [{ type: 'text', text: 'Image request failed.' }] })} conversation={conversation()} />)
    expect(screen.getByText('Image request failed.')).toBeTruthy()
  })
})
