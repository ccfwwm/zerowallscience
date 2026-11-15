// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MarketSkillCatalog } from '@deepseek-ai/dsh-plugin-market/types'
import { SkillCatalogTab, SkillCatalogUpdates } from '../src/client/SkillCatalog.tsx'
import { skillEn } from '../src/client/skill-locales.ts'

afterEach(cleanup)

function setup(catalog: MarketSkillCatalog, checked = true) {
  const store = createSnapshotStore({ catalog, busy: false, checked, toast: null as number | null })
  const install = vi.fn(async () => true)
  const props = {
    useSkills: bindSnapshotSelector(store), read: vi.fn(async () => true), install,
    update: vi.fn(async () => true), clearToast: vi.fn(), resolveText: (text: Record<string, string>) => text.en ?? '',
    t: (key: string) => Object.entries(skillEn).find(([name]) => name === key)?.[1] ?? key,
  }
  return { store, props, install }
}

const row: MarketSkillCatalog['entries'][number] = {
  id: 'example', version: '1.1.0', title: { en: 'Example skill' }, description: { en: 'Example description' },
  url: 'https://catalog.test/example.zip', bytes: 10, sha256: 'a'.repeat(64), names: ['example'], status: 'available',
}

it('shows initial loading and asks for confirmation before first installation', () => {
  const f = setup({ available: true, fetchedAt: '', entries: [] }, false)
  const { rerender } = render(<SkillCatalogTab {...f.props} />)
  expect(screen.getByRole('status', { name: 'Loading skill catalog' })).toBeTruthy()
  f.store.set({ ...f.store.getSnapshot(), checked: true, catalog: { available: true, fetchedAt: '', entries: [row] } })
  rerender(<SkillCatalogTab {...f.props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Install' }))
  expect(f.install).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: 'Install this skill?' }).textContent).toContain('Confirm that you trust this source.')
  const buttons = screen.getAllByRole('button', { name: 'Install' })
  fireEvent.click(buttons[buttons.length - 1]!)
  expect(f.install).toHaveBeenCalledWith([row])
})

it('keeps failure details visible and only offers installed updates in Updates', () => {
  const update = { ...row, status: 'update' as const, installedVersion: '1.0.0' }
  const f = setup({ available: true, fetchedAt: '', entries: [row, { ...update, id: 'installed' }], error: { code: 'partial', diagnostic: 'Enablement failed' } })
  render(<SkillCatalogUpdates {...f.props} />)
  expect(screen.queryByRole('button', { name: 'Install' })).toBeNull()
  expect(screen.getByRole('alert').textContent).toContain('Enablement failed')
  expect(screen.getByRole('region', { name: 'Skill updates' }).textContent).toMatchInlineSnapshot('"Skill updatesUpdate all skillsSkills may have been imported before configuration failed. Inspect Skills management before retrying.Enablement failedExample skillExample description1.0.0 → 1.1.0Update"')
  fireEvent.click(screen.getByRole('button', { name: 'Update' }))
  expect(f.install).toHaveBeenCalledWith([{ ...update, id: 'installed' }])
})
