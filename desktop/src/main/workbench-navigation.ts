/** Bound both navigation and renderer probes, including promises that never settle. */
export async function awaitWorkbenchStep<T>(operation: () => Promise<T>, signal: AbortSignal, deadline: number): Promise<T> {
  signal.throwIfAborted()
  const remaining = deadline - Date.now()
  if (remaining <= 0) throw new Error('工作台界面加载超时，请打开日志检查客户端插件。')
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort!: () => void
  const interrupted = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('工作台界面加载超时，请打开日志检查客户端插件。')), remaining)
    abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
  })
  try { return await Promise.race([operation(), interrupted]) }
  finally { clearTimeout(timer); signal.removeEventListener('abort', abort) }
}

/** Owns renderer navigation across Host activation and rollback generations. */
export class WorkbenchNavigation {
  private current?: { key: string; controller: AbortController; done: Promise<boolean> }

  cancel(): void {
    this.current?.controller.abort()
    this.current = undefined
  }

  open(key: string, render: (signal: AbortSignal) => Promise<void>, fail: (error: unknown) => Promise<void>): Promise<boolean> {
    if (this.current?.key === key) return this.current.done
    this.cancel()
    const controller = new AbortController()
    const done = Promise.resolve().then(() => render(controller.signal)).then(() => !controller.signal.aborted, async error => {
      if (!controller.signal.aborted) await fail(error)
      return false
    })
    this.current = { key, controller, done }
    return done
  }

  get completion(): Promise<boolean> | undefined { return this.current?.done }
}
