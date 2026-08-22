import { describe, expect, it } from 'vitest'
import { canGrantWindowPermission, isTrustedAppUrl } from '../src/main/security-policy.js'

describe('desktop navigation policy', () => {
  const origin = 'http://127.0.0.1:43127'

  it('trusts only the active Harness origin and local splash', () => {
    expect(isTrustedAppUrl(`${origin}/`, origin)).toBe(true)
    expect(isTrustedAppUrl('file:///splash.html', origin)).toBe(true)
    expect(isTrustedAppUrl('http://127.0.0.1:43128/', origin)).toBe(false)
    expect(isTrustedAppUrl('https://example.com/', origin)).toBe(false)
  })

  it('grants only sanitized clipboard writes to the main frame', () => {
    expect(canGrantWindowPermission('clipboard-sanitized-write', `${origin}/`, true, origin)).toBe(true)
    expect(canGrantWindowPermission('media', `${origin}/`, true, origin)).toBe(false)
    expect(canGrantWindowPermission('clipboard-sanitized-write', `${origin}/`, false, origin)).toBe(false)
  })
})
