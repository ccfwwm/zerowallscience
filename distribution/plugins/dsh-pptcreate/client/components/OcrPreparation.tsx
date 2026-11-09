import * as React from 'react'
import { api, type OcrPreparationStatus } from '../api'
import type { OcrCopy } from '../ocr-locales'

/** Polling only reads state; retries join the Host-owned automatic preparation task. */
export function OcrPreparation({ t }: { t: OcrCopy }) {
  const [status, setStatus] = React.useState<OcrPreparationStatus>()
  const [error, setError] = React.useState(false)
  const [retrying, setRetrying] = React.useState(false)
  React.useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try { const value = await api.ocrStatus(); if (!stopped) { setStatus(value); setError(false) } }
      catch (error) { if (!stopped) setError(true) }
      finally { if (!stopped) timer = setTimeout(() => void poll(), 3000) }
    }
    void poll()
    return () => { stopped = true; clearTimeout(timer) }
  }, [])
  const failed = error || status?.ocr?.phase === 'failed' || status?.status?.phase === 'failed'
  const ready = status?.ocr?.phase === 'ready' && status?.status?.phase === 'ready'
  return <div className="ppt-actions-row" aria-label={t('title')}>
    <span role={failed ? 'alert' : 'status'}>{failed ? t('failed') : ready ? t('ready') : t('pending')}{status?.ocr && status.ocr.totalBytes > 0 && !ready ? ` ${(status.ocr.receivedBytes / 1048576).toFixed(1)} / ${(status.ocr.totalBytes / 1048576).toFixed(1)} MiB` : ''}</span>
    {failed && <button className="ppt-btn" disabled={retrying} onClick={() => {
      setRetrying(true); setError(false)
      void api.retryOcr().then(setStatus, () => setError(true)).finally(() => setRetrying(false))
    }}>{t('retry')}</button>}
  </div>
}
