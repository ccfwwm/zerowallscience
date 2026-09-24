export interface PackageRetryOptions<T> {
  packageName: string
  mirrorUrl: string
  attempts?: number
  run(attempt: number): Promise<T>
  validate(value: T, attempt: number): Promise<void> | void
  clear(): Promise<void>
  pause?(milliseconds: number): Promise<void>
}

/** Retry one package from the same selected mirror, discarding partial output. */
export async function withPackageDownloadRetries<T>(options: PackageRetryOptions<T>): Promise<T> {
  const attempts = options.attempts ?? 4
  const pause = options.pause ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt === 1) await options.clear()
    try {
      const value = await options.run(attempt)
      await options.validate(value, attempt)
      return value
    } catch (error) {
      lastError = error
      await options.clear().catch(() => undefined)
      if (attempt < attempts) await pause(500 * 2 ** (attempt - 1))
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`依赖 ${options.packageName} 从镜像 ${options.mirrorUrl} 下载失败（已重试 ${attempts - 1} 次）：${detail}`)
}
