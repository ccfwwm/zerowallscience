import { expect, it } from 'vitest'
import { mergePythonInventory, coreNeedsInstallation, pythonTaskProgressPercent } from '../src/client/python-inventory-state.js'

const installed = { ready: true, runtimeRoot: 'C:/installation/Python', inventoryComplete: true, scannedAt: '2026-10-12T12:00:00Z', officialPackageCount: 43, corePackageCount: 43, missingCorePackages: [], packages: [{ name: 'pandas', version: '1.0' }] }
it('preserves the valid local inventory during failed and late refreshes without inventing missing core packages', () => {
  expect(mergePythonInventory(installed, { ...installed, ready: false, inventoryComplete: false, packages: [] })).toBe(installed)
  expect(mergePythonInventory(installed, { ...installed, scannedAt: '2026-10-12T11:00:00Z', coreReady: false, missingCorePackages: ['pandas'] })).toBe(installed)
  expect(coreNeedsInstallation(installed)).toBe(false)
  expect(coreNeedsInstallation({ ready: true, coreReady: false, packages: [] })).toBe(false)
  expect(coreNeedsInstallation({ ...installed, missingCorePackages: ['pandas'] })).toBe(true)
})
it('accepts a fresh uninstall and never retains packages from a different runtime', () => {
  const removed = { ...installed, scannedAt: '2026-10-12T12:01:00Z', missingCorePackages: ['pandas'], packages: [] }
  expect(mergePythonInventory(installed, removed)).toBe(removed)
  const selected = { ready: false, runtimeRoot: 'C:/new/Python', packages: [] }
  expect(mergePythonInventory(installed, selected)).toBe(selected)
})
it('shows completed zero-package jobs as 100 percent complete', () => {
  expect(pythonTaskProgressPercent({ state: 'succeeded', completedPackages: 0, totalPackages: 0 })).toBe(100)
  expect(pythonTaskProgressPercent({ state: 'running', completedPackages: 0, totalPackages: 0 })).toBe(0)
  expect(pythonTaskProgressPercent({ state: 'running', completedPackages: 1, totalPackages: 4 })).toBe(25)
})
