export const DEFAULT_RECONSTRUCTION_CONCURRENCY = 2
export const MAX_RECONSTRUCTION_CONCURRENCY = 10

export function reconstructionConcurrency(value?: number): number {
  const limit = value ?? DEFAULT_RECONSTRUCTION_CONCURRENCY
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_RECONSTRUCTION_CONCURRENCY) {
    throw new Error(`Reconstruction concurrency must be an integer from 1 to ${MAX_RECONSTRUCTION_CONCURRENCY}.`)
  }
  return limit
}

let active = 0
const queue: Array<{ limit: number; start: () => void }> = []
function drain(): void {
  while (queue.length && active < queue[0]!.limit) queue.shift()!.start()
}

/** Respect the user's limit across conversations, without a hidden two-worker cap. */
export async function withReconstructionSlot<T>(limit: number, action: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  reconstructionConcurrency(limit)
  signal?.throwIfAborted()
  await new Promise<void>((accept, reject) => {
    const entry = { limit, start: () => { signal?.removeEventListener('abort', abort); active++; accept() } }
    const abort = () => {
      const index = queue.indexOf(entry)
      if (index >= 0) queue.splice(index, 1)
      reject(signal?.reason ?? new Error('Reconstruction cancelled.'))
      drain()
    }
    queue.push(entry)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    drain()
  })
  try { signal?.throwIfAborted(); return await action() }
  finally { active--; drain() }
}
