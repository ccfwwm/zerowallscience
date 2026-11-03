/** First-run entry; AI platform authentication belongs to the cloud plugin. */
import { useEffect, useRef, useState } from 'react'
import type { WelcomeApi } from '../welcome-api.ts'

/**
 * Open the workspace without offering the upstream provider's authentication.
 * @param props.api - Isolated desktop preload operations and localized copy.
 * @returns Branded entry with a retryable workspace launch.
 */
export function Welcome({ api }: { api: WelcomeApi }) {
  const { messages: m } = api
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    document.documentElement.lang = api.id
    document.title = m.welcomeTitle
    return () => { mounted.current = false }
  }, [api.id, m.welcomeTitle])
  async function enter() {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError(false)
    try { await api.skip() }
    catch { if (mounted.current) setError(true) }
    finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  return <>
    <div className="titlebar" aria-hidden="true" />
    <main className="welcome" aria-labelledby="welcome-heading">
      <img className="brand" src="assets/welcome-brand.svg" alt={m.welcomeBrand} width="472" height="40" />
      <div className="tagline">
        <h1 id="welcome-heading">ZeroWall Science</h1>
        <p>{m.welcomeCloudHint}</p>
        {error && <p id="entry-error" className="key-error" role="alert">{m.welcomeContinueFailed}</p>}
      </div>
      <div className="actions" aria-busy={busy}>
        <button id="zerowall-start" className="primary" type="button" disabled={busy} onClick={() => { void enter() }}>{m.welcomeCloudStart}</button>
      </div>
    </main>
  </>
}
