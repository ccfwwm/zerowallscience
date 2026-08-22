import { describe, expect, it } from 'vitest'
import { unwrapRemoteResult } from '../src/client/remote-result.js'

describe('unwrapRemoteResult', () => {
  it('returns a successful Typert value', () => {
    expect(unwrapRemoteResult('zerowall.projects.list', { ok: true, value: ['project'] })).toEqual(['project'])
  })

  it('preserves the operation and remote failure details', () => {
    expect(() => unwrapRemoteResult('zerowall.projects.create', {
      ok: false,
      error: { code: 'invalid-request', message: 'name is required' },
    })).toThrow('zerowall.projects.create failed: invalid-request: name is required')
  })
})
