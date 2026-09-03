import { describe, expect, it } from 'vitest'
import manifest from '../zerowall.plugin.json'

describe('plugin manifest', () => {
  it('targets only DSH rc.1', () => {
    expect(manifest.dsh).toEqual({ min: '0.1.2-rc.1', max: '0.1.2-rc.1' })
  })
})
