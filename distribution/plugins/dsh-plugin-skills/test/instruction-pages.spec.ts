import { expect, it, vi } from 'vitest'
import { createInstructionPages } from '../src/client/instruction-pages.js'
import type { ManagedSkill } from '../src/shared/types.js'

const instruction = (ownerPackage: string, name: string): ManagedSkill => ({ id: name, name, description: name, source: 'bundled', provider: 'official', kind: 'plugin-instructions', ownerPackage, topic: 'plugin', enabled: true, effective: true, removable: false, requirements: [] })

it('provides one page for an internal owner, keeps bundle pages unique and removes unregistered providers', async () => {
  const removed = vi.fn(), register = vi.fn(() => removed), failed = vi.fn()
  let inventory = { entries: [instruction('office-package', 'office'), instruction('office-package', 'office-docx'), instruction('image-package', 'image'), { ...instruction('user-package', 'office'), kind: 'standalone' as const }], packages: ['image-package'] }
  const pages = createInstructionPages({ load: async () => inventory, register, failed })
  await pages.refresh(); await pages.refresh()
  expect(register.mock.calls).toEqual([['office-package']])
  inventory = { entries: [], packages: ['image-package'] }
  await pages.refresh()
  expect(removed).toHaveBeenCalledOnce()
  await pages.dispose()
  expect(failed).not.toHaveBeenCalled()
})

it('retains pages on read failure and releases them when its client scope stops', async () => {
  const removed = vi.fn(), failed = vi.fn()
  const load = vi.fn().mockResolvedValueOnce({ entries: [instruction('owner', 'help')], packages: [] }).mockRejectedValueOnce(new Error('disconnected'))
  const pages = createInstructionPages({ load, register: () => removed, failed })
  await pages.refresh(); await pages.refresh()
  expect(failed).toHaveBeenCalledOnce(); expect(removed).not.toHaveBeenCalled()
  await pages.dispose(); expect(removed).toHaveBeenCalledOnce()
})

it('does not register a page when an inventory read completes after teardown', async () => {
  const ready = Promise.withResolvers<{ entries: ManagedSkill[]; packages: string[] }>()
  const register = vi.fn(), failed = vi.fn()
  const pages = createInstructionPages({ load: () => ready.promise, register, failed })
  const reading = pages.refresh()
  await Promise.resolve()
  const stopping = pages.dispose()
  ready.resolve({ entries: [instruction('owner', 'help')], packages: [] })
  await Promise.all([reading, stopping])
  expect(register).not.toHaveBeenCalled()
})
