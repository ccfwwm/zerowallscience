import { describe, expect, it } from 'vitest'
import { pluginActivationHealth } from '../src/main/plugin-health.js'

describe('plugin activation health', () => {
  const core = { id: 'connection', name: '@deepseek-ai/connection', state: 2 }
  const selected = { id: 'image-service', name: 'dsh-image-gen/service', state: 2 }
  const unrelated = { id: 'ops-entry', name: 'dsh-ops/service', state: 1 }

  it('allows ordinary startup while optional plugins load or fail', () => {
    for (const state of [0, 1, 3, undefined]) {
      expect(pluginActivationHealth({ ready: true, entries: [core, { ...unrelated, state }] })).toEqual({ ready: true, failures: [] })
    }
  })

  it('never accepts an unavailable core, even if every listed plugin is active', () => {
    expect(pluginActivationHealth({ ready: false, entries: [selected] }).ready).toBe(false)
    const failed = { ...core, state: 3 }
    expect(pluginActivationHealth({ ready: false, entries: [failed] })).toEqual({ ready: false, failures: [failed] })
  })

  it('requires the configured history and workspace interfaces before profile activation succeeds', () => {
    for (const id of ['workspace', 'session-controller', 'workspace-controller']) {
      for (const state of [0, 1, 3, undefined]) {
        const entry = { id, state }
        const health = pluginActivationHealth({ ready: true, entries: [core, entry] })
        expect(health.ready).toBe(false)
        expect(health.failures).toEqual(state === 3 ? [entry] : [])
      }
    }
  })

  it('waits for the changed plugin and rolls back its failure while ignoring unrelated background failures', () => {
    const scope = { ids: ['dsh-image-gen'] }
    for (const state of [0, 1, undefined]) {
      expect(pluginActivationHealth({ ready: true, entries: [core, { ...selected, state }] }, scope)).toEqual({ ready: false, failures: [] })
    }
    const failed = { ...selected, state: 3 }
    expect(pluginActivationHealth({ ready: true, entries: [core, failed] }, scope)).toEqual({ ready: false, failures: [failed] })
    expect(pluginActivationHealth({ ready: true, entries: [core, selected, { ...unrelated, state: 3 }] }, scope)).toEqual({ ready: true, failures: [] })
  })

  it('checks mapped bundle rows even when their entry name differs from the package id', () => {
    const failed = { ...selected, state: 3 }
    for (const affectedEntries of [[{ id: selected.id }], [{ name: selected.name }]]) {
      expect(pluginActivationHealth({ ready: true, entries: [core, failed] }, { ids: ['@example/image-bundle'], affectedEntries }).failures).toEqual([failed])
    }
  })

  it('allows disabled or removed rows and support-only changes without waiting for absent plugins', () => {
    expect(pluginActivationHealth({ ready: true, entries: [core, unrelated] }, { affectedEntries: [{ id: selected.id }] }).ready).toBe(true)
  })
})
