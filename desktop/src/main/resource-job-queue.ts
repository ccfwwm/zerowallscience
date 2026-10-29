/** Start each persisted resource job only after its predecessor has settled. */
export function createResourceJobQueue(): (run: () => Promise<void>) => Promise<void> {
  let tail = Promise.resolve()
  return run => {
    const result = tail.then(run)
    tail = result.catch(() => {})
    return result
  }
}
