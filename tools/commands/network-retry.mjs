import { setTimeout as delay } from 'node:timers/promises'

const transientTransportCodes = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'EPIPE',
  'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH',
  'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
])

function isTransientTransportError(error) {
  const seen = new Set()
  for (let current = error; current && !seen.has(current); current = current.cause) {
    seen.add(current)
    if (transientTransportCodes.has(current.code)) return true
  }
  return false
}

/** Retry a whole transfer, including its body, before accepting verified bytes. */
export async function retryTransientTransfer(operation, { signal, attempts = 3, delayMs = 250 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    signal?.throwIfAborted()
    try { return await operation() }
    catch (error) {
      // Caller cancellation and the overall deadline take precedence over a
      // socket error caused by aborting the same request. Integrity, signature,
      // protocol, HTTP and filesystem failures are never transport retries.
      signal?.throwIfAborted()
      if (attempt + 1 === attempts || !isTransientTransportError(error)) throw error
      await delay(delayMs * 2 ** attempt, undefined, { signal }).catch(error => {
        signal?.throwIfAborted()
        throw error
      })
    }
  }
}
