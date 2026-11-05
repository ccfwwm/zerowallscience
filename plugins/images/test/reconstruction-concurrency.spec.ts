import { expect, it } from 'vitest'
import { reconstructionConcurrency, withReconstructionSlot } from '../src/host/reconstruction-concurrency.js'

it('defaults to two and validates user-selected reconstruction concurrency', () => {
  expect(reconstructionConcurrency()).toBe(2)
  for (const limit of [1, 3, 4, 5, 10]) expect(reconstructionConcurrency(limit)).toBe(limit)
  for (const limit of [0, -1, 2.5, 11, NaN, Infinity]) expect(() => reconstructionConcurrency(limit)).toThrow('integer')
})

it.each([2, 3, 4, 5])('actually runs %i local pages together without a hidden two-page cap', async limit => {
  let active=0,maximum=0
  const releases: Array<() => void> = []
  const calls=Array.from({length:limit+1},()=>withReconstructionSlot(limit,async()=>{
    active++;maximum=Math.max(maximum,active)
    await new Promise<void>(resolve=>releases.push(resolve))
    active--
  }))
  await Promise.resolve();await Promise.resolve()
  expect(maximum).toBe(limit);expect(releases).toHaveLength(limit)
  releases.shift()!()
  await new Promise(resolve=>setTimeout(resolve,0))
  expect(releases).toHaveLength(limit)
  releases.splice(0).forEach(release=>release())
  await Promise.all(calls)
  expect(maximum).toBe(limit);expect(active).toBe(0)
})

it('removes cancelled queued work and releases its slot for subsequent work', async () => {
  let release!:()=>void,called=false
  const first=withReconstructionSlot(1,()=>new Promise<void>(resolve=>{release=resolve}))
  await Promise.resolve();await Promise.resolve()
  const controller=new AbortController()
  const second=withReconstructionSlot(1,async()=>{called=true},controller.signal)
  const rejected=expect(second).rejects.toThrow('cancelled')
  controller.abort(new Error('cancelled'));await rejected
  release();await first
  expect(called).toBe(false)
  expect(await withReconstructionSlot(1,async()=>42)).toBe(42)
})
