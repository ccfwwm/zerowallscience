// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { en, MediaModelSettings, type MediaSettingsApi } from '../src/client/model-settings.js'
afterEach(cleanup)
const t = (key: keyof typeof en) => en[key]
function fixture() {
  const choices = { image: { selection: { groupId: '1', modelId: 'keep', profileId: 'p', operation: 'image' }, parameters: { quality: 'high' } }, video: { selection: { groupId: '2', modelId: 'video', profileId: 'v', operation: 'video' }, parameters: { duration: 5 } } }
  const api: MediaSettingsApi = { load: vi.fn(async () => ({ models: [], choices })), save: vi.fn(async () => {}) }
  return { api, choices }
}
it('reads defaults without saving or removing an unavailable model', async () => {
  const { api } = fixture()
  render(<MediaModelSettings api={api} t={t} />)
  await screen.findByText('video · Saved model unavailable')
  expect(api.load).toHaveBeenCalledOnce()
  expect(api.save).not.toHaveBeenCalled()
})
it('rejects invalid JSON and saves explicit edits while preserving other categories', async () => {
  const { api, choices } = fixture()
  render(<MediaModelSettings api={api} t={t} />)
  const input = await screen.findByLabelText('Model parameters (JSON) · Video')
  fireEvent.change(input, { target: { value: '[]' } })
  fireEvent.click(screen.getByRole('button', { name: en.save }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', en.invalid)
  expect(api.save).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: '{"duration":10}' } })
  fireEvent.click(screen.getByRole('button', { name: en.save }))
  await screen.findByText(en.saved)
  expect(api.save).toHaveBeenCalledWith({ ...choices, video: { ...choices.video, parameters: { duration: 10 } } })
})
it('shows load failure and retries without writing', async () => {
  const { api } = fixture()
  vi.mocked(api.load).mockRejectedValueOnce(new Error('offline'))
  render(<MediaModelSettings api={api} t={t} />)
  await screen.findByText(en.loadFailed)
  fireEvent.click(screen.getByRole('button', { name: en.retry }))
  await waitFor(() => expect(screen.getByRole('button', { name: en.save })).toBeTruthy())
  expect(api.load).toHaveBeenCalledTimes(2)
  expect(api.save).not.toHaveBeenCalled()
})
