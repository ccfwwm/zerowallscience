import { expect, it } from 'vitest'
import { nextStartupStatus } from '../src/main/startup-status.js'
import type { StartupStatus } from '../src/shared/contracts.js'

it('retains process startup time across profile preparation and Host starting events', () => {
  const initial = { phase: 'starting', startedAt: 100, message: 'prepare' } as StartupStatus
  const host = nextStartupStatus(initial, { phase: 'starting', message: 'Host' }, 300)
  expect(host.startedAt).toBe(100)
  const ready = nextStartupStatus(host, { phase: 'ready' }, 500)
  expect(ready.finishedAt).toBe(500)
  expect(nextStartupStatus(ready, { phase: 'starting' }, 700).startedAt).toBe(700)
})
