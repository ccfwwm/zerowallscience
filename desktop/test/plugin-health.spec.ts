import { describe, expect, it } from 'vitest'
import { unchangedPluginFailure } from '../src/main/plugin-health.js'

describe('plugin activation baseline', () => {
  const failed = { id: 'ops-entry', name: 'dsh-ops/service', state: 3 }
  const baseline = { ready: false, entries: [failed] }
  it('permits an identified existing failure outside the affected bundle', () => {
    expect(unchangedPluginFailure(failed, { baseline, ids: ['dsh-image-gen'] })).toBe(true)
  })
  it('rejects new failures, loading entries and unidentified entries', () => {
    expect(unchangedPluginFailure({ ...failed, id: 'new' }, { baseline })).toBe(false)
    expect(unchangedPluginFailure(failed, { baseline: { ready: false, entries: [{ ...failed, state: 1 }] } })).toBe(false)
    expect(unchangedPluginFailure({ ...failed, state: 1 }, { baseline })).toBe(false)
    expect(unchangedPluginFailure({ state: 3 }, { baseline: { ready: false, entries: [{ state: 3 }] } })).toBe(false)
  })
  it('requires selected packages and mapped bundle entries to activate', () => {
    expect(unchangedPluginFailure(failed, { baseline, ids: ['dsh-ops'] })).toBe(false)
    expect(unchangedPluginFailure(failed, { baseline, affectedEntries: [{ id: failed.id }] })).toBe(false)
    expect(unchangedPluginFailure(failed, { baseline, affectedEntries: [{ name: failed.name }] })).toBe(false)
  })
})
