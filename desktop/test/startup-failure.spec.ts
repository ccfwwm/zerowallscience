import { describe, expect, it } from 'vitest'
import { startupFailure } from '../src/main/startup-failure.js'

describe('startup verification diagnostics', () => {
  it('handles non-Error values without throwing a second startup error', () => {
    for (const value of [null, undefined, 0, 'failed']) {
      expect(startupFailure(value)).toEqual({ phase: 'failed', message: String(value) })
    }
  })
  it('explains stale installer files and serializes counts without filenames', () => {
    const error = Object.assign(new Error('Offline profile file set mismatch'), {
      code: 'OFFLINE_PROFILE_MISMATCH', diagnostics: {
        applicationVersion: '8.1.1', buildId: 'test-build', extraFiles: ['private-path'], missingFiles: ['missing'],
        sizeMismatches: [], hashMismatches: ['hash'], logicalArchiveMismatch: { extraFiles: ['archived'] },
      },
    })
    const result = startupFailure(error)
    expect(result.message).toContain('多余 1、缺失 1、大小不符 0、哈希不符 1')
    expect(result.message).toContain('重新覆盖安装 8.1.1')
    expect(result.diagnostics).toMatchObject({ code: error.code, buildId: 'test-build', extraFiles: 1, logicalArchiveMismatch: { extraFiles: 1 } })
    expect(JSON.stringify(result)).not.toContain('private-path')
  })
  it('redacts credentials from ordinary failures', () => {
    expect(startupFailure(new Error('authorization: Bearer secret-value token=secret-token')).message).not.toMatch(/secret-value|secret-token/)
  })
})
