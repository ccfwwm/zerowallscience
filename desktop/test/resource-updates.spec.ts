import { describe, expect, it } from 'vitest'
import { resourceUpdateSummary } from '../src/main/resource-update-status.js'
import { redactResourceDiagnostic } from '../src/main/resource-diagnostics.js'

describe('resource update reporting', () => {
  it('retains known updates when a fulfilled check reports catalog failure', () => {
    const previous = { phase: 'available' as const, updateCount: 2, kinds: { plugin: 2 } }
    expect(resourceUpdateSummary(previous, [{ kind: 'plugin', catalogStatus: 'unavailable', error: 'offline', resources: [] }])).toMatchObject({ phase: 'available', updateCount: 2, error: 'offline' })
    expect(resourceUpdateSummary({ phase: 'idle', updateCount: 0, kinds: {} }, [{ kind: 'skill', domainAvailable: false, catalogStatus: 'checked' }])).toMatchObject({ phase: 'error', updateCount: 0 })
  })
  it('counts plugins and Skills independently and clears a successfully installed update', () => {
    const status = resourceUpdateSummary({ phase: 'idle', updateCount: 0, kinds: {} }, [
      { kind: 'plugin', resources: [{ updateAvailable: true }, { updateAvailable: false }] },
      { kind: 'skill', resources: [{ updateAvailable: true }] },
    ])
    expect(status).toMatchObject({ phase: 'available', updateCount: 2, kinds: { plugin: 1, skill: 1 } })
    expect(resourceUpdateSummary(status, [{ kind: 'plugin', resources: [] }])).toMatchObject({ phase: 'available', updateCount: 1, kinds: { plugin: 0, skill: 1 } })
    expect(resourceUpdateSummary(status, [], ['network error']).phase).toBe('available')
  })
  it('redacts bearer headers, quoted credentials and every URL query value', () => {
    const diagnostic = 'Authorization: Bearer sensitiveBearer\npassword="two word secret"\nhttps://user:pass@example.test/path?token=abc&other=xyz\nERR_PNPM_WORKSPACE_PKG_NOT_FOUND'
    const value = redactResourceDiagnostic(diagnostic)
    for (const secret of ['sensitiveBearer', 'two word secret', 'user:pass', 'abc', 'xyz']) expect(value).not.toContain(secret)
    expect(value).toContain('ERR_PNPM_WORKSPACE_PKG_NOT_FOUND')
    expect(value).not.toContain('$1')
  })
})
