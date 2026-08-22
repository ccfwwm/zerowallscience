import { describe, expect, it } from 'vitest'
import { stopBeforeExit } from '../src/main/shutdown.js'

describe('desktop shutdown deadline', () => {
  it('waits for a responsive runtime', async () => {
    await expect(stopBeforeExit(async () => undefined, 50)).resolves.toBe('stopped')
  })

  it('releases the Electron process when the runtime never stops', async () => {
    await expect(stopBeforeExit(() => new Promise(() => undefined), 5)).resolves.toBe('timed-out')
  })

  it('still exits when runtime cleanup rejects', async () => {
    await expect(stopBeforeExit(async () => { throw new Error('stop failed') }, 50)).resolves.toBe('stopped')
  })
})
