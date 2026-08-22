import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'

interface SecretResponse {
  kind: 'zerowall-secret-response'
  requestId: string
  ok: boolean
  value?: string
  error?: string
}

interface SecretTransport {
  send(message: unknown): void
  subscribe(listener: (message: unknown) => void): () => void
}

function processTransport(): SecretTransport {
  if (typeof process.send !== 'function') throw new Error('ZeroWall credential IPC is unavailable.')
  return {
    send: (message) => { process.send?.(message) },
    subscribe: (listener) => {
      process.on('message', listener)
      return () => process.off('message', listener)
    },
  }
}

function isResponse(value: unknown): value is SecretResponse {
  if (value === null || typeof value !== 'object') return false
  const response = value as Partial<SecretResponse>
  return response.kind === 'zerowall-secret-response'
    && typeof response.requestId === 'string'
    && typeof response.ok === 'boolean'
}

export class SecretBrokerClient {
  constructor(private transport?: SecretTransport) {}

  get(key: string): Promise<string | undefined> {
    return this.request('get', key)
  }

  async set(key: string, value: string): Promise<void> {
    await this.request('set', key, value)
  }

  async delete(key: string): Promise<void> {
    await this.request('delete', key)
  }

  private request(operation: 'get' | 'set' | 'delete', key: string, value?: string): Promise<string | undefined> {
    const transport = this.transport ??= processTransport()
    const requestId = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe()
        reject(new Error('ZeroWall credential IPC timed out.'))
      }, 10_000)
      const unsubscribe = transport.subscribe((message) => {
        if (!isResponse(message) || message.requestId !== requestId) return
        clearTimeout(timer)
        unsubscribe()
        if (message.ok) resolve(message.value)
        else reject(new Error(message.error ?? 'Credential operation failed.'))
      })
      transport.send({
        kind: 'zerowall-secret-request',
        requestId,
        operation,
        key,
        ...(value === undefined ? {} : { value }),
      })
    })
  }
}

// The credential client is intentionally transport-only.  The Electron main
// process attaches the broker to the DSH child; exposing a no-op Cordis apply
// keeps this package a valid loader plugin without creating a second vault.
export function apply(_ctx: Context): void {}

// Loader entries consume the package default export. Keep plugin metadata in
// an object so DSH's export unwrapping does not discard Cordis fields.
export default { apply }
