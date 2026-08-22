import { describe, expect, it } from 'vitest'
import { resolveDesktopIdentity } from '../src/main/identity.js'

describe('desktop release identity', () => {
  it('keeps Preview isolated from the stable application', () => {
    expect(resolveDesktopIdentity('preview')).toEqual({
      channel: 'preview',
      productName: 'ZeroWallScience Preview',
      userDataDirectory: 'zerowall-science-3-preview',
    })
  })

  it('uses the stable product identity only for an explicit stable build', () => {
    expect(resolveDesktopIdentity('stable')).toEqual({
      channel: 'stable',
      productName: 'ZeroWallScience',
      userDataDirectory: 'zerowall-science-3',
    })
    expect(resolveDesktopIdentity(undefined).channel).toBe('preview')
  })
})
