export const DEFAULT_IMAGE_CONCURRENCY = 10

export function imageConcurrency(value: number | undefined): number {
  const limit = value ?? DEFAULT_IMAGE_CONCURRENCY
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Image concurrency must be a positive integer.')
  return limit
}

let active = 0
const queue: Array<{ limit: number; start: () => void }> = []

function drain(): void {
  while (queue.length && active < queue[0]!.limit) queue.shift()!.start()
}

/** A batch supplies the same limit on every request; never forward it to the provider. */
export async function withImageSlot<T>(limit: number, action: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  imageConcurrency(limit)
  signal?.throwIfAborted()
  await new Promise<void>((accept, reject) => {
    const entry = { limit, start: () => { signal?.removeEventListener('abort', abort); active++; accept() } }
    const abort = () => {
      const index = queue.indexOf(entry)
      if (index >= 0) queue.splice(index, 1)
      reject(signal?.reason)
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
