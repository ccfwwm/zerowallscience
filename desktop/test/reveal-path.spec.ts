import { describe, expect, it } from 'vitest'
import { resolveRevealPath } from '../src/main/reveal-path.js'

describe('desktop reveal path', () => {
  it('accepts an absolute Windows artifact path without rewriting it', () => {
    const path = 'C:\\research\\presentation.pptx'
    expect(resolveRevealPath(path)).toBe(path)
  })

  it.each([undefined, '', '   ', 'presentation.pptx', '.\\presentation.pptx'])(
    'rejects a renderer value that is not an absolute path: %j',
    value => expect(() => resolveRevealPath(value)).toThrow('desktop:reveal-path requires an absolute path'),
  )
})
