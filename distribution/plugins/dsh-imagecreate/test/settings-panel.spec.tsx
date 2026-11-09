// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ImageSettingsPanel, type ImageSettingsFace } from '../src/client/settings.js'
import { en } from '../src/client/settings-locales.js'
import type { ImageSettingsView } from '../src/shared/types.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>, Toast: () => null }))
afterEach(() => { cleanup(); vi.useRealTimers() })
const selection = { providerId: 'real-provider', groupId: 'real-group', modelId: 'gemini-nano-banana-2.1' }
const settings: ImageSettingsView = { selection, quality: 'medium', origin: 'automatic', availability: 'ready' }
const model = { ...selection, groupName: '生图分组-香蕉生图', capability: 'image-generation' as const, baseUrl: 'https://example.test', imageProtocol: 'gemini' as const, imageSizes: ['1K', '4K'], aspectRatios: ['16:9'] }

it('saves image parameters only through the image service and reports success', async () => {
  const save = vi.fn<ImageSettingsFace['save']>(async input => ({ ...settings, ...input, origin: 'user' as const }))
  const notify = vi.fn()
  render(<ImageSettingsPanel load={async () => ({ settings, models: [model] })} save={save} refresh={async () => {}} notify={notify} t={key => en[key]} />)
  await screen.findByText(en.automatic)
  fireEvent.change(screen.getByLabelText(en.imageSize), { target: { value: '4K' } })
  fireEvent.click(screen.getByRole('button', { name: en.save }))
  await waitFor(() => expect(save).toHaveBeenCalledWith({ selection: { ...selection, imageSize: '4K', resolution: '' }, quality: 'medium' }))
  expect(notify).toHaveBeenCalledWith(true)
  expect(screen.queryByText('Environment')).toBeNull()
})

it('keeps failed edits available for retry without displaying them as saved', async () => {
  const save = vi.fn(async () => { throw new Error('write failed') }), notify = vi.fn()
  render(<ImageSettingsPanel load={async () => ({ settings, models: [model] })} save={save} refresh={async () => {}} notify={notify} t={key => en[key]} />)
  await screen.findByText(en.automatic)
  fireEvent.click(screen.getByRole('button', { name: en.save }))
  await screen.findByRole('alert')
  expect(notify).toHaveBeenCalledWith(false)
  expect(screen.getByLabelText(en.model)).toHaveProperty('value', JSON.stringify([selection.providerId, selection.groupId, selection.modelId, '']))
})

it('shows automatic initialization after account login without remounting the settings page', async () => {
  vi.useFakeTimers()
  let current: ImageSettingsView = { quality: 'medium', origin: 'automatic', availability: 'signed-out' }
  const load = vi.fn(async () => ({ settings: current, models: current.selection ? [model] : [] }))
  await act(async () => { render(<ImageSettingsPanel load={load} save={async () => settings} refresh={async () => {}} notify={() => {}} t={key => en[key]} />) })
  expect(screen.getByText(en.signedOut)).toBeTruthy()
  current = settings
  await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  expect(screen.getByText(en.automatic)).toBeTruthy()
  expect(screen.getByLabelText(en.model)).toHaveProperty('value', JSON.stringify([selection.providerId, selection.groupId, selection.modelId, '']))
})

it('preserves unsaved parameters across polling and an explicit catalog refresh', async () => {
  vi.useFakeTimers()
  const load = vi.fn(async () => ({ settings, models: [model] }))
  const save = vi.fn<ImageSettingsFace['save']>(async input => ({ ...settings, ...input, origin: 'user' as const }))
  await act(async () => { render(<ImageSettingsPanel load={load} save={save} refresh={async () => {}} notify={() => {}} t={key => en[key]} />) })
  fireEvent.change(screen.getByLabelText(en.imageSize), { target: { value: '4K' } })
  await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  expect(screen.getByLabelText(en.imageSize)).toHaveProperty('value', '4K')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.refresh })) })
  expect(screen.getByLabelText(en.imageSize)).toHaveProperty('value', '4K')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.save })) })
  expect(save).toHaveBeenCalledWith({ selection: { ...selection, imageSize: '4K', resolution: '' }, quality: 'medium' })
  expect(screen.getByText(en.userChoice)).toBeTruthy()
})
