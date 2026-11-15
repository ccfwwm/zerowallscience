import { expect, it, vi } from 'vitest'
import { createSkillCatalogController } from '../src/client/skill-catalog-store.ts'
import type { MarketSkillCatalog } from '@deepseek-ai/dsh-plugin-market/types'

const snapshot: MarketSkillCatalog = { available: true, fetchedAt: '2026-11-15', entries: [{
  id: 'example', version: '1.1.0', installedVersion: '1.0.0', status: 'update', title: { en: 'Example' }, description: { en: '' },
  url: 'https://catalog.test/example.zip', bytes: 1, sha256: 'a'.repeat(64), names: ['example'],
}] }

it('updates only installed newer skills, stops on failure, and retains rows and diagnostics', async () => {
  const install = vi.fn(async () => ({ ...snapshot, error: { code: 'partial' as const, diagnostic: 'Inspect Skills' } }))
  const controller = createSkillCatalogController({ read: async () => snapshot, install })
  expect(await controller.read()).toBe(true)
  expect(await controller.update()).toBe(false)
  expect(install).toHaveBeenCalledWith('example', '1.1.0')
  expect(controller.store.getSnapshot().catalog).toMatchObject({ entries: snapshot.entries, error: { code: 'partial' } })
  expect(controller.store.getSnapshot().busy).toBe(false)
  controller.dispose()
})

it('joins duplicate clicks and ignores results after disposal', async () => {
  const pending = Promise.withResolvers<MarketSkillCatalog>()
  const controller = createSkillCatalogController({ read: () => pending.promise, install: vi.fn() })
  const first = controller.read()
  expect(controller.read()).toBe(first)
  controller.dispose()
  const state = controller.store.getSnapshot()
  pending.resolve(snapshot)
  expect(await first).toBe(false)
  expect(controller.store.getSnapshot()).toBe(state)
})

it('runs an install requested during a read instead of treating the read as installation', async () => {
  const pending = Promise.withResolvers<MarketSkillCatalog>()
  const install = vi.fn(async () => snapshot)
  const controller = createSkillCatalogController({ read: () => pending.promise, install })
  const reading = controller.read()
  const installing = controller.install([{ id: 'example', version: '1.1.0' }])
  expect(install).not.toHaveBeenCalled()
  pending.resolve(snapshot)
  await reading
  expect(await installing).toBe(true)
  expect(install).toHaveBeenCalledOnce()
  controller.dispose()
})

it('ends initial loading after a failed remote call and can retry', async () => {
  const read = vi.fn().mockRejectedValueOnce(new Error('Disconnected')).mockResolvedValue(snapshot)
  const controller = createSkillCatalogController({ read, install: vi.fn() })
  expect(await controller.read()).toBe(false)
  expect(controller.store.getSnapshot()).toMatchObject({ busy: false, checked: true, catalog: { error: { diagnostic: 'Disconnected' } } })
  expect(await controller.read()).toBe(true)
  expect(controller.store.getSnapshot().catalog.error).toBeUndefined()
  controller.dispose()
})
