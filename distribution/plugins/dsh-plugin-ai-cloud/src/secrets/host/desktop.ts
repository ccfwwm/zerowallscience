/** Private Electron parent-process secret transport; never exposes values to logs or env files. */
import { randomUUID } from 'node:crypto'

/** @param action - Vault operation. @param id - Secret id. @param value - Optional plaintext for encryption. @returns Secret result. */
export function desktopSecret(action: 'get' | 'set' | 'delete', id: string, value?: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    if (!process.connected || process.send === undefined) { reject(new Error('Desktop credential store unavailable')); return }
    const requestId = randomUUID()
    const cleanup = (): void => { clearTimeout(timer); process.off('message', receive); process.off('disconnect', disconnected) }
    const fail = (): void => { cleanup(); reject(new Error('Desktop credential store unavailable')) }
    const disconnected = (): void => { fail() }
    const receive = (message: unknown): void => {
      if (typeof message !== 'object' || message === null || !('type' in message) || message.type !== 'zerowall-secret-result'
        || !('requestId' in message) || message.requestId !== requestId) return
      cleanup()
      if (!('ok' in message) || message.ok !== true) { reject(new Error('Saved credentials could not be unlocked. Sign in again.')); return }
      if ('value' in message && message.value !== undefined && typeof message.value !== 'string') { reject(new Error('Invalid desktop credential response')); return }
      resolve('value' in message && typeof message.value === 'string' ? message.value : undefined)
    }
    const timer = setTimeout(fail, 15_000)
    process.on('message', receive)
    process.once('disconnect', disconnected)
    process.send({ type: 'zerowall-secret', requestId, action, id, ...(value === undefined ? {} : { value }) }, undefined, undefined,
      (error: Error | null) => { if (error !== null) fail() })
  })
}
