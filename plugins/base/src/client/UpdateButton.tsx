import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpCircle, CheckCircle2, Download, RefreshCw, X } from 'lucide-react'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.js'
import type { DesktopUpdateStatus, ResourceUpdateStatus } from './desktop-api.js'
import css from './UpdateButton.module.css'

type Props = SidebarFooterActionOwnerProps & PropsLocale<typeof NS>

export function UpdateButton(props: Props) {
  const [status, setStatus] = useState<DesktopUpdateStatus>({ phase: 'idle', currentVersion: '' })
  const [resourceStatus, setResourceStatus] = useState<ResourceUpdateStatus>({ phase: 'idle', updateCount: 0, kinds: {} })
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
    const resourceStatusPromise = api.getResourceUpdateStatus?.()
    void resourceStatusPromise?.then(next => { if (active) setResourceStatus(next) }).catch(() => undefined)
    const unsubscribeResources = api.onResourceUpdateStatus?.(next => { if (active) setResourceStatus(next) })
    return () => { active = false; unsubscribe(); unsubscribeResources?.() }
  }, [api, props.t])

  useEffect(() => {
    const desktopUpdate = status.phase === 'available' || status.phase === 'downloaded'
    const resourcesUpdate = resourceStatus.phase === 'available' && resourceStatus.updateCount > 0
    if (!desktopUpdate && !resourcesUpdate) return
    const key = desktopUpdate ? `${status.phase}:${status.version ?? 'unknown'}` : `resources:${JSON.stringify(resourceStatus.kinds)}`
    if (autoOpened.current === key) return
    autoOpened.current = key
    setOpen(true)
  }, [resourceStatus.checkedAt, resourceStatus.phase, resourceStatus.updateCount, status.phase, status.version])

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
    await Promise.all([api.checkForUpdates().then(setStatus), api.checkResourceUpdates?.().then(setResourceStatus)])
  }, [api])
  const act = async () => {
    if (api === undefined) return
    if (status.phase === 'available') setStatus(await api.downloadUpdate())
    else if (status.phase === 'downloaded') await api.installUpdate()
    else await check()
  }
  const busy = status.phase === 'checking' || status.phase === 'downloading'
  const hasUpdate = status.phase === 'available' || status.phase === 'downloaded'
  const hasResourceUpdate = resourceStatus.phase === 'available' && resourceStatus.updateCount > 0
  const hasAnyUpdate = hasUpdate || hasResourceUpdate
  const title = hasUpdate ? props.t('update.available') : hasResourceUpdate ? props.t('update.resourcesAvailable') : props.t('update.title')
  const triggerLabel = hasAnyUpdate ? props.t('update.newVersion') : props.t('update.trigger')
  const openResources = () => { setOpen(false); window.dispatchEvent(new CustomEvent('zerowall:open-settings', { detail: 'zerowall-extension-center' })) }

  return <>
    {hasAnyUpdate && <button className={css.statusBar} type="button" onClick={() => setOpen(true)} role="status">
      <Download size={16} aria-hidden="true" /><span>{hasUpdate ? props.t('update.versionAvailable', { version: status.version ?? '' }) : props.t('update.resourcesVersionAvailable', { count: resourceStatus.updateCount })}</span><strong>{hasUpdate ? (status.phase === 'downloaded' ? props.t('update.restart') : props.t('update.newVersion')) : props.t('update.viewResources')}</strong>
    </button>}
    <button className={`${css.trigger} ${hasAnyUpdate ? css.triggerAvailable : ''}`} type="button" onClick={() => { setOpen(true); if (!hasAnyUpdate) void check() }} title={triggerLabel} aria-label={triggerLabel} data-update={status.phase}>
      <ArrowUpCircle size={18} aria-hidden="true" />{props.wide && <span>{hasAnyUpdate ? props.t('update.newVersion') : props.t('update.nav')}</span>}
      {hasAnyUpdate && <i aria-hidden="true" />}
    </button>
    {open && createPortal(<div className={css.backdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section className={css.panel} role="dialog" aria-modal="true" aria-labelledby="zerowall-update-title">
        <header><div><p>ZeroWall Science</p><h2 id="zerowall-update-title">{title}</h2></div><button type="button" onClick={() => setOpen(false)} title={props.t('common.close')} aria-label={props.t('common.close')}><X size={18} /></button></header>
        <div className={css.content}>
          <div className={css.icon} data-phase={hasAnyUpdate ? 'available' : status.phase}>{hasAnyUpdate ? <Download size={28} /> : status.phase === 'upToDate' ? <CheckCircle2 size={28} /> : <RefreshCw size={28} />}</div>
          <div className={css.copy}><strong>{hasResourceUpdate && !hasUpdate ? props.t('update.resourcesVersionAvailable', { count: resourceStatus.updateCount }) : statusLine(status, props.t)}</strong><p>{hasResourceUpdate && !hasUpdate ? props.t('update.resourcesDescription') : statusDescription(status, props.t)}</p></div>
          {status.notes !== undefined && status.notes.length > 0 && (
            <div className={css.notes} aria-label={props.t('update.notes')}>
              <strong>{props.t('update.notes')}</strong>
              <ul>{status.notes.map((note, index) => <li key={`${index}:${note}`}>{note}</li>)}</ul>
            </div>
          )}
          {status.phase === 'downloading' && <div className={css.progress} aria-label={props.t('update.progress')}><span style={{ width: `${status.percent ?? 0}%` }} /></div>}
          <dl><div><dt>{props.t('update.current')}</dt><dd>{status.currentVersion || '—'}</dd></div>{hasUpdate && status.version && <div><dt>{props.t('update.latest')}</dt><dd>{status.version}</dd></div>}</dl>
        </div>
        <footer><button className={css.secondary} type="button" onClick={() => setOpen(false)}>{props.t('common.close')}</button>{hasResourceUpdate && <button className={css.primary} type="button" onClick={openResources}>{props.t('update.viewResources')}</button>}{(hasUpdate || !hasResourceUpdate) && <button className={css.primary} type="button" onClick={() => void act()} disabled={busy || status.phase === 'unavailable'}>{actionLabel(status, props.t)}</button>}</footer>
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
