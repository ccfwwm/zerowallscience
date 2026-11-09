// @vitest-environment jsdom
/** Python settings are owned by the Python plugin and share its localized actions. */
import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { PythonEnvironmentPanel } from '../../dsh-plugin-python/src/client/PythonEnvironmentPanel.js'
import { en, zh } from '../../dsh-plugin-python/src/client/locales.js'

afterEach(cleanup)
it.each([en, zh])('uses the Python owner for inventory, uv and confirmed dependency plans', async dictionary => {
  const request = vi.fn(async (input: { action: string }) => {
    if (input.action === 'status') return { status: { phase: 'ready' }, mirrorUrl: 'https://pypi.org/simple' }
    if (input.action === 'list_packages') return { inventory: { ready: true, uvVersion: 'uv 0.9.0', version: '3.12.14', packages: [{ name: 'pandas', version: '2.3.0' }] } }
    if (input.action === 'preview_sync') return { plan: { planId: 'confirmed', changes: [{ name: 'requests', to: 'requests==2.34.2' }] } }
    return {}
  })
  render(<PythonEnvironmentPanel api={{ pythonEnvironment: request as never }} t={key => dictionary[key]} />)
  expect(await screen.findByText('uv 0.9.0')).toBeTruthy()
  expect(screen.getByText('pandas')).toBeTruthy()
  expect(request.mock.calls.every(([input]) => ['status', 'list_packages'].includes(input.action))).toBe(true)
  fireEvent.change(screen.getByLabelText(dictionary.spec), { target: { value: 'requests==2.34.2' } })
  fireEvent.click(screen.getByRole('button', { name: dictionary.preview }))
  await screen.findByText('2.34.2')
  fireEvent.click(screen.getByRole('button', { name: dictionary.apply }))
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'apply_sync', planId: 'confirmed', confirm: true })))
})
