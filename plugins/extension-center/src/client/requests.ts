/** Bound each read independently. Late results never enter component state. */
export async function boundedRequest<T>(request: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([request, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Resource request timed out')), milliseconds) })])
  } finally { clearTimeout(timer) }
}
