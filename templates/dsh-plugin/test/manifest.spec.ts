import { describe, expect, it } from 'vitest'
import manifest from '../zerowall.plugin.json'

describe('plugin manifest', () => {
  it('targets only DSH alpha.4', () => {
    expect(manifest.dsh).toEqual({ min: '0.1.2-alpha.4', max: '0.1.2-alpha.4' })
  })
})
