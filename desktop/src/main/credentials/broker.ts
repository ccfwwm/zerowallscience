import type { ChildProcess } from 'node:child_process'
import { assertCredentialKey, type CredentialVault } from './vault.js'

interface SecretRequest {
  kind: 'zerowall-secret-request'
  requestId: string
  operation: 'get' | 'set' | 'delete'
  key: string
  value?: string
}

interface SecretResponse {
  kind: 'zerowall-secret-response'
  requestId: string
  ok: boolean
  value?: string
  error?: string
}

function isRequest(value: unknown): value is SecretRequest {
  if (value === null || typeof value !== 'object') return false
  const request = value as Partial<SecretRequest>
  return request.kind === 'zerowall-secret-request'
    && typeof request.requestId === 'string'
    && request.requestId.length > 0
    && (request.operation === 'get' || request.operation === 'set' || request.operation === 'delete')
    && typeof request.key === 'string'
    && (request.value === undefined || typeof request.value === 'string')
}

export function attachCredentialBroker(child: ChildProcess, vault: CredentialVault): () => void {
  const onMessage = (message: unknown): void => {
    if (!isRequest(message)) return
    void handleRequest(message, vault).then((response) => {
      if (child.connected) child.send?.(response)
    })
  }
  child.on('message', onMessage)
  return () => child.off('message', onMessage)
}

async function handleRequest(request: SecretRequest, vault: CredentialVault): Promise<SecretResponse> {
  try {
    assertCredentialKey(request.key)
    if (request.operation === 'get') {
      return { kind: 'zerowall-secret-response', requestId: request.requestId, ok: true, value: await vault.get(request.key) }
    }
    if (request.operation === 'set') {
      if (request.value === undefined) throw new Error('Credential value is required.')
      await vault.set(request.key, request.value)
    } else {
      await vault.delete(request.key)
    }
    return { kind: 'zerowall-secret-response', requestId: request.requestId, ok: true }
  } catch (error) {
    return {
      kind: 'zerowall-secret-response',
      requestId: request.requestId,
      ok: false,
      error: error instanceof Error ? error.message : 'Credential operation failed.',
    }
  }
}
