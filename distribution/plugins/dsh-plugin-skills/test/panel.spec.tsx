// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SkillsPanel } from '../src/client/panel.js'
import { en, type SkillsTranslate } from '../src/client/locales.js'
import { createSkillsViewStore } from '../src/client/view-store.js'
import type { ManagedSkill, SkillsRequest, SkillsResponse } from '../src/shared/types.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Switch: ({ checked, label, disabled, onChange }: { checked: boolean; label: string; disabled?: boolean; onChange: (value: boolean) => void }) => <button aria-label={label} disabled={disabled} role="switch" aria-checked={checked} onClick={() => onChange(!checked)} />,
  Toast: () => null,
}))
const t: SkillsTranslate = key => en[key]
const skill: ManagedSkill = { id: 'plugin:example', name: 'example', description: 'Example workflow', source: 'bundled', provider: 'plugin', topic: 'plugin', kind: 'standalone', enabled: true, effective: true, removable: false, requirements: [] }
afterEach(cleanup)
function panel(request: (input: SkillsRequest) => Promise<SkillsResponse>) {
  const store = createSkillsViewStore().create()
  return render(<SkillsPanel request={request} pickDirectory={async () => '/workspace'} t={t} actions={store.actions} useStore={selector => selector(store.getSnapshot())} />)
}
describe('Skills management panel', () => {
  it('shows only the owner instructions in plugin details and labels their model switch', async () => {
    const request = vi.fn(async (): Promise<SkillsResponse> => ({ entries: [skill, { ...skill, id: 'owner:help', name: 'plugin-help', kind: 'plugin-instructions', ownerPackage: '@zerowall/example' }], complete: true }))
    const store = createSkillsViewStore().create()
    render(<SkillsPanel ownerPackage="@zerowall/example" request={request} pickDirectory={async () => null} t={t} actions={store.actions} useStore={selector => selector(store.getSnapshot())} />)
    await screen.findByText('plugin-help')
    expect(screen.queryByText('example')).toBeNull()
    expect(screen.queryByRole('textbox', { name: en.source })).toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: `${en.enableInstructions}: plugin-help` }))
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ name: 'plugin-help', action: 'set-enabled', scope: 'global', enabled: false })))
  })
  it('keeps plugin-owned instructions out of the independent Skills list', async () => {
    const request = vi.fn(async (): Promise<SkillsResponse> => ({ entries: [skill, { ...skill, id: 'owner:help', name: 'plugin-help', kind: 'plugin-instructions', ownerPackage: '@zerowall/example' }], complete: true }))
    panel(request)
    await screen.findByText('example')
    expect(screen.queryByText('plugin-help')).toBeNull()
  })
  it('allows global switches immediately and requires a directory only for workspace changes', async () => {
    const request = vi.fn(async (): Promise<SkillsResponse> => ({ entries: [skill], complete: true }))
    panel(request)
    await screen.findByText('example')
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('global')
    const toggle = screen.getByRole('switch', { name: 'Enable skill: example' })
    expect(toggle.hasAttribute('disabled')).toBe(false)
    fireEvent.click(toggle)
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'set-enabled', scope: 'global', enabled: false })))
    request.mockClear()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'workspace' } })
    expect(toggle.hasAttribute('disabled')).toBe(true)
    fireEvent.click(toggle)
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'set-enabled' }))
    fireEvent.click(screen.getByRole('button', { name: en.workspacePath }))
    await waitFor(() => expect(toggle.hasAttribute('disabled')).toBe(false))
    fireEvent.click(toggle)
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'set-enabled', scope: 'workspace', cwd: '/workspace', enabled: false })))
  })
  it('shows optional skills as available on demand and permits a manual disable', async () => {
    const request = vi.fn(async (): Promise<SkillsResponse> => ({ entries: [{ ...skill, enabled: false, onDemand: true }], complete: true }))
    panel(request)
    await screen.findByText(new RegExp(en.onDemand))
    const toggle = screen.getByRole('switch', { name: 'Enable skill: example' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(toggle)
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'set-enabled', enabled: false, scope: 'global' })))
  })
  it('keeps entries visible after a failed toggle and reports the failure', async () => {
    const request = vi.fn(async (input: SkillsRequest): Promise<SkillsResponse> => {
      if (input.action === 'set-enabled') throw new Error('Dependency installation failed')
      return { entries: [skill], complete: true }
    })
    panel(request)
    await screen.findByText('example')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'global' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Enable skill: example' }))
    await screen.findByRole('alert')
    expect(screen.getByText('example')).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Enable skill: example' }).getAttribute('aria-checked')).toBe('true')
  })
  it('requires a preview and explicit replacement before importing conflicting names', async () => {
    const request = vi.fn(async (input: SkillsRequest): Promise<SkillsResponse> => input.action === 'preview'
      ? { preview: { id: 'preview', source: '/skills.zip', skills: [{ name: 'example', description: 'A workflow', relativePath: 'SKILL.md', conflict: true }] } }
      : { entries: [skill], complete: true })
    panel(request)
    fireEvent.change(screen.getByRole('textbox', { name: en.source }), { target: { value: '/skills.zip' } })
    fireEvent.click(screen.getByRole('button', { name: en.preview }))
    const install = await screen.findByRole('button', { name: en.install })
    expect(install.hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: en.replace }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'global' } })
    fireEvent.click(install)
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'install', id: 'preview', replace: true })))
  })
})
