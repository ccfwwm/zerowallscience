import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import type { GithubButtonProps } from './GithubButton.tsx'

/** Read status without starting the WeChat transport. */
export function WechatStatusButton({ wide, t }: GithubButtonProps) {
  const [status, setStatus] = useState<'offline' | 'online' | 'waiting' | 'unavailable'>('offline')
  useEffect(() => {
    const controller = new AbortController()
    const refresh = async () => {
      try {
        const response = await fetch('/wechat/api/status', { signal: controller.signal })
        if (!response.ok) throw new Error('WeChat status unavailable')
        const state = await response.json() as { phase?: string; monitorRunning?: boolean }
        if (!controller.signal.aborted) setStatus(state.phase === 'logged-in' && state.monitorRunning ? 'online' : ['waiting-qr', 'scaned'].includes(state.phase ?? '') ? 'waiting' : 'offline')
      } catch { if (!controller.signal.aborted) setStatus('unavailable') }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 30 * 60_000)
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [])
  const label = `${t('wechat.label')} · ${t(`wechat.${status}`)}`
  return <button type="button" title={label} aria-label={label} onClick={() => window.dispatchEvent(new CustomEvent('zerowall:open-settings', { detail: 'wechat' }))} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '0 8px', border: 0, borderRadius: 8, background: 'transparent', cursor: 'pointer' }}>
    <MessageCircle size={18} aria-hidden="true" />
    {wide && <><span>{t('wechat.label')}</span><small style={{ marginLeft: 'auto', fontWeight: 400, opacity: .75 }}>{t(`wechat.${status}`)}</small></>}
  </button>
}
