import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CircleHelp, X } from 'lucide-react'
import type { AiCloudGroup } from '../shared/types.js'
import { groupRate } from './group-catalog.js'
import { defaultModelText, type ModelText } from './model-locales.js'
import { useFloatingPanel } from './use-floating-panel.js'
import css from './GroupedModelSelect.module.css'

export function RateBadge({ group, t = defaultModelText }: { group?: AiCloudGroup | undefined; t?: ModelText }) {
  return <span className={css.rate} title={t('rate')} aria-label={`${t('rate')}：${groupRate(group) ?? t('unknownRate')}`}>{groupRate(group) ?? t('unknownRate')}</span>
}

export function GroupInfo({ name, group, cloud = true, media = false, t = defaultModelText }: {
  name: string; group?: AiCloudGroup | undefined; cloud?: boolean; media?: boolean; t?: ModelText
}) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const hideTimer = useRef<number>()
  const restoringFocus = useRef(false)
  const id = useId()
  const position = useFloatingPanel(open, anchor, panel)
  const cancelHide = () => { window.clearTimeout(hideTimer.current) }
  const preview = () => { cancelHide(); if (!restoringFocus.current) setOpen(true) }
  const leave = () => {
    cancelHide()
    if (!pinned && document.activeElement !== anchor.current && !panel.current?.contains(document.activeElement)) {
      hideTimer.current = window.setTimeout(() => setOpen(false), 120)
    }
  }
  const blur = (target: EventTarget | null) => {
    if (!pinned && !anchor.current?.contains(target as Node | null) && !panel.current?.contains(target as Node | null)) setOpen(false)
  }
  const close = () => {
    cancelHide(); setOpen(false); setPinned(false)
    restoringFocus.current = true
    anchor.current?.focus()
    restoringFocus.current = false
  }
  useEffect(() => () => window.clearTimeout(hideTimer.current), [])
  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => {
      if (!panel.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) { setOpen(false); setPinned(false) }
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open])
  useEffect(() => {
    if (!pinned) return
    closeButton.current?.focus()
    const timer = window.setTimeout(() => closeButton.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [pinned])
  return <>
    <button ref={anchor} className={css.infoButton} type="button" aria-label={`${t('info')}：${name}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onMouseEnter={preview} onMouseLeave={leave} onFocus={preview} onBlur={event => blur(event.relatedTarget)}
      onKeyDown={event => { if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }}
      onClick={event => { event.preventDefault(); event.stopPropagation(); cancelHide(); if (pinned) close(); else { setOpen(true); setPinned(true) } }}><CircleHelp size={15} aria-hidden="true" /></button>
    {open && createPortal(<div ref={panel} id={id} className={css.infoPanel} style={position} role="dialog" aria-label={`${t('info')}：${name}`} data-zws-group-info="true"
      onMouseEnter={cancelHide} onMouseLeave={leave} onBlur={event => blur(event.relatedTarget)}
      onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); close() } else if (event.key === 'Tab') { event.preventDefault(); closeButton.current?.focus() } }}>
      <header><strong>{name}</strong><button ref={closeButton} className={css.infoButton} type="button" aria-label={t('close')} onClick={close}><X size={16} /></button></header>
      {cloud && <p><span>{t('rate')}：</span><RateBadge group={group} t={t} /></p>}
      <p className={css.description}>{group?.description || t(cloud ? 'noDescription' : 'external')}</p>
      {cloud && <p className={css.help}>{t('billing')}</p>}
      {media && <p className={css.help}>{t('mediaBilling')}</p>}
    </div>, anchor.current?.closest('dialog, [role="dialog"]') ?? document.body)}
  </>
}
