import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import type { GithubButtonProps } from './GithubButton.tsx'
import css from './SidebarFooterAction.module.css'

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
  const connection = status === 'online' ? 'online' : status === 'waiting' ? 'waiting' : 'offline'
  return <button className={css.action} data-zerowall-footer-action data-connection={connection} type="button" title={label} aria-label={label} onClick={() => window.dispatchEvent(new CustomEvent('zerowall:open-settings', { detail: 'wechat' }))}>
    <span data-zerowall-footer-icon><MessageCircle size={18} aria-hidden="true" /><i data-zerowall-footer-status-dot aria-hidden="true" /></span>
    {wide && <span>{t('wechat.label')}</span>}
  </button>
}
