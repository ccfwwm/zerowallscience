/** Share concurrent loads, but allow a later call to retry a failed load. */
export function retryableImport<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined
  return () => {
    if (!pending) {
      pending = Promise.resolve().then(load).catch((error: unknown) => {
        pending = undefined
        throw error
      })
    }
    return pending
  }
}
