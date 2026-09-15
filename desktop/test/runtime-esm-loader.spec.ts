import { describe, expect, it } from 'vitest'
// @ts-expect-error The bootstrap is plain Node ESM, exercised directly here.
import { initialize, resolve } from '../build/runtime-esm-loader.mjs'

describe('synchronous runtime resolution', () => {
  it('keeps successful resolutions synchronous and retries only missing bare packages', () => {
    initialize({ anchor: 'file:///runtime/anchor.mjs' })
    const result = { url: 'file:///runtime/module.mjs' }
    expect(resolve('node:fs', {}, () => result)).toBe(result)
    const missing = Object.assign(new Error('missing'), { code: 'ERR_MODULE_NOT_FOUND' })
    expect(resolve('package', {parentURL:'file:///outside/module.mjs'}, (_name: string, context: {parentURL:string}) => {
      if (context.parentURL !== 'file:///runtime/anchor.mjs') throw missing
      return result
    })).toBe(result)
    expect(() => resolve('./missing.mjs', {}, () => { throw missing })).toThrow('missing')
  })
})
