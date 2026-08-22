export async function stopBeforeExit(stop: () => Promise<void>, timeoutMs: number): Promise<'stopped' | 'timed-out'> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      stop().then(() => 'stopped' as const, () => 'stopped' as const),
      new Promise<'timed-out'>((resolve) => {
        timeout = setTimeout(() => resolve('timed-out'), timeoutMs)
        timeout.unref?.()
      }),
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}
