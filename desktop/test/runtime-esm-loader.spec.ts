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

  it('resolves only from the fixed profile and runtime, ignoring historical supply anchors', () => {
    initialize({ anchor: 'file:///runtime/package.json', profileAnchor: 'file:///harness/profiles/web/package.json', generationAnchor: 'file:///harness/resources/offline/old/package.json' })
    const parents: string[] = []
    const missing = Object.assign(new Error('missing'), { code: 'ERR_MODULE_NOT_FOUND' })
    expect(() => resolve('absent', { parentURL: 'file:///outside/entry.mjs' }, (_name: string, context: { parentURL: string }) => {
      parents.push(context.parentURL)
      throw missing
    })).toThrow(missing)
    expect(parents).toEqual(['file:///outside/entry.mjs', 'file:///harness/profiles/web/package.json', 'file:///runtime/package.json'])
  })

  it('binds DSH core identities to the current runtime and refuses historical shadows', () => {
    initialize({ anchor: 'file:///runtime/package.json', profileAnchor: 'file:///harness/profiles/web/package.json' })
    const parents: string[] = []
    const missing = Object.assign(new Error('core missing'), { code: 'ERR_MODULE_NOT_FOUND' })
    expect(() => resolve('@deepseek-ai/dsh-tools', { parentURL: 'file:///harness/profiles/web/node_modules/plugin/index.js' }, (_name: string, context: { parentURL: string }) => {
      parents.push(context.parentURL)
      if (context.parentURL === 'file:///runtime/package.json') throw missing
      return { url: 'file:///old-core.js' }
    })).toThrow(missing)
    expect(parents).toEqual(['file:///runtime/package.json'])
  })
})
