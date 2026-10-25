// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClaudeTranscriptNode, claudeTranscriptDefinition } from '../src/client/ClaudeTranscript.js'
import type { ClaudeTranscript } from '../src/shared/types.js'

afterEach(cleanup)

describe('Claude plugin transcript', () => {
  it('shows streaming prose, thinking, tool input and tool result, then yields the final answer to the native surface', async () => {
    const transcript: ClaudeTranscript = { turn: 1, step: 2, renderer: 'plugin', running: true, activity: [
      { index: 0, kind: 'text', text: 'Inspecting the project now.', ended: false },
      { index: 1, kind: 'reasoning', text: 'I will inspect the file first.', ended: false },
      { index: 2, kind: 'tool-call', text: '{"file_path":"README.md"}', id: 'read-1', name: 'Read', ended: true, result: 'File contents read.' },
      { index: 3, kind: 'text', text: 'Final answer belongs to the main message.', ended: true, answer: true },
    ] }
    const readTranscript = vi.fn(async () => transcript)
    render(<ClaudeTranscriptNode {...({ node: { data: { turn: 1, step: 2 } }, readTranscript } as never)} />)
    await screen.findByText('Inspecting the project now.')
    expect(screen.getByText('I will inspect the file first.')).toBeTruthy()
    expect(screen.getByText('{"file_path":"README.md"}')).toBeTruthy()
    expect(screen.getByText('File contents read.')).toBeTruthy()
    expect(screen.queryByText('Final answer belongs to the main message.')).toBeNull()
    transcript.running = false
    await waitFor(() => expect(readTranscript.mock.calls.length).toBeGreaterThan(1))
  })

  it('shows the live answer before completion, then hides only its native final copy', async () => {
    let transcript: ClaudeTranscript = { turn: 1, step: 1, renderer: 'plugin', running: true,
      activity: [{ index: 0, kind: 'text', text: 'The answer is streaming now.', ended: false }] }
    const readTranscript = vi.fn(async () => transcript)
    render(<ClaudeTranscriptNode {...({ node: { data: { turn: 1, step: 1 } }, readTranscript } as never)} />)
    await screen.findByText('The answer is streaming now.')
    transcript = { ...transcript, running: false, activity: [{ ...transcript.activity[0]!, ended: true, answer: true }] }
    await waitFor(() => expect(screen.queryByText('The answer is streaming now.')).toBeNull())
  })

  it('does not render a second copy of native-rendered turns', async () => {
    const readTranscript = vi.fn(async () => ({ turn: 1, step: 1, renderer: 'native', running: false, activity: [] } as ClaudeTranscript))
    const { container } = render(<ClaudeTranscriptNode {...({ node: { data: { turn: 1, step: 1 } }, readTranscript } as never)} />)
    await waitFor(() => expect(readTranscript).toHaveBeenCalledWith(1, 1))
    expect(container.innerHTML).toBe('')
  })

  it('matches only the Claude marker and preserves its step coordinates', () => {
    const match = claudeTranscriptDefinition.match as (event: unknown) => unknown
    expect(match({ type: 'zerowall-claude/turn', data: { turn: 7, step: 3 } })).toEqual({ id: '7:3', role: 'start' })
    expect(match({ type: 'step/start', data: { turn: 7, step: 3 } })).toBeNull()
  })
})
