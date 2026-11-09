/**
 * The library-argument validators the tools share: `parseLibrary` for the
 * absent, malformed, and accepted shapes, and `requireLibrary` for the
 * cursor path's insistence on a named library.
 * @module tests/tools/validation
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  GROUP_ID_MESSAGE,
  LIBRARY_ID_MESSAGE,
  LIBRARY_REQUIRED_MESSAGE,
  LIBRARY_TYPE_MESSAGE,
  parseLibrary,
  PERSONAL_LIBRARY_MESSAGE,
  requireLibrary,
} from '../../src/tools/validate.js'
import { type HostLane, setupHostLane } from '../helpers/lanes/host-lane.js'

let lane: HostLane

beforeEach(async () => {
  lane = await setupHostLane()
})

afterEach(async () => {
  await lane.teardown()
})

describe('parseLibrary', () => {
  it('returns undefined for an absent library', () => {
    expect(parseLibrary(undefined)).toBeUndefined()
    expect(parseLibrary(null)).toBeUndefined()
  })

  it('fails closed on malformed shapes with model-facing messages', () => {
    expect(() => parseLibrary({ type: 'shelves', id: 1 })).toThrow(LIBRARY_TYPE_MESSAGE)
    expect(() => parseLibrary({ type: 'user', id: 0.5 })).toThrow(LIBRARY_ID_MESSAGE)
    expect(() => parseLibrary({ type: 'user', id: 123 })).toThrow(PERSONAL_LIBRARY_MESSAGE)
    expect(() => parseLibrary({ type: 'group', id: 0 })).toThrow(GROUP_ID_MESSAGE)
    expect(() => parseLibrary({ type: 'user', id: -3 })).toThrow(PERSONAL_LIBRARY_MESSAGE)
  })

  it('accepts user/0 and positive groups', () => {
    expect(parseLibrary({ type: 'user', id: 0 })).toEqual({ type: 'user', id: 0 })
    expect(parseLibrary({ type: 'group', id: 42 })).toEqual({ type: 'group', id: 42 })
  })
})

describe('requireLibrary', () => {
  it('carries the parsed library through and rejects an absent one', () => {
    // The cursor's library has no meaningful absent case: without it the
    // version cannot say which counter it belongs to.
    expect(requireLibrary({ type: 'group', id: 42 })).toEqual({ type: 'group', id: 42 })
    expect(() => requireLibrary(undefined)).toThrow(LIBRARY_REQUIRED_MESSAGE)
    expect(() => requireLibrary({ type: 'user', id: 9 })).toThrow(PERSONAL_LIBRARY_MESSAGE)
  })
})
