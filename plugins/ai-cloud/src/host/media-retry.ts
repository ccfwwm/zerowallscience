/** Only bounded, credential-free retry metadata crosses the HTTP boundary. */
export function mediaHttpError(prefix: 'MEDIA_HTTP' | 'MEDIA_DOWNLOAD_HTTP', response: Response): Error & { retryAfterMs?: number } {
  const raw = response.headers.get('retry-after')?.trim()
  const seconds = raw && /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : undefined
  const date = raw && seconds === undefined ? Date.parse(raw) : NaN
  const retryAfterMs = seconds !== undefined ? seconds * 1000 : Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined
  return Object.assign(new Error(`${prefix}_${response.status}`), typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) ? { retryAfterMs } : {})
}

export function retryableMediaError(error: unknown): boolean {
  return error instanceof TypeError || error instanceof Error && (error.name === 'TimeoutError'
    || /^MEDIA_(RESULT_NOT_READY|DOWNLOAD_NETWORK_ERROR|(?:DOWNLOAD_)?HTTP_(404|408|409|425|429|500|502|503|504))$/.test(error.message))
}

export function mediaRetryAfter(error: unknown): number {
  const value = (error as { retryAfterMs?: unknown } | null)?.retryAfterMs
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}
