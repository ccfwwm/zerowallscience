import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpCircle, CheckCircle2, Download, RefreshCw, X } from 'lucide-react'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.js'
import type { DesktopUpdateStatus } from './desktop-api.js'
import css from './UpdateButton.module.css'

type Props = SidebarFooterActionOwnerProps & PropsLocale<typeof NS>

export function UpdateButton(props: Props) {
  const [status, setStatus] = useState<DesktopUpdateStatus>({ phase: 'idle', currentVersion: '' })
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  openRef.current = open
  const autoOpened = useRef<string>()
  const api = window.zerowallDesktop

  useEffect(() => {
    if (api === undefined) {
      setStatus({ phase: 'unavailable', currentVersion: '', message: props.t('update.desktopOnly') })
      return
    }
    let active = true
    void api.getUpdateStatus().then(next => { if (active) setStatus(next) }).catch(() => {
      if (active) setStatus({ phase: 'error', currentVersion: '', message: props.t('update.error') })
    })
    const unsubscribe = api.onUpdateStatus(next => { if (active) setStatus(next) })
    return () => { active = false; unsubscribe() }
  }, [api, props.t])

  useEffect(() => {
    if (status.phase !== 'available' && status.phase !== 'downloaded') return
    const key = `${status.phase}:${status.version ?? 'unknown'}`
    if (autoOpened.current === key) return
    autoOpened.current = key
    setOpen(true)
  }, [status.phase, status.version])

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !openRef.current) return
      event.preventDefault()
      event.stopImmediatePropagation()
      setOpen(false)
    }
    window.addEventListener('keydown', close, true)
    return () => window.removeEventListener('keydown', close, true)
  }, [])

  const check = useCallback(async () => {
    if (api === undefined) return
    setStatus(await api.checkForUpdates())
  }, [api])
  const act = async () => {
    if (api === undefined) return
    if (status.phase === 'available') setStatus(await api.downloadUpdate())
    else if (status.phase === 'downloaded') await api.installUpdate()
    else await check()
  }
  const busy = status.phase === 'checking' || status.phase === 'downloading'
  const hasUpdate = status.phase === 'available' || status.phase === 'downloaded'
  const title = hasUpdate ? props.t('update.available') : props.t('update.title')
  const triggerLabel = hasUpdate ? props.t('update.newVersion') : props.t('update.trigger')

  return <>
    {hasUpdate && <button className={css.statusBar} type="button" onClick={() => setOpen(true)} role="status">
      <Download size={16} aria-hidden="true" /><span>{props.t('update.versionAvailable', { version: status.version ?? '' })}</span><strong>{status.phase === 'downloaded' ? props.t('update.restart') : props.t('update.newVersion')}</strong>
    </button>}
    <button className={`${css.trigger} ${hasUpdate ? css.triggerAvailable : ''}`} type="button" onClick={() => { setOpen(true); if (!hasUpdate) void check() }} title={triggerLabel} aria-label={triggerLabel} data-update={status.phase}>
      <ArrowUpCircle size={18} aria-hidden="true" />{props.wide && <span>{hasUpdate ? props.t('update.newVersion') : props.t('update.nav')}</span>}
      {hasUpdate && <i aria-hidden="true" />}
    </button>
    {open && createPortal(<div className={css.backdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section className={css.panel} role="dialog" aria-modal="true" aria-labelledby="zerowall-update-title">
        <header><div><p>ZeroWall Science</p><h2 id="zerowall-update-title">{title}</h2></div><button type="button" onClick={() => setOpen(false)} title={props.t('common.close')} aria-label={props.t('common.close')}><X size={18} /></button></header>
        <div className={css.content}>
          <div className={css.icon} data-phase={status.phase}>{status.phase === 'upToDate' ? <CheckCircle2 size={28} /> : status.phase === 'available' || status.phase === 'downloaded' ? <Download size={28} /> : <RefreshCw size={28} />}</div>
          <div className={css.copy}><strong>{statusLine(status, props.t)}</strong><p>{statusDescription(status, props.t)}</p></div>
          {status.notes !== undefined && status.notes.length > 0 && (
            <div className={css.notes} aria-label={props.t('update.notes')}>
              <strong>{props.t('update.notes')}</strong>
              <ul>{status.notes.map((note, index) => <li key={`${index}:${note}`}>{note}</li>)}</ul>
            </div>
          )}
          {status.phase === 'downloading' && <div className={css.progress} aria-label={props.t('update.progress')}><span style={{ width: `${status.percent ?? 0}%` }} /></div>}
          <dl><div><dt>{props.t('update.current')}</dt><dd>{status.currentVersion || '—'}</dd></div>{status.version && <div><dt>{props.t('update.latest')}</dt><dd>{status.version}</dd></div>}</dl>
        </div>
        <footer><button className={css.secondary} type="button" onClick={() => setOpen(false)}>{props.t('common.close')}</button><button className={css.primary} type="button" onClick={() => void act()} disabled={busy || status.phase === 'unavailable'}>{actionLabel(status, props.t)}</button></footer>
      </section>
    </div>, document.body)}
  </>
}

type Translate = Props['t']
function statusLine(status: DesktopUpdateStatus, t: Translate): string {
  if (status.phase === 'checking') return t('update.checking')
  if (status.phase === 'available') return t('update.versionAvailable', { version: status.version ?? '' })
  if (status.phase === 'downloading') return t('update.downloading', { percent: Math.round(status.percent ?? 0) })
  if (status.phase === 'downloaded') return t('update.ready', { version: status.version ?? '' })
  if (status.phase === 'upToDate') return t('update.upToDate')
  if (status.phase === 'error') return t('update.failed')
  if (status.phase === 'unavailable') return t('update.unavailable')
  return t('update.idle')
}
function statusDescription(status: DesktopUpdateStatus, t: Translate): string { return status.message ?? (status.phase === 'downloaded' ? t('update.restartHint') : t('update.description')) }
function actionLabel(status: DesktopUpdateStatus, t: Translate): string {
  if (status.phase === 'available') return t('update.download')
  if (status.phase === 'downloaded') return t('update.restart')
  if (status.phase === 'checking') return t('update.checking')
  if (status.phase === 'downloading') return t('update.downloadingShort')
  return t('update.checkNow')
}
