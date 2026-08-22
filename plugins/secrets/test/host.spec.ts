import { describe, expect, it } from 'vitest'
import { SecretBrokerClient } from '../src/host/index.js'

describe('Host credential IPC client', () => {
  it('correlates replies without exposing a renderer-facing read seam', async () => {
    const listeners = new Set<(message: unknown) => void>()
    const sent: unknown[] = []
    const client = new SecretBrokerClient({
      send: (message) => {
        sent.push(message)
        const request = message as { requestId: string }
        queueMicrotask(() => {
          for (const listener of listeners) listener({
            kind: 'zerowall-secret-response', requestId: request.requestId, ok: true, value: 'resolved-secret',
          })
        })
      },
      subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    })
    await expect(client.get('zerowall.ai-cloud.session')).resolves.toBe('resolved-secret')
    expect(sent[0]).toMatchObject({ kind: 'zerowall-secret-request', operation: 'get', key: 'zerowall.ai-cloud.session' })
    expect(listeners.size).toBe(0)
  })
})
