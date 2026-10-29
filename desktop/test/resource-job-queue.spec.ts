import { expect, it } from 'vitest'
import { createResourceJobQueue } from '../src/main/resource-job-queue.js'

it('keeps later jobs queued until the active job fails and continues afterwards', async () => {
  const enqueue = createResourceJobQueue(), events: string[] = []
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const first = enqueue(async () => { events.push('first'); await gate; throw new Error('installation failed') })
  const failed = expect(first).rejects.toThrow('installation failed')
  const second = enqueue(async () => { events.push('second') })
  const third = enqueue(async () => { events.push('third') })
  await Promise.resolve()
  expect(events).toEqual(['first'])
  release()
  await failed
  await Promise.all([second, third])
  expect(events).toEqual(['first', 'second', 'third'])
})
